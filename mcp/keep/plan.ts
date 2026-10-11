import { canonical, contentHash, fromKeep } from "./convert.ts";
import { syncScope } from "./scope.ts";
import type { PlanInput, SyncOp } from "./types.ts";

/**
 * The whole sync decision, as a pure function. See spec.md § Change detection.
 *
 * Every I/O concern lives in sync.ts; this file only diffs three inputs into a
 * list of operations, which is what makes the awkward cases — conflicts, scope
 * changes, the duplication loops — testable without touching a network.
 */
export function planSync({ notes, keepNotes, mappings, onLeaveScope }: PlanInput): SyncOp[] {
  /** Keep → notedude. Planned first: importing is non-destructive, pushing is not. */
  const pull: SyncOp[] = [];
  /** notedude → Keep. */
  const push: SyncOp[] = [];
  /** Reports. Ordering irrelevant, so they trail the plan. */
  const reports: SyncOp[] = [];

  const notesById = new Map(notes.map((n) => [n.id, n]));
  const keepByName = new Map(keepNotes.map((k) => [k.name, k]));
  const mappedNoteIds = new Set(mappings.map((m) => m.noteId));
  // Includes tombstones — see the unlink handling below for why that matters.
  const mappedKeepNames = new Set(mappings.map((m) => m.keepName));

  // ── existing pairs ───────────────────────────────────────────────────────────
  for (const m of mappings) {
    const note = notesById.get(m.noteId);
    const keepNote = keepByName.get(m.keepName);
    const liveKeep = keepNote && !keepNote.trashed ? keepNote : undefined;
    const scope = note ? syncScope(note.content) : undefined;

    // A tombstoned pair stays dormant until the note re-enters scope.
    if (m.unlinked) {
      if (!note || !scope?.inScope) continue;
      const content = canonical(note.content);
      push.push(
        liveKeep
          ? { kind: "replace-keep", noteId: m.noteId, keepName: m.keepName, content }
          : { kind: "create-keep", noteId: m.noteId, content }
      );
      continue;
    }

    // The note is gone, or no longer belongs in Keep.
    if (!note || !scope?.inScope) {
      // Outgrowing Keep's cap is not leaving scope — the pair is still ours, the
      // note just cannot fit right now. Unlinking here would orphan a live note.
      if (note && scope?.reason === "too-large") {
        reports.push({ kind: "skip", noteId: m.noteId, keepName: m.keepName, reason: "too-large" });
        continue;
      }
      // Deleting is opt-in: notes.delete is irreversible, so the safe default
      // leaves the Keep note in place and remembers not to re-import it.
      push.push({
        kind: "unlink",
        noteId: m.noteId,
        keepName: m.keepName,
        // Attachments are unrecoverable, so they override the delete policy.
        deleteKeep: onLeaveScope === "delete" && !!liveKeep && !liveKeep.hasAttachments,
      });
      continue;
    }

    // Deleted or trashed in Keep → soft-archive locally, matching Shift+Y.
    if (!liveKeep) {
      pull.push({ kind: "archive-notedude", noteId: m.noteId, keepName: m.keepName });
      continue;
    }

    const content = canonical(note.content);
    const keepContent = fromKeep(liveKeep);
    const localHash = contentHash(content);
    const remoteHash = contentHash(keepContent);
    const localChanged = localHash !== m.baseHash;
    const remoteChanged = remoteHash !== m.baseHash;

    if (!localChanged && !remoteChanged) continue;

    if (localChanged && !remoteChanged) {
      // Replacing means delete + recreate, and the API cannot re-upload media, so
      // pushing over an attachment would destroy it with no way back.
      if (liveKeep.hasAttachments) {
        reports.push({ kind: "skip", noteId: m.noteId, keepName: m.keepName, reason: "has-attachments" });
        continue;
      }
      push.push({ kind: "replace-keep", noteId: m.noteId, keepName: m.keepName, content });
      continue;
    }

    if (!localChanged && remoteChanged) {
      pull.push({ kind: "update-notedude", noteId: m.noteId, keepName: m.keepName, content: keepContent });
      continue;
    }

    // Both sides moved. Landing on the same text is convergence, not a conflict —
    // there is nothing to write, only a stale merge base to advance.
    if (localHash === remoteHash) {
      push.push({ kind: "rebase", noteId: m.noteId, keepName: m.keepName, content });
      continue;
    }

    // Resolving a conflict also replaces the Keep note. Rather than destroy an
    // attachment, leave both sides untouched and report until a human resolves it.
    if (liveKeep.hasAttachments) {
      reports.push({ kind: "skip", noteId: m.noteId, keepName: m.keepName, reason: "has-attachments" });
      continue;
    }

    push.push({
      kind: "conflict",
      noteId: m.noteId,
      keepName: m.keepName,
      content,
      conflictContent: keepContent,
    });
  }

  // ── notes with no Keep counterpart ───────────────────────────────────────────
  for (const n of notes) {
    if (mappedNoteIds.has(n.id)) continue;
    const scope = syncScope(n.content);
    if (scope.inScope) {
      push.push({ kind: "create-keep", noteId: n.id, content: canonical(n.content) });
    } else if (scope.reason === "too-large") {
      // Only genuine failures are reported; a #tasks-* note not syncing is by design.
      reports.push({ kind: "skip", noteId: n.id, reason: "too-large" });
    }
  }

  // ── Keep notes with no notedude counterpart ──────────────────────────────────
  for (const k of keepNotes) {
    // Tombstones are consulted here. Skipping this check lets an unlinked Keep
    // note be re-imported as a new note, which unlinks again next run, which
    // re-imports again — the pair multiplies on every sync.
    if (mappedKeepNames.has(k.name) || k.trashed) continue;
    const content = fromKeep(k);
    const scope = syncScope(content);
    if (scope.inScope) {
      pull.push({ kind: "create-notedude", keepName: k.name, content });
    } else if (scope.reason === "too-large") {
      reports.push({ kind: "skip", keepName: k.name, reason: "too-large" });
    }
    // A Keep note that would land out of scope (e.g. it contains #tasks-today) is
    // deliberately not imported: it would unlink on the next run and orphan itself.
  }

  return [...pull, ...push, ...reports];
}
