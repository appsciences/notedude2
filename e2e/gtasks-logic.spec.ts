/**
 * Pure-logic tests for the Google Tasks sync (#138).
 *
 * These run in the Playwright suite but never touch a browser, Firestore, or the network —
 * every module under test is free of side effects and of Firebase imports. The sync's hard
 * parts are all decisions (which tag wins, which side is authoritative, whether a due date
 * means "today"), so they are worth testing where they can be tested exhaustively and fast.
 */
import { test, expect } from "@playwright/test";

import {
  appendTag,
  stripTag,
  withTaskTag,
  withoutTaskTag,
  taskTagOf,
  isArchivedContent,
} from "../src/lib/tags";
import {
  listNameToTag,
  tagToListName,
  isSyncedListName,
} from "../src/lib/gtasks/normalize";
import {
  localDateKey,
  dueDateKey,
  dueValueForLocalDate,
  isDueOnOrBeforeToday,
} from "../src/lib/gtasks/dates";
import {
  resolveTaskTag,
  taskToNoteContent,
  noteToTaskFields,
  dueActionForTag,
} from "../src/lib/gtasks/mapping";
import {
  noteSyncHash,
  taskSyncHash,
  decidePairAction,
  mergeConflict,
} from "../src/lib/gtasks/diff";
import type { GTask } from "../src/lib/gtasks/types";

// A Google task as the API returns it, with only the fields the sync reads.
function task(over: Partial<GTask> = {}): GTask {
  return { id: "t1", title: "Call the vet", status: "needsAction", ...over };
}

// Local-time construction: `new Date(y, mIndex, d)` is timezone-independent by definition,
// which keeps these assertions honest regardless of where the suite runs.
const AUG_4 = new Date(2026, 7, 4, 9, 0);
const AUG_3 = new Date(2026, 7, 3, 9, 0);

// ── Tag arithmetic ────────────────────────────────────────────────────────────────

test.describe("tag arithmetic", () => {
  test("appendTag adds a separating space, except on empty content", () => {
    expect(appendTag("Call the vet", "#tasks-today")).toBe("Call the vet #tasks-today");
    expect(appendTag("", "#tasks-today")).toBe("#tasks-today");
    expect(appendTag("Line one\n", "#tasks-today")).toBe("Line one\n#tasks-today");
  });

  test("stripTag is the exact inverse of appendTag (#118)", () => {
    for (const content of ["Call the vet", "", "Line one\n", "Multi\nline\nnote"]) {
      expect(stripTag(appendTag(content, "#tasks-today"), "#tasks-today")).toBe(content);
    }
  });

  test("withTaskTag replaces an existing task tag rather than appending a second", () => {
    expect(withTaskTag("Call the vet #tasks-inbox", "#tasks-today")).toBe(
      "Call the vet #tasks-today"
    );
    expect(withTaskTag("Call the vet", "#tasks-today")).toBe("Call the vet #tasks-today");
  });

  test("withTaskTag leaves non-task tags alone", () => {
    expect(withTaskTag("Call the vet #work #tasks-inbox", "#tasks-today")).toBe(
      "Call the vet #work #tasks-today"
    );
  });

  test("taskTagOf reads the task tag, ignoring other tags", () => {
    expect(taskTagOf("Call the vet #work #tasks-nearterm")).toBe("#tasks-nearterm");
    expect(taskTagOf("Call the vet #work")).toBeNull();
  });

  test("withoutTaskTag removes the task tag and its separator", () => {
    expect(withoutTaskTag("Call the vet #tasks-today")).toBe("Call the vet");
    expect(withoutTaskTag("Call the vet")).toBe("Call the vet");
  });

  test("isArchivedContent detects the archive tag on a word boundary only", () => {
    expect(isArchivedContent("Note #archived")).toBe(true);
    expect(isArchivedContent("Note #archived-thoughts")).toBe(false);
    expect(isArchivedContent("Note")).toBe(false);
  });
});

