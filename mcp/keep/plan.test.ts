import { test } from "node:test";
import assert from "node:assert/strict";
import { contentHash, toKeep } from "./convert.ts";
import { planSync } from "./plan.ts";
import type { KeepNote, NotedudeNote, SyncMapping, SyncOp } from "./types.ts";

// ── builders ───────────────────────────────────────────────────────────────────

function note(id: string, content: string, updatedAt = 1000): NotedudeNote {
  return { id, content, updatedAt };
}

/** A Keep note holding `content`, so tests can talk in notedude terms throughout. */
function keep(name: string, content: string, extra: Partial<KeepNote> = {}): KeepNote {
  const { title, body } = toKeep(content);
  return { name, title, body, updateTime: 1000, trashed: false, ...extra };
}

/** A mapping whose merge base is `baseContent` — i.e. both sides last agreed on it. */
function mapping(noteId: string, keepName: string, baseContent: string, extra: Partial<SyncMapping> = {}): SyncMapping {
  return { noteId, keepName, baseHash: contentHash(baseContent), lastSyncedAt: 1000, ...extra };
}

function plan(
  notes: NotedudeNote[],
  keepNotes: KeepNote[],
  mappings: SyncMapping[],
  onLeaveScope: "unlink" | "delete" = "unlink"
): SyncOp[] {
  return planSync({ notes, keepNotes, mappings, onLeaveScope });
}

function kinds(ops: SyncOp[]): string[] {
  return ops.map((o) => o.kind);
}

function only<K extends SyncOp["kind"]>(ops: SyncOp[], kind: K): Extract<SyncOp, { kind: K }>[] {
  return ops.filter((o) => o.kind === kind) as Extract<SyncOp, { kind: K }>[];
}

// ── first sync ─────────────────────────────────────────────────────────────────

test("a new notedude note is created in Keep", () => {
  const ops = plan([note("n1", "Buy milk")], [], []);
  assert.deepEqual(kinds(ops), ["create-keep"]);
  assert.deepEqual(only(ops, "create-keep")[0], { kind: "create-keep", noteId: "n1", content: "Buy milk" });
});

test("a new Keep note is created in notedude", () => {
  const ops = plan([], [keep("notes/k1", "From Keep")], []);
  assert.deepEqual(only(ops, "create-notedude")[0], {
    kind: "create-notedude",
    keepName: "notes/k1",
    content: "From Keep",
  });
});

test("a #tasks-* note is never pushed to Keep and is not reported as a skip", () => {
  // Out-of-scope-by-design is not news; only genuine failures are reported.
  assert.deepEqual(plan([note("n1", "Call vet #tasks-today")], [], []), []);
});

test("an oversized note is reported rather than silently dropped", () => {
  const ops = plan([note("n1", "x".repeat(30_000))], [], []);
  assert.deepEqual(kinds(ops), ["skip"]);
  assert.equal(only(ops, "skip")[0].reason, "too-large");
  assert.equal(only(ops, "skip")[0].noteId, "n1");
});

// ── steady state ───────────────────────────────────────────────────────────────

test("an unchanged pair produces no operations", () => {
  const ops = plan([note("n1", "Buy milk")], [keep("notes/k1", "Buy milk")], [mapping("n1", "notes/k1", "Buy milk")]);
  assert.deepEqual(ops, []);
});

test("a trailing-newline-only difference is not a change", () => {
  const ops = plan(
    [note("n1", "Buy milk\n")],
    [keep("notes/k1", "Buy milk")],
    [mapping("n1", "notes/k1", "Buy milk")]
  );
  assert.deepEqual(ops, []);
});

// ── one-sided changes ──────────────────────────────────────────────────────────

test("a notedude edit replaces the Keep note", () => {
  const ops = plan(
    [note("n1", "Buy oat milk")],
    [keep("notes/k1", "Buy milk")],
    [mapping("n1", "notes/k1", "Buy milk")]
  );
  assert.deepEqual(only(ops, "replace-keep")[0], {
    kind: "replace-keep",
    noteId: "n1",
    keepName: "notes/k1",
    content: "Buy oat milk",
  });
});

test("a notedude edit that outgrows Keep's cap is reported, and the Keep note is left alone", () => {
  const ops = plan(
    [note("n1", "x".repeat(30_000))],
    [keep("notes/k1", "Buy milk")],
    [mapping("n1", "notes/k1", "Buy milk")]
  );
  assert.deepEqual(kinds(ops), ["skip"]);
  assert.equal(only(ops, "skip")[0].reason, "too-large");
});

test("a Keep edit updates the notedude note", () => {
  const ops = plan(
    [note("n1", "Buy milk")],
    [keep("notes/k1", "Buy oat milk")],
    [mapping("n1", "notes/k1", "Buy milk")]
  );
  assert.deepEqual(only(ops, "update-notedude")[0], {
    kind: "update-notedude",
    noteId: "n1",
    keepName: "notes/k1",
    content: "Buy oat milk",
  });
});

