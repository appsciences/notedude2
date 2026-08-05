import { contentHash, toKeep } from "./convert.ts";
import type { KeepClient, NoteStore, SyncOp } from "./types.ts";

/**
 * Executes a plan. See spec.md § Constraints imposed by the Keep API.
 *
 * The ordering rules here are the whole safety story, because `notes.delete` is
 * irreversible and there is no update method:
 *
 *  1. The replacement Keep note is created **before** the old one is deleted, so
 *     an interrupted run leaves a duplicate rather than a hole.
 *  2. The mapping is repointed at the new note **before** the delete, so a crash
 *     between the two never leaves the mapping aimed at a deleted note.
 *  3. A conflict's losing content is written to notedude **before** the Keep note
 *     holding it is destroyed.
 */

export interface ApplyResult {
  applied: SyncOp[];
  /** Operations that threw, with the failure. The run continues past them. */
  failed: { op: SyncOp; error: string }[];
  skipped: SyncOp[];
}

/** Append a tag the way the app does, so the result is a well-formed note. */
function appendTag(content: string, tag: string): string {
  const sep = content.endsWith("\n") || content === "" ? "" : " ";
  return content + sep + tag;
}

export async function applyOps(
  ops: SyncOp[],
  keep: KeepClient,
  store: NoteStore
): Promise<ApplyResult> {
  const applied: SyncOp[] = [];
  const failed: { op: SyncOp; error: string }[] = [];
  const skipped: SyncOp[] = [];

  /** Create in Keep, point the mapping at it, then remove the superseded note. */
  const replace = async (noteId: string, oldKeepName: string, content: string) => {
    const { title, body } = toKeep(content);
    const created = await keep.createNote(title, body);
    await store.saveMapping({
      noteId,
      keepName: created.name,
      baseHash: contentHash(content),
      lastSyncedAt: Date.now(),
    });
    await keep.deleteNote(oldKeepName);
  };

  for (const op of ops) {
    try {
      switch (op.kind) {
        case "skip":
          skipped.push(op);
          continue;

        case "create-keep": {
          const { title, body } = toKeep(op.content);
          const created = await keep.createNote(title, body);
          await store.saveMapping({
            noteId: op.noteId,
            keepName: created.name,
            baseHash: contentHash(op.content),
            lastSyncedAt: Date.now(),
          });
          break;
        }

        case "replace-keep":
          await replace(op.noteId, op.keepName, op.content);
          break;

        case "create-notedude": {
          const noteId = await store.createNote(op.content);
          await store.saveMapping({
            noteId,
            keepName: op.keepName,
            baseHash: contentHash(op.content),
            lastSyncedAt: Date.now(),
          });
          break;
        }

        case "update-notedude":
          await store.updateNote(op.noteId, op.content);
          await store.saveMapping({
            noteId: op.noteId,
            keepName: op.keepName,
            baseHash: contentHash(op.content),
            lastSyncedAt: Date.now(),
          });
          break;

        case "conflict":
          // Preserve the losing version first — after the replace below, the Keep
          // note holding it is permanently gone.
          await store.createNote(appendTag(op.conflictContent, "#sync-conflict"));
          await replace(op.noteId, op.keepName, op.content);
          break;

        case "rebase":
          // Both sides already agree; only the stale merge base needs moving.
          await store.saveMapping({
            noteId: op.noteId,
            keepName: op.keepName,
            baseHash: contentHash(op.content),
            lastSyncedAt: Date.now(),
          });
          break;

        case "archive-notedude":
          await store.archiveNote(op.noteId);
          await store.markUnlinked(op.noteId, true);
          break;

        case "unlink":
          if (op.deleteKeep) await keep.deleteNote(op.keepName);
          await store.markUnlinked(op.noteId, op.deleteKeep);
          break;
      }
      applied.push(op);
    } catch (err) {
      // One bad note must not abandon the rest of the run.
      failed.push({ op, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { applied, failed, skipped };
}