// ── List ↔ tag naming ─────────────────────────────────────────────────────────────

test.describe("list name normalization", () => {
  test("lower-cases and replaces spaces with dashes", () => {
    expect(listNameToTag("Tasks Longterm")).toBe("tasks-longterm");
    expect(listNameToTag("Tasks Nearterm")).toBe("tasks-nearterm");
  });

  test("a name already in tag form passes through unchanged", () => {
    expect(listNameToTag("tasks-nearterm")).toBe("tasks-nearterm");
  });

  test("drops punctuation and collapses repeated separators", () => {
    expect(listNameToTag("Tasks: Today")).toBe("tasks-today");
    expect(listNameToTag("Tasks  Longterm")).toBe("tasks-longterm");
    expect(listNameToTag("Tasks - Longterm")).toBe("tasks-longterm");
    expect(listNameToTag("  Tasks Today  ")).toBe("tasks-today");
  });

  test("only tasks-* lists are in scope", () => {
    expect(isSyncedListName("Tasks Today")).toBe(true);
    expect(isSyncedListName("Groceries")).toBe(false);
    // Bare "Tasks" yields "tasks", which has no suffix and is not a task tag.
    expect(isSyncedListName("Tasks")).toBe(false);
  });

  test("tagToListName title-cases for list creation, and round-trips", () => {
    expect(tagToListName("tasks-longterm")).toBe("Tasks Longterm");
    for (const tag of ["tasks-inbox", "tasks-today", "tasks-nearterm", "tasks-longterm"]) {
      expect(listNameToTag(tagToListName(tag))).toBe(tag);
    }
  });
});

// ── Dates ─────────────────────────────────────────────────────────────────────────

test.describe("due dates", () => {
  test("localDateKey reads local calendar parts", () => {
    expect(localDateKey(new Date(2026, 7, 4, 13, 45))).toBe("2026-08-04");
    expect(localDateKey(new Date(2026, 0, 9, 0, 5))).toBe("2026-01-09");
  });

  test("dueDateKey reads the UTC parts, because due is a calendar date at midnight UTC", () => {
    expect(dueDateKey("2026-08-04T00:00:00.000Z")).toBe("2026-08-04");
    expect(dueDateKey(null)).toBeNull();
    expect(dueDateKey(undefined)).toBeNull();
  });

  test("dueValueForLocalDate encodes the local date as midnight UTC", () => {
    // Late-evening local time must still produce that same local calendar date.
    expect(dueValueForLocalDate(new Date(2026, 7, 4, 23, 30))).toBe("2026-08-04T00:00:00.000Z");
  });

  /**
   * The off-by-one this guards: "2026-08-04T00:00:00Z" is 2026-08-03 17:00 local in UTC-7.
   * Comparing instants would call it "yesterday" for every user west of UTC, so the
   * comparison must be on calendar-date strings.
   */
  test("a task due today counts as today regardless of local offset", () => {
    expect(isDueOnOrBeforeToday("2026-08-04T00:00:00.000Z", AUG_4)).toBe(true);
    expect(isDueOnOrBeforeToday("2026-08-04T00:00:00.000Z", AUG_3)).toBe(false);
  });

  test("overdue counts as today; future does not", () => {
    expect(isDueOnOrBeforeToday("2026-08-01T00:00:00.000Z", AUG_4)).toBe(true);
    expect(isDueOnOrBeforeToday("2026-08-05T00:00:00.000Z", AUG_4)).toBe(false);
  });

  test("no due date is never 'today'", () => {
    expect(isDueOnOrBeforeToday(null, AUG_4)).toBe(false);
  });
});

// ── Tag resolution ────────────────────────────────────────────────────────────────

