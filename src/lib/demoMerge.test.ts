import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeDemoNotes, type DemoNote } from "./demoMerge.ts";

// Demo tabs share one localStorage array (#216). Each tab merges its own changes onto what is
// stored, against the version it last read, instead of writing its whole array over it.

const n = (id: string, content: string, extra: Partial<DemoNote> = {}): DemoNote => ({
  id,
  content,
  pinned: false,
  tagPinned: false,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const byId = (notes: DemoNote[]) => Object.fromEntries(notes.map((x) => [x.id, x.content]));

test("an edit to a different note in another tab survives", () => {
  const base = [n("a", "A base"), n("b", "B base")];
  const stored = [n("a", "A base A update", { updatedAt: 2 }), n("b", "B base")];
  const mine = [n("a", "A base"), n("b", "B base B update", { updatedAt: 3 })];
  const { merged, conflicts } = mergeDemoNotes(base, mine, stored);
  assert.deepEqual(byId(merged), { a: "A base A update", b: "B base B update" });
  assert.deepEqual(conflicts, []);
});

test("a note created in another tab is kept, and so is mine", () => {
  const base = [n("a", "A")];
  const { merged } = mergeDemoNotes(base, [n("a", "A"), n("mine", "M")], [n("a", "A"), n("theirs", "T")]);
  assert.deepEqual(byId(merged), { a: "A", mine: "M", theirs: "T" });
});

test("a deletion in either tab sticks when the other tab did not touch the note", () => {
  const base = [n("a", "A"), n("b", "B")];
  assert.deepEqual(byId(mergeDemoNotes(base, [n("b", "B")], base).merged), { b: "B" });
  assert.deepEqual(byId(mergeDemoNotes(base, base, [n("b", "B")]).merged), { b: "B" });
});

test("deleting a note another tab has since edited keeps the edit", () => {
  const base = [n("a", "A")];
  const { merged } = mergeDemoNotes(base, [], [n("a", "A edited", { updatedAt: 2 })]);
  assert.deepEqual(byId(merged), { a: "A edited" });
});

test("an edit to a note another tab has since deleted keeps the edit", () => {
  const base = [n("a", "A")];
  const { merged } = mergeDemoNotes(base, [n("a", "A edited", { updatedAt: 2 })], []);
  assert.deepEqual(byId(merged), { a: "A edited" });
});

test("both tabs editing the same note keep both versions, mine in place", () => {
  const base = [n("a", "note")];
  const stored = [n("a", "note FIRST_TAB", { updatedAt: 2 })];
  const mine = [n("a", "note SECOND_TAB", { updatedAt: 3 })];
  const { merged, conflicts } = mergeDemoNotes(base, mine, stored, () => "copy1");
  assert.equal(merged.find((x) => x.id === "a")?.content, "note SECOND_TAB");
  assert.equal(merged.find((x) => x.id === "copy1")?.content, "note FIRST_TAB");
  assert.deepEqual(conflicts, [{ id: "a", copyId: "copy1" }]);
});

test("identical changes in both tabs are not a conflict", () => {
  const base = [n("a", "x")];
  const same = [n("a", "y", { updatedAt: 2 })];
  const { merged, conflicts } = mergeDemoNotes(base, same, same);
  assert.deepEqual(byId(merged), { a: "y" });
  assert.deepEqual(conflicts, []);
});

test("a pin change counts as a change", () => {
  const base = [n("a", "A"), n("b", "B")];
  const stored = [n("a", "A", { pinned: true }), n("b", "B")];
  const mine = [n("a", "A"), n("b", "B", { pinned: true })];
  const { merged } = mergeDemoNotes(base, mine, stored);
  assert.deepEqual(merged.map((x) => [x.id, x.pinned]).sort(), [["a", true], ["b", true]]);
});

test("notes in `keep` stay as mine even when only the other tab changed them", () => {
  // The note open in the editor: its text must not change under the caret.
  const base = [n("a", "A")];
  const { merged } = mergeDemoNotes(base, [n("a", "A")], [n("a", "A theirs", { updatedAt: 2 })], undefined, new Set(["a"]));
  assert.deepEqual(byId(merged), { a: "A" });
});

test("nothing changed anywhere returns the stored notes", () => {
  const base = [n("a", "A"), n("b", "B")];
  const { merged, conflicts } = mergeDemoNotes(base, base, base);
  assert.deepEqual(byId(merged), { a: "A", b: "B" });
  assert.deepEqual(conflicts, []);
});