// ── conflicts ──────────────────────────────────────────────────────────────────

test("both sides changed: notedude wins and Keep's version is preserved", () => {
  const ops = plan(
    [note("n1", "notedude version")],
    [keep("notes/k1", "keep version")],
    [mapping("n1", "notes/k1", "base")]
  );
  assert.deepEqual(only(ops, "conflict")[0], {
    kind: "conflict",
    noteId: "n1",
    keepName: "notes/k1",
    content: "notedude version",
    conflictContent: "keep version",
  });
});

test("both sides changed to the same content is a rebase, not a conflict", () => {
  const ops = plan(
    [note("n1", "same new text")],
    [keep("notes/k1", "same new text")],
    [mapping("n1", "notes/k1", "base")]
  );
  assert.deepEqual(kinds(ops), ["rebase"]);
});

// ── deletion ───────────────────────────────────────────────────────────────────

test("a note deleted in Keep is archived in notedude, never hard-deleted", () => {
  const ops = plan([note("n1", "Buy milk")], [], [mapping("n1", "notes/k1", "Buy milk")]);
  assert.deepEqual(only(ops, "archive-notedude")[0], {
    kind: "archive-notedude",
    noteId: "n1",
    keepName: "notes/k1",
  });
});

test("a note trashed in Keep is treated as deleted", () => {
  const ops = plan(
    [note("n1", "Buy milk")],
    [keep("notes/k1", "Buy milk", { trashed: true })],
    [mapping("n1", "notes/k1", "Buy milk")]
  );
  assert.deepEqual(kinds(ops), ["archive-notedude"]);
});

// ── leaving scope ──────────────────────────────────────────────────────────────

test("gaining a #tasks-* tag unlinks the pair without deleting the Keep note by default", () => {
  const ops = plan(
    [note("n1", "Buy milk #tasks-today")],
    [keep("notes/k1", "Buy milk")],
    [mapping("n1", "notes/k1", "Buy milk")]
  );
  assert.deepEqual(only(ops, "unlink")[0], {
    kind: "unlink",
    noteId: "n1",
    keepName: "notes/k1",
    deleteKeep: false,
  });
});

test("--on-leave-scope=delete opts in to removing the Keep note", () => {
  const ops = plan(
    [note("n1", "Buy milk #tasks-today")],
    [keep("notes/k1", "Buy milk")],
    [mapping("n1", "notes/k1", "Buy milk")],
    "delete"
  );
  assert.equal(only(ops, "unlink")[0].deleteKeep, true);
});

test("archiving in notedude unlinks rather than deleting from Keep", () => {
  const ops = plan(
    [note("n1", "Buy milk #archived")],
    [keep("notes/k1", "Buy milk")],
    [mapping("n1", "notes/k1", "Buy milk")]
  );
  assert.deepEqual(kinds(ops), ["unlink"]);
});

test("a notedude note deleted outright unlinks its Keep counterpart", () => {
  const ops = plan([], [keep("notes/k1", "Buy milk")], [mapping("n1", "notes/k1", "Buy milk")]);
  assert.deepEqual(kinds(ops), ["unlink"]);
});

// ── the duplication loop these tombstones exist to prevent ─────────────────────

test("an unlinked Keep note is not re-imported, which would duplicate it forever", () => {
  // Without the tombstone: unlink leaves the Keep note orphaned, the next run sees a
  // Keep note with no mapping, imports it as new, and the pair multiplies each run.
  const ops = plan([], [keep("notes/k1", "Buy milk")], [mapping("n1", "notes/k1", "Buy milk", { unlinked: true })]);
  assert.deepEqual(ops, []);
});

test("a Keep note whose content would be out of scope is not imported", () => {
  // Importing it would create an out-of-scope notedude note, which unlinks on the
  // next run, orphaning the Keep note — the same loop from the other direction.
  const ops = plan([], [keep("notes/k1", "Call vet #tasks-today")], []);
  assert.deepEqual(ops, []);
});

test("an oversized Keep note is reported rather than imported silently", () => {
  const ops = plan([], [keep("notes/k1", "x".repeat(30_000))], []);
  assert.deepEqual(kinds(ops), ["skip"]);
  assert.equal(only(ops, "skip")[0].keepName, "notes/k1");
});

test("a blank Keep note is ignored", () => {
  assert.deepEqual(plan([], [keep("notes/k1", "")], []), []);
});

// ── re-entering scope ──────────────────────────────────────────────────────────

test("dropping the #tasks-* tag relinks to the existing Keep note", () => {
  const ops = plan(
    [note("n1", "Buy milk again")],
    [keep("notes/k1", "Buy milk")],
    [mapping("n1", "notes/k1", "Buy milk", { unlinked: true })]
  );
  assert.deepEqual(only(ops, "replace-keep")[0], {
    kind: "replace-keep",
    noteId: "n1",
    keepName: "notes/k1",
    content: "Buy milk again",
  });
});

