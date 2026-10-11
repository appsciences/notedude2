import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  MAX_CONTENT_LENGTH,
  backupFilename,
  buildBackup,
  importSummary,
  parseBackup,
  planImport,
  serializeBackup,
  type BackupNote,
} from "./backup.ts";

// Export / Import (#16). The pure half of the feature: everything here must work with no
// React, Firebase or DOM, so the Claude-artifact port (#201) can reuse it unchanged.

const note = (over: Partial<BackupNote> = {}): BackupNote => ({
  id: "n1",
  content: "Groceries #shopping #home\nmilk",
  pinned: false,
  tagPinned: false,
  createdAt: 1000,
  updatedAt: 2000,
  ...over,
});

const fileWith = (notes: unknown, over: Record<string, unknown> = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: "2026-10-02T00:00:00.000Z", notes, ...over });

function rejects(text: string, pattern: RegExp) {
  assert.throws(() => parseBackup(text), (err: unknown) => {
    assert.ok(err instanceof BackupError, "throws a BackupError");
    assert.match((err as Error).message, pattern);
    return true;
  });
}

// --- export -------------------------------------------------------------------------

test("buildBackup wraps every note in a versioned envelope", () => {
  const now = new Date("2026-10-02T14:03:00.000Z");
  const b = buildBackup([note(), note({ id: "n2", content: "Old #archived", pinned: true, tagPinned: true })], now);
  assert.equal(b.format, "notedude-backup");
  assert.equal(b.version, 1);
  assert.equal(b.exportedAt, "2026-10-02T14:03:00.000Z");
  assert.equal(b.notes.length, 2);
  assert.deepEqual(b.notes[1], { id: "n2", content: "Old #archived", pinned: true, tagPinned: true, createdAt: 1000, updatedAt: 2000 });
});

test("buildBackup keeps only the persisted fields and drops untouched drafts", () => {
  const b = buildBackup([
    { ...note(), isNew: false, extra: "x" } as BackupNote,
    { ...note({ id: "draft", content: " #shopping" }), isNew: true } as BackupNote,
  ]);
  assert.deepEqual(b.notes.map((n) => n.id), ["n1"]);
  assert.deepEqual(Object.keys(b.notes[0]).sort(), ["content", "createdAt", "id", "pinned", "tagPinned", "updatedAt"]);
});

test("buildBackup orders notes oldest first, so diffs between backups stay readable", () => {
  const b = buildBackup([note({ id: "b", createdAt: 5 }), note({ id: "a", createdAt: 1 })]);
  assert.deepEqual(b.notes.map((n) => n.id), ["a", "b"]);
});

test("backupFilename uses the local date", () => {
  assert.equal(backupFilename(new Date(2026, 0, 5, 23, 59)), "notedude-2026-01-05.json");
});

