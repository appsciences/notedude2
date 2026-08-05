import { test } from "node:test";
import assert from "node:assert/strict";
import { canonical, contentHash, fromKeep, listToText, toKeep } from "./convert.ts";

test("first line becomes the Keep title, the rest the body", () => {
  assert.deepEqual(toKeep("Shopping\nmilk\neggs"), { title: "Shopping", body: "milk\neggs" });
});

test("a single-line note has an empty body", () => {
  assert.deepEqual(toKeep("Buy milk"), { title: "Buy milk", body: "" });
});

test("fromKeep rejoins title and body", () => {
  assert.equal(fromKeep({ title: "Shopping", body: "milk\neggs" }), "Shopping\nmilk\neggs");
});

test("fromKeep omits the separator when the body is empty", () => {
  assert.equal(fromKeep({ title: "Buy milk", body: "" }), "Buy milk");
});

test("an empty title round-trips (a note may start with a blank line)", () => {
  assert.equal(fromKeep(toKeep("\nbody")), "\nbody");
});

test("canonical form is idempotent — the property the merge base relies on", () => {
  for (const c of ["Buy milk", "Shopping\nmilk\neggs", "\nbody", "Title\n", "a\n\n\nb", ""]) {
    assert.equal(canonical(canonical(c)), canonical(c), `not idempotent for ${JSON.stringify(c)}`);
  }
});

test("a trailing newline canonicalises away so it is not misread as a change every run", () => {
  assert.equal(canonical("Buy milk\n"), canonical("Buy milk"));
  assert.equal(contentHash("Buy milk\n"), contentHash("Buy milk"));
});

test("interior blank lines are preserved — only the round-trip loss is normalised", () => {
  assert.equal(canonical("Title\n\nbody"), "Title\n\nbody");
});

test("different content hashes differently", () => {
  assert.notEqual(contentHash("Buy milk"), contentHash("Buy eggs"));
});

test("hashing is stable across calls", () => {
  assert.equal(contentHash("Shopping\nmilk"), contentHash("Shopping\nmilk"));
});

test("Keep checklists render as markdown checkboxes", () => {
  const text = listToText([
    { text: { text: "milk" }, checked: false },
    { text: { text: "eggs" }, checked: true },
  ]);
  assert.equal(text, "- [ ] milk\n- [x] eggs");
});

test("checklist rendering survives an empty list", () => {
  assert.equal(listToText([]), "");
});

test("checklist rendering tolerates missing text", () => {
  assert.equal(listToText([{ checked: false }]), "- [ ] ");
});
