import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps } from "./apply.ts";
import { contentHash } from "./convert.ts";
import type { KeepClient, KeepNote, NoteStore, SyncMapping } from "./types.ts";

/**
 * These tests exist for one reason: `notes.delete` is irreversible and there is
 * no update method, so the *order* of calls is the only thing standing between
 * a sync and permanent data loss. They assert on a single call log.
 */

interface Harness {
  keep: KeepClient;
  store: NoteStore;
  log: string[];
  mappings: SyncMapping[];
  notes: Map<string, string>;
}

function harness(opts: { failCreate?: boolean; failDelete?: boolean } = {}): Harness {
  const log: string[] = [];
  const mappings: SyncMapping[] = [];
  const notes = new Map<string, string>();
  let seq = 0;

  const keep: KeepClient = {
    async listNotes(): Promise<KeepNote[]> {
      return [];
    },
    async createNote(title, body) {
      if (opts.failCreate) {
        log.push("keep.create:FAIL");
        throw new Error("keep create failed");
      }
      const name = `notes/new${++seq}`;
      log.push(`keep.create:${name}:${title}`);
      return { name, title, body, updateTime: 1, trashed: false };
    },
    async deleteNote(name) {
      if (opts.failDelete) {
        log.push(`keep.delete:${name}:FAIL`);
        throw new Error("keep delete failed");
      }
      log.push(`keep.delete:${name}`);
    },
  };

  const store: NoteStore = {
    async listNotes() {
      return [];
    },
    async listMappings() {
      return mappings;
    },
    async createNote(content) {
      const id = `nd${++seq}`;
      notes.set(id, content);
      log.push(`store.create:${id}:${content.split("\n")[0]}`);
      return id;
    },
    async updateNote(noteId, content) {
      notes.set(noteId, content);
      log.push(`store.update:${noteId}`);
    },
    async archiveNote(noteId) {
      log.push(`store.archive:${noteId}`);
    },
    async saveMapping(m) {
      const i = mappings.findIndex((x) => x.noteId === m.noteId);
      if (i === -1) mappings.push(m);
      else mappings[i] = m;
      log.push(`store.map:${m.noteId}->${m.keepName}`);
    },
    async markUnlinked(noteId, keepDeleted) {
      log.push(`store.unlink:${noteId}:${keepDeleted}`);
    },
  };

  return { keep, store, log, mappings, notes };
}

// ── the create-before-delete guarantee ─────────────────────────────────────────

test("replace creates the new Keep note before deleting the old one", () => {
  return (async () => {
    const h = harness();
    await applyOps(
      [{ kind: "replace-keep", noteId: "n1", keepName: "notes/old", content: "Updated" }],
      h.keep,
      h.store
    );
    assert.deepEqual(h.log, [
      "keep.create:notes/new1:Updated",
      "store.map:n1->notes/new1",
      "keep.delete:notes/old",
    ]);
  })();
});

test("the mapping is repointed before the delete, so a crash never orphans it", async () => {
  const h = harness();
  await applyOps(
    [{ kind: "replace-keep", noteId: "n1", keepName: "notes/old", content: "Updated" }],
    h.keep,
    h.store
  );
  const mapIdx = h.log.indexOf("store.map:n1->notes/new1");
  const delIdx = h.log.indexOf("keep.delete:notes/old");
  assert.ok(mapIdx !== -1 && delIdx !== -1);
  assert.ok(mapIdx < delIdx, "mapping must be saved before the old note is deleted");
});

test("a failed create never reaches the delete — the original survives", async () => {
  const h = harness({ failCreate: true });
  const res = await applyOps(
    [{ kind: "replace-keep", noteId: "n1", keepName: "notes/old", content: "Updated" }],
    h.keep,
    h.store
  );
  assert.equal(res.failed.length, 1);
  assert.ok(!h.log.some((l) => l.startsWith("keep.delete")), "must not delete after a failed create");
});

test("a failed delete leaves a duplicate, not a hole, and the mapping points at the live note", async () => {
  const h = harness({ failDelete: true });
  const res = await applyOps(
    [{ kind: "replace-keep", noteId: "n1", keepName: "notes/old", content: "Updated" }],
    h.keep,
    h.store
  );
  assert.equal(res.failed.length, 1);
  assert.equal(h.mappings[0].keepName, "notes/new1");
  assert.equal(h.mappings[0].baseHash, contentHash("Updated"));
});