test("re-entering scope after the Keep note was deleted creates a fresh one", () => {
  const ops = plan(
    [note("n1", "Buy milk")],
    [],
    [mapping("n1", "notes/k1", "Buy milk", { unlinked: true, keepDeleted: true })]
  );
  assert.deepEqual(kinds(ops), ["create-keep"]);
});

test("an unlinked pair that stays out of scope produces nothing", () => {
  const ops = plan(
    [note("n1", "Buy milk #tasks-today")],
    [keep("notes/k1", "Buy milk")],
    [mapping("n1", "notes/k1", "Buy milk", { unlinked: true })]
  );
  assert.deepEqual(ops, []);
});

// ── attachments are unrecoverable ──────────────────────────────────────────────

test("a local edit is never pushed over a Keep note with attachments", () => {
  // Replacing means delete + recreate, and the API has no media upload — the
  // attachment would be destroyed with no way to restore it.
  const ops = plan(
    [note("n1", "Edited locally")],
    [keep("notes/k1", "base", { hasAttachments: true })],
    [mapping("n1", "notes/k1", "base")]
  );
  assert.deepEqual(kinds(ops), ["skip"]);
  assert.equal(only(ops, "skip")[0].reason, "has-attachments");
});

test("a conflict on a note with attachments is reported, not resolved destructively", () => {
  const ops = plan(
    [note("n1", "notedude version")],
    [keep("notes/k1", "keep version", { hasAttachments: true })],
    [mapping("n1", "notes/k1", "base")]
  );
  assert.deepEqual(kinds(ops), ["skip"]);
  assert.equal(only(ops, "skip")[0].reason, "has-attachments");
});

test("attachments override --on-leave-scope=delete", () => {
  const ops = plan(
    [note("n1", "Buy milk #tasks-today")],
    [keep("notes/k1", "Buy milk", { hasAttachments: true })],
    [mapping("n1", "notes/k1", "Buy milk")],
    "delete"
  );
  assert.equal(only(ops, "unlink")[0].deleteKeep, false);
});

test("a remote edit still flows into notedude when the Keep note has attachments", () => {
  // Only pushes are dangerous; pulling from an attachment note destroys nothing.
  const ops = plan(
    [note("n1", "base")],
    [keep("notes/k1", "Edited in Keep", { hasAttachments: true })],
    [mapping("n1", "notes/k1", "base")]
  );
  assert.deepEqual(kinds(ops), ["update-notedude"]);
});

// ── ordering guarantees ────────────────────────────────────────────────────────

test("imports are planned before pushes so a partial run never strands Keep content", () => {
  const ops = plan(
    [note("n2", "New local note")],
    [keep("notes/k1", "New remote note")],
    []
  );
  const importIdx = ops.findIndex((o) => o.kind === "create-notedude");
  const pushIdx = ops.findIndex((o) => o.kind === "create-keep");
  assert.ok(importIdx !== -1 && pushIdx !== -1);
  assert.ok(importIdx < pushIdx, "pull operations must be planned before push operations");
});

// ── mixed workload ─────────────────────────────────────────────────────────────

test("a mixed run plans each note independently", () => {
  const ops = plan(
    [
      note("n1", "Unchanged"),
      note("n2", "Locally edited"),
      note("n3", "Untouched here"),
      note("n4", "Brand new"),
      note("n5", "Task note #tasks-inbox"),
    ],
    [
      keep("notes/k1", "Unchanged"),
      keep("notes/k2", "Locally edited base"),
      keep("notes/k3", "Remotely edited"),
      keep("notes/k9", "New in Keep"),
    ],
    [
      mapping("n1", "notes/k1", "Unchanged"),
      mapping("n2", "notes/k2", "Locally edited base"),
      mapping("n3", "notes/k3", "Untouched here"),
    ]
  );
  assert.equal(only(ops, "replace-keep").length, 1);
  assert.equal(only(ops, "replace-keep")[0].noteId, "n2");
  assert.equal(only(ops, "update-notedude").length, 1);
  assert.equal(only(ops, "update-notedude")[0].noteId, "n3");
  assert.equal(only(ops, "create-keep").length, 1);
  assert.equal(only(ops, "create-keep")[0].noteId, "n4");
  assert.equal(only(ops, "create-notedude").length, 1);
  assert.equal(only(ops, "create-notedude")[0].keepName, "notes/k9");
  assert.equal(only(ops, "conflict").length, 0);
});

test("planning is idempotent — replanning the same state yields the same plan", () => {
  const notes = [note("n1", "Locally edited")];
  const keeps = [keep("notes/k1", "base")];
  const maps = [mapping("n1", "notes/k1", "base")];
  assert.deepEqual(plan(notes, keeps, maps), plan(notes, keeps, maps));
});
