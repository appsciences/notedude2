import { test } from "node:test";
import assert from "node:assert/strict";
import { NoteJournal, SaveTracker, errorCode, MAX_NOTE_LENGTH, type KV } from "./saveSync.ts";

// Save reliability (#76, #198): the journal keeps unacknowledged content on the device, and
// the tracker turns write promises into a status the mode line can show.

function memoryStorage(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

const note = (id: string, content: string) => ({
  id,
  content,
  pinned: false,
  tagPinned: false,
  createdAt: 1,
});

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const fsError = (code: string) => Object.assign(new Error(code), { code });

test("the limit matches the security rules' cap", () => {
  assert.equal(MAX_NOTE_LENGTH, 100_000);
});

test("journal: put, get and all are scoped to the user", () => {
  const s = memoryStorage();
  const a = new NoteJournal(s, "alice");
  const b = new NoteJournal(s, "bob");
  a.put(note("n1", "hello"));
  b.put(note("n2", "other"));
  assert.equal(a.get("n1")?.content, "hello");
  assert.equal(a.get("n2"), null);
  assert.deepEqual(a.all().map((e) => e.id), ["n1"]);
  assert.deepEqual(b.all().map((e) => e.id), ["n2"]);
});

test("journal: ack removes the entry only for the acknowledged revision", () => {
  const j = new NoteJournal(memoryStorage(), "u");
  const first = j.put(note("n1", "v1"));
  const second = j.put(note("n1", "v2"));
  assert.notEqual(first.rev, second.rev);
  j.ack("n1", first.rev); // a stale ack must not drop newer text
  assert.equal(j.get("n1")?.content, "v2");
  j.ack("n1", second.rev);
  assert.equal(j.get("n1"), null);
});

test("journal: only the tab that wrote (or replayed) an entry owns it", () => {
  const s = memoryStorage();
  const tabA = new NoteJournal(s, "u");
  const tabB = new NoteJournal(s, "u");
  const e = tabA.put(note("n1", "from A"));
  assert.equal(tabA.ownsUnsynced("n1"), true);
  assert.equal(tabB.ownsUnsynced("n1"), false); // B must not sit on stale text for A's edit
  tabB.claim("n1");
  assert.equal(tabB.ownsUnsynced("n1"), true);
  tabA.ack("n1", e.rev);
  assert.equal(tabA.ownsUnsynced("n1"), false);
  assert.equal(tabB.ownsUnsynced("n1"), false); // acknowledged elsewhere
});

test("journal: remove drops the entry unconditionally", () => {
  const j = new NoteJournal(memoryStorage(), "u");
  j.put(note("n1", "v1"));
  j.remove("n1");
  assert.equal(j.has("n1"), false);
});

test("journal: a broken or missing storage falls back to memory instead of throwing", () => {
  const throwing: KV = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("denied"); },
    key: () => { throw new Error("denied"); },
    get length(): number { throw new Error("denied"); },
  };
  for (const s of [throwing, null]) {
    const j = new NoteJournal(s, "u");
    assert.doesNotThrow(() => j.put(note("n1", "x")));
    assert.equal(j.get("n1")?.content, "x");
    assert.deepEqual(j.all().map((e) => e.id), ["n1"]);
    j.remove("n1");
    assert.equal(j.get("n1"), null);
  }
});

test("journal: records when the edit was made", () => {
  const j = new NoteJournal(memoryStorage(), "u", () => 1234);
  assert.equal(j.put(note("n1", "x")).editedAt, 1234);
});

test("errorCode reads Firestore's code, falling back to unknown", () => {
  assert.equal(errorCode(fsError("permission-denied")), "permission-denied");
  assert.equal(errorCode(new Error("x")), "unknown");
  assert.equal(errorCode(undefined), "unknown");
});

test("tracker: an acknowledged write leaves nothing to report", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  const ok = await t.run("content:n1", async () => {});
  assert.equal(ok, true);
  assert.equal(t.status(true, 0).state, "saved");
  assert.equal(await t.whenSettled("content:n1"), true);
});