test.describe("resolveTaskTag precedence", () => {
  test("a completed task is #tasks-done, outranking both due date and list", () => {
    const t = task({ status: "completed", due: "2026-08-04T00:00:00.000Z" });
    expect(resolveTaskTag(t, "tasks-nearterm", AUG_4)).toBe("#tasks-done");
  });

  /** The whole point of the due-date rule: Assistant sets due=today instead of the list. */
  test("a task due today is #tasks-today even when it lives in another list", () => {
    const t = task({ due: "2026-08-04T00:00:00.000Z" });
    expect(resolveTaskTag(t, "tasks-nearterm", AUG_4)).toBe("#tasks-today");
  });

  test("an overdue task is #tasks-today", () => {
    const t = task({ due: "2026-07-30T00:00:00.000Z" });
    expect(resolveTaskTag(t, "tasks-longterm", AUG_4)).toBe("#tasks-today");
  });

  test("a task due later keeps its list's tag", () => {
    const t = task({ due: "2026-09-01T00:00:00.000Z" });
    expect(resolveTaskTag(t, "tasks-longterm", AUG_4)).toBe("#tasks-longterm");
  });

  test("a task with no due date keeps its list's tag", () => {
    expect(resolveTaskTag(task(), "tasks-nearterm", AUG_4)).toBe("#tasks-nearterm");
  });
});

// ── Field mapping ─────────────────────────────────────────────────────────────────

test.describe("task ↔ note field mapping", () => {
  test("a pulled task uses the house `Title #tag` convention", () => {
    expect(taskToNoteContent(task(), "#tasks-nearterm")).toBe("Call the vet #tasks-nearterm");
  });

  test("task notes become the body, below the title line", () => {
    const t = task({ notes: "Bring the carrier" });
    expect(taskToNoteContent(t, "#tasks-nearterm")).toBe(
      "Call the vet #tasks-nearterm\nBring the carrier"
    );
  });

  test("an empty task title never yields a tag-only note, which the app would discard", () => {
    expect(taskToNoteContent(task({ title: "" }), "#tasks-inbox")).toBe(
      "Untitled task #tasks-inbox"
    );
  });

  test("the pushed title drops the task tag, since the list encodes it", () => {
    expect(noteToTaskFields("Call the vet #tasks-nearterm")).toEqual({
      title: "Call the vet",
      notes: "",
    });
  });

  test("the pushed title preserves non-task tags, so nothing is lost", () => {
    expect(noteToTaskFields("Call the vet #work #tasks-nearterm")).toEqual({
      title: "Call the vet #work",
      notes: "",
    });
  });

  test("lines below the first become task notes verbatim", () => {
    expect(noteToTaskFields("Call the vet #tasks-nearterm\nBring the carrier\nAsk about food")).toEqual({
      title: "Call the vet",
      notes: "Bring the carrier\nAsk about food",
    });
  });

  test("pull then push round-trips without drift", () => {
    const original = task({ notes: "Bring the carrier" });
    const content = taskToNoteContent(original, "#tasks-nearterm");
    expect(noteToTaskFields(content)).toEqual({
      title: original.title,
      notes: original.notes,
    });
  });
});

// ── Due-date push (the oscillation fix) ───────────────────────────────────────────

test.describe("dueActionForTag", () => {
  test("#tasks-today sets a due date of today", () => {
    expect(dueActionForTag("#tasks-today", null, AUG_4)).toEqual({
      kind: "set",
      due: "2026-08-04T00:00:00.000Z",
    });
  });

  test("#tasks-today with today's due date already set is left alone", () => {
    expect(dueActionForTag("#tasks-today", "2026-08-04T00:00:00.000Z", AUG_4)).toEqual({
      kind: "keep",
    });
  });

  /**
   * Without this, retagging a due-today task to #tasks-nearterm leaves due=today in place,
   * and the very next pull resolves it back to #tasks-today — forever. See #138.
   */
  test("retagging away from today clears a due date that is on or before today", () => {
    expect(dueActionForTag("#tasks-nearterm", "2026-08-04T00:00:00.000Z", AUG_4)).toEqual({
      kind: "clear",
    });
    expect(dueActionForTag("#tasks-nearterm", "2026-07-28T00:00:00.000Z", AUG_4)).toEqual({
      kind: "clear",
    });
  });

  test("a future due date is never touched", () => {
    expect(dueActionForTag("#tasks-nearterm", "2026-09-01T00:00:00.000Z", AUG_4)).toEqual({
      kind: "keep",
    });
  });

  test("a task with no due date and no today tag needs no change", () => {
    expect(dueActionForTag("#tasks-nearterm", null, AUG_4)).toEqual({ kind: "keep" });
  });

  test("#tasks-done leaves the due date as it is", () => {
    expect(dueActionForTag("#tasks-done", "2026-08-04T00:00:00.000Z", AUG_4)).toEqual({
      kind: "keep",
    });
  });
});

