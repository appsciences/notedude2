import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_BODY_MAX, KEEP_TITLE_MAX, syncScope } from "./scope.ts";

test("plain notes are in scope", () => {
  assert.equal(syncScope("Buy milk").inScope, true);
  assert.equal(syncScope("Shopping\nmilk, eggs").inScope, true);
});

test("notes tagged #tasks-* are out of scope — they belong to Google Tasks (#138)", () => {
  for (const tag of ["#tasks-inbox", "#tasks-today", "#tasks-nearterm", "#tasks-longterm", "#tasks-done"]) {
    const r = syncScope(`Call the vet ${tag}`);
    assert.equal(r.inScope, false, `${tag} should be out of scope`);
    assert.equal(r.reason, "task-tagged");
  }
});

test("a task tag anywhere in the content takes the note out of scope", () => {
  assert.equal(syncScope("line one\nline two #tasks-today\nline three").inScope, false);
});

test("bare #tasks is not a task tag, matching the app's /#tasks-[\\w-]+/", () => {
  // The app's TASK_TAG_RE requires at least one character after the hyphen.
  // Documented in spec.md so the rule is a decision, not an accident.
  assert.equal(syncScope("Groceries #tasks").inScope, true);
});

test("#tasks- with no suffix is likewise not a task tag", () => {
  assert.equal(syncScope("Groceries #tasks-").inScope, true);
});

test("tag matching is case-insensitive", () => {
  assert.equal(syncScope("Call the vet #TASKS-Today").inScope, false);
});

test("a tag that merely starts with the same letters is not a task tag", () => {
  assert.equal(syncScope("Note #tasksomething").inScope, true);
  assert.equal(syncScope("Note #taskstoday").inScope, true);
});

test("archived notes are out of scope", () => {
  const r = syncScope("Old note #archived");
  assert.equal(r.inScope, false);
  assert.equal(r.reason, "archived");
});

test("conflict copies are out of scope so they are never pushed back to Keep", () => {
  const r = syncScope("Keep's version #sync-conflict");
  assert.equal(r.inScope, false);
  assert.equal(r.reason, "conflict-copy");
});

test("blank notes are out of scope", () => {
  assert.equal(syncScope("").inScope, false);
  assert.equal(syncScope("   \n  ").inScope, false);
  assert.equal(syncScope("").reason, "blank");
});

test("a note whose title exceeds Keep's cap is out of scope and reported", () => {
  const r = syncScope("t".repeat(KEEP_TITLE_MAX + 1));
  assert.equal(r.inScope, false);
  assert.equal(r.reason, "too-large");
});

test("a title exactly at Keep's cap is allowed", () => {
  assert.equal(syncScope("t".repeat(KEEP_TITLE_MAX)).inScope, true);
});

test("a note whose body exceeds Keep's cap is out of scope and reported, never truncated", () => {
  const r = syncScope("Title\n" + "b".repeat(KEEP_BODY_MAX + 1));
  assert.equal(r.inScope, false);
  assert.equal(r.reason, "too-large");
});

test("a body exactly at Keep's cap is allowed", () => {
  assert.equal(syncScope("Title\n" + "b".repeat(KEEP_BODY_MAX)).inScope, true);
});

test("size is the last check, so a task-tagged oversized note reports task-tagged", () => {
  // Reporting "too-large" for a note that was never meant to sync would be noise.
  const r = syncScope("#tasks-today " + "b".repeat(KEEP_BODY_MAX + 1));
  assert.equal(r.reason, "task-tagged");
});