test("tracker: a rejected write is reported, with its code, and retried", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  let fail = true;
  let calls = 0;
  const op = async () => {
    calls++;
    if (fail) throw fsError("permission-denied");
  };
  assert.equal(await t.run("content:n1", op), false);
  const s = t.status(true, 0);
  assert.equal(s.state, "error");
  assert.equal(s.code, "permission-denied");
  assert.match(s.message, /couldn't save/);
  assert.equal(await t.whenSettled("content:n1"), false);

  fail = false;
  await t.retryFailed();
  assert.equal(calls, 2);
  assert.equal(t.status(true, 0).state, "saved");
});

test("tracker: a newer write supersedes an older one that fails late", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  const older = deferred();
  const a = t.run("content:n1", () => older.promise);
  const b = t.run("content:n1", async () => {});
  await b;
  older.reject(fsError("unavailable"));
  await a;
  assert.equal(t.status(true, 0).state, "saved");
});

test("tracker: the latest write failing is a failure even if an older one succeeded", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  await t.run("content:n1", async () => {});
  await t.run("content:n1", async () => { throw fsError("invalid-argument"); });
  assert.equal(t.status(true, 0).state, "error");
});

test("tracker: a new write to a failed target clears the failure once acknowledged", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  await t.run("content:n1", async () => { throw fsError("unavailable"); });
  await t.run("content:n1", async () => {});
  assert.equal(t.status(true, 0).state, "saved");
});

test("tracker: dropOn codes are not kept for retry", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  await t.run("pin:n1", async () => { throw fsError("not-found"); }, { dropOn: ["not-found"] });
  assert.equal(t.status(true, 0).state, "saved");
});

test("tracker: pending while offline reads as saved offline, not as an error", () => {
  const t = new SaveTracker({ scheduleRetries: false, now: () => 0 });
  void t.run("content:n1", () => new Promise<void>(() => {}));
  const s = t.status(false, 0);
  assert.equal(s.state, "offline");
  assert.match(s.message, /will sync/);
});

test("tracker: pending online says nothing until it has taken a while", () => {
  const t = new SaveTracker({ scheduleRetries: false, now: () => 0 });
  void t.run("content:n1", () => new Promise<void>(() => {}));
  assert.equal(t.status(true, 500).state, "saved");
  assert.equal(t.status(true, 2500).state, "saving");
});

test("tracker: whenSettled waits for the in-flight write", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  const d = deferred();
  void t.run("content:n1", () => d.promise);
  let settled: boolean | null = null;
  const w = t.whenSettled("content:n1").then((v) => { settled = v; });
  await Promise.resolve();
  assert.equal(settled, null);
  d.resolve();
  await w;
  assert.equal(settled, true);
});

test("tracker: too-long outranks everything and names the length", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  await t.run("content:n2", async () => { throw fsError("unavailable"); });
  t.markTooLong("n1", 100_123);
  const s = t.status(false, 0);
  assert.equal(s.state, "too-long");
  assert.match(s.message, /100123\/100000/);
  assert.equal(await t.whenSettled("content:n1"), false);
  t.clearTooLong("n1");
  assert.equal(t.status(true, 0).state, "error");
});

test("tracker: forget drops a note's failure and too-long flag (discard / delete)", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  await t.run("content:n1", async () => { throw fsError("unavailable"); });
  t.markTooLong("n1", 200_000);
  t.forget("content:n1");
  t.clearTooLong("n1");
  assert.equal(t.status(true, 0).state, "saved");
});

test("tracker: listeners hear every change", async () => {
  const t = new SaveTracker({ scheduleRetries: false });
  let n = 0;
  const off = t.subscribe(() => n++);
  await t.run("content:n1", async () => {});
  assert.ok(n >= 2); // started + settled
  off();
  const before = n;
  await t.run("content:n1", async () => {});
  assert.equal(n, before);
});