// ── conflict ordering ──────────────────────────────────────────────────────────

test("a conflict preserves Keep's version before destroying the note holding it", async () => {
  const h = harness();
  await applyOps(
    [
      {
        kind: "conflict",
        noteId: "n1",
        keepName: "notes/old",
        content: "notedude wins",
        conflictContent: "keep version",
      },
    ],
    h.keep,
    h.store
  );
  const savedIdx = h.log.findIndex((l) => l.startsWith("store.create:"));
  const delIdx = h.log.indexOf("keep.delete:notes/old");
  assert.ok(savedIdx !== -1, "the losing version must be written to notedude");
  assert.ok(savedIdx < delIdx, "it must be written before the Keep note is deleted");
});

test("the conflict copy is tagged #sync-conflict so it never syncs back", async () => {
  const h = harness();
  await applyOps(
    [
      {
        kind: "conflict",
        noteId: "n1",
        keepName: "notes/old",
        content: "notedude wins",
        conflictContent: "keep version",
      },
    ],
    h.keep,
    h.store
  );
  const copy = [...h.notes.values()].find((c) => c.includes("keep version"));
  assert.equal(copy, "keep version #sync-conflict");
});

// ── remaining operations ───────────────────────────────────────────────────────

test("create-keep records a mapping with the content hash as merge base", async () => {
  const h = harness();
  await applyOps([{ kind: "create-keep", noteId: "n1", content: "Buy milk" }], h.keep, h.store);
  assert.deepEqual(h.mappings[0], {
    noteId: "n1",
    keepName: "notes/new1",
    baseHash: contentHash("Buy milk"),
    lastSyncedAt: h.mappings[0].lastSyncedAt,
  });
});

test("create-notedude maps the new local note to the Keep note", async () => {
  const h = harness();
  await applyOps([{ kind: "create-notedude", keepName: "notes/k1", content: "From Keep" }], h.keep, h.store);
  assert.equal(h.mappings[0].keepName, "notes/k1");
  assert.equal(h.mappings[0].baseHash, contentHash("From Keep"));
});

test("archive-notedude soft-archives and tombstones, never deleting from Keep", async () => {
  const h = harness();
  await applyOps([{ kind: "archive-notedude", noteId: "n1", keepName: "notes/k1" }], h.keep, h.store);
  assert.deepEqual(h.log, ["store.archive:n1", "store.unlink:n1:true"]);
});

test("unlink without deleteKeep leaves the Keep note untouched", async () => {
  const h = harness();
  await applyOps([{ kind: "unlink", noteId: "n1", keepName: "notes/k1", deleteKeep: false }], h.keep, h.store);
  assert.deepEqual(h.log, ["store.unlink:n1:false"]);
});

test("unlink with deleteKeep removes the Keep note", async () => {
  const h = harness();
  await applyOps([{ kind: "unlink", noteId: "n1", keepName: "notes/k1", deleteKeep: true }], h.keep, h.store);
  assert.deepEqual(h.log, ["keep.delete:notes/k1", "store.unlink:n1:true"]);
});

test("rebase writes only the mapping — no note is touched on either side", async () => {
  const h = harness();
  await applyOps([{ kind: "rebase", noteId: "n1", keepName: "notes/k1", content: "same" }], h.keep, h.store);
  assert.deepEqual(h.log, ["store.map:n1->notes/k1"]);
});

test("skip performs no writes and is reported back", async () => {
  const h = harness();
  const res = await applyOps([{ kind: "skip", noteId: "n1", reason: "too-large" }], h.keep, h.store);
  assert.deepEqual(h.log, []);
  assert.equal(res.skipped.length, 1);
  assert.equal(res.applied.length, 0);
});

// ── resilience ─────────────────────────────────────────────────────────────────

test("one failing operation does not abandon the rest of the run", async () => {
  const h = harness({ failCreate: true });
  const res = await applyOps(
    [
      { kind: "create-keep", noteId: "n1", content: "will fail" },
      { kind: "unlink", noteId: "n2", keepName: "notes/k2", deleteKeep: false },
    ],
    h.keep,
    h.store
  );
  assert.equal(res.failed.length, 1);
  assert.equal(res.applied.length, 1);
  assert.equal(res.applied[0].kind, "unlink");
});