test("an export parses back to the same notes, tags included", () => {
  const notes = [note(), note({ id: "n2", content: "Tasks #tasks-today #archived", pinned: true })];
  const back = parseBackup(serializeBackup(buildBackup(notes)));
  assert.deepEqual(back.notes, notes);
  assert.deepEqual(back.notes[0].content.match(/#[\w-]+/g), ["#shopping", "#home"]);
});

// --- validation ---------------------------------------------------------------------

test("rejects text that is not JSON", () => rejects("not json{", /not a notedude backup/));
test("rejects JSON that is not an object", () => rejects("[1,2]", /not a notedude backup/));
test("rejects an unknown format", () => rejects(fileWith([], { format: "evernote" }), /not a notedude backup/));
test("rejects an unknown version with a clear message", () => rejects(fileWith([], { version: 2 }), /unsupported backup version 2/));
test("rejects a missing notes array", () => rejects(fileWith("nope"), /notes/));

test("rejects a malformed note and names its position", () => {
  rejects(fileWith([note(), { ...note({ id: "n2" }), pinned: "yes" }]), /note 2/);
  rejects(fileWith([{ ...note(), content: 5 }]), /note 1/);
  rejects(fileWith([{ ...note(), createdAt: "yesterday" }]), /note 1/);
  rejects(fileWith([{ ...note(), updatedAt: null }]), /note 1/);
  rejects(fileWith([{ ...note(), tagPinned: undefined }]), /note 1/);
  rejects(fileWith([null]), /note 1/);
});

test("rejects ids Firestore cannot store", () => {
  for (const id of ["", "a/b", ".", "..", "x".repeat(1501)]) rejects(fileWith([note({ id })]), /note 1/);
  rejects(fileWith([{ ...note(), id: 42 }]), /note 1/);
});

test("enforces the 100,000-character content limit from firestore.rules", () => {
  assert.equal(MAX_CONTENT_LENGTH, 100_000);
  assert.equal(parseBackup(fileWith([note({ content: "a".repeat(100_000) })])).notes.length, 1);
  rejects(fileWith([note({ content: "a".repeat(100_001) })]), /100,000/);
});

test("drops unknown note keys so only whitelisted fields are ever written", () => {
  const parsed = parseBackup(fileWith([{ ...note(), owner: "evil", isNew: true }]));
  assert.deepEqual(Object.keys(parsed.notes[0]).sort(), ["content", "createdAt", "id", "pinned", "tagPinned", "updatedAt"]);
});

test("accepts an empty backup", () => {
  assert.deepEqual(parseBackup(fileWith([])).notes, []);
});

// --- merge --------------------------------------------------------------------------

let counter = 0;
const freshId = () => `fresh-${++counter}`;

test("notes not yet present are imported under their own id", () => {
  const plan = planImport([note({ id: "other" })], [note()], freshId);
  assert.deepEqual(plan.toWrite, [note()]);
  assert.equal(plan.imported, 1);
  assert.equal(plan.skipped, 0);
});

test("same id with identical content is skipped", () => {
  const plan = planImport([note({ pinned: true, updatedAt: 9 })], [note()], freshId);
  assert.deepEqual(plan.toWrite, []);
  assert.equal(plan.skipped, 1);
});

test("same id with different content is kept as a new note, never overwriting", () => {
  counter = 0;
  const incoming = note({ content: "Groceries #shopping\neggs" });
  const plan = planImport([note()], [incoming], freshId);
  assert.equal(plan.toWrite.length, 1);
  assert.deepEqual(plan.toWrite[0], { ...incoming, id: "fresh-1" });
  assert.equal(plan.imported, 1);
  assert.equal(plan.renamed, 1);
});

test("duplicates within the file itself are handled the same way", () => {
  counter = 0;
  const plan = planImport([], [note(), note(), note({ content: "changed" })], freshId);
  assert.deepEqual(plan.toWrite.map((n) => n.id), ["n1", "fresh-1"]);
  assert.equal(plan.skipped, 1);
});

test("a fresh id never collides with an existing one", () => {
  const ids = ["n1", "dup"];
  let i = 0;
  const plan = planImport([note(), note({ id: "dup" })], [note({ content: "other" })], () => ids[i++] ?? "unique");
  assert.equal(plan.toWrite[0].id, "unique");
});

test("importing the same backup twice is a no-op the second time", () => {
  const notes = [note(), note({ id: "n2", content: "b" })];
  const first = planImport([], notes, freshId);
  const second = planImport(first.toWrite, notes, freshId);
  assert.equal(second.imported, 0);
  assert.equal(second.skipped, 2);
});

test("importSummary reports imported and skipped counts", () => {
  assert.equal(importSummary({ toWrite: [], imported: 3, skipped: 0, renamed: 0 }), "imported 3 notes");
  assert.equal(importSummary({ toWrite: [], imported: 1, skipped: 0, renamed: 0 }), "imported 1 note");
  assert.equal(importSummary({ toWrite: [], imported: 3, skipped: 2, renamed: 0 }), "imported 3, skipped 2 duplicates");
  assert.equal(importSummary({ toWrite: [], imported: 0, skipped: 1, renamed: 0 }), "imported 0, skipped 1 duplicate");
});