// ── Change detection ──────────────────────────────────────────────────────────────

test.describe("change detection", () => {
  test("the note hash covers title, body and tag", () => {
    const base = noteSyncHash("Call the vet #tasks-nearterm");
    expect(noteSyncHash("Call the vet #tasks-nearterm")).toBe(base);
    expect(noteSyncHash("Call the dentist #tasks-nearterm")).not.toBe(base);
    expect(noteSyncHash("Call the vet #tasks-today")).not.toBe(base);
    expect(noteSyncHash("Call the vet #tasks-nearterm\nBring carrier")).not.toBe(base);
  });

  test("the task hash covers title, notes, status and due", () => {
    const base = taskSyncHash(task());
    expect(taskSyncHash(task())).toBe(base);
    expect(taskSyncHash(task({ title: "Call the dentist" }))).not.toBe(base);
    expect(taskSyncHash(task({ status: "completed" }))).not.toBe(base);
    expect(taskSyncHash(task({ due: "2026-08-04T00:00:00.000Z" }))).not.toBe(base);
    expect(taskSyncHash(task({ notes: "Bring carrier" }))).not.toBe(base);
  });

  const link = { taskId: "t1", listId: "l1", noteHash: "N", taskHash: "T", lastSyncedAt: 0 };

  test("neither side moved → nothing to do", () => {
    expect(
      decidePairAction({ link, noteHash: "N", taskHash: "T", noteUpdatedAt: 1, taskUpdatedAt: 1 })
    ).toEqual({ kind: "noop" });
  });

  test("only the note moved → push", () => {
    expect(
      decidePairAction({ link, noteHash: "N2", taskHash: "T", noteUpdatedAt: 2, taskUpdatedAt: 1 })
    ).toEqual({ kind: "push" });
  });

  test("only the task moved → pull", () => {
    expect(
      decidePairAction({ link, noteHash: "N", taskHash: "T2", noteUpdatedAt: 1, taskUpdatedAt: 2 })
    ).toEqual({ kind: "pull" });
  });

  test("both moved → conflict, resolved last-write-wins", () => {
    expect(
      decidePairAction({ link, noteHash: "N2", taskHash: "T2", noteUpdatedAt: 5, taskUpdatedAt: 2 })
    ).toEqual({ kind: "conflict", winner: "note" });
    expect(
      decidePairAction({ link, noteHash: "N2", taskHash: "T2", noteUpdatedAt: 2, taskUpdatedAt: 5 })
    ).toEqual({ kind: "conflict", winner: "task" });
  });
});

// ── Conflict merge ────────────────────────────────────────────────────────────────

test.describe("conflict merge", () => {
  test("the losing text is preserved under a #sync-conflict marker, never dropped", () => {
    const merged = mergeConflict("Call the vet #tasks-today", "Call the dentist");
    expect(merged).toContain("Call the vet #tasks-today");
    expect(merged).toContain("#sync-conflict");
    expect(merged).toContain("Call the dentist");
  });

  test("identical text on both sides needs no conflict block", () => {
    expect(mergeConflict("Call the vet #tasks-today", "Call the vet")).toBe(
      "Call the vet #tasks-today"
    );
  });
});
