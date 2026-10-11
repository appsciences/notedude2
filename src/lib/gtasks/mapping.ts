/**
 * Field mapping between a Google task and a notedude note. See #138.
 */
import { withoutTaskTag } from "../tags";
import { dueDateKey, dueValueForLocalDate, isDueOnOrBeforeToday, localDateKey } from "./dates";
import type { GTask } from "./types";

export const DONE_TAG = "#tasks-done";
export const TODAY_TAG = "#tasks-today";

/** A task with an empty title would otherwise yield a tag-only note, which the app discards. */
export const UNTITLED = "Untitled task";

/**
 * Which tag a task should carry, in precedence order:
 *
 *   1. completed              → #tasks-done
 *   2. due on or before today → #tasks-today
 *   3. otherwise              → the tag derived from its list
 *
 * Rule 2 exists because Gemini Assistant, told "tasks today", sets a due date of today rather
 * than filing to the Tasks Today list. Overdue counts as today so nothing rots unseen.
 */
export function resolveTaskTag(task: GTask, listTag: string, now: Date): string {
  if (task.status === "completed") return DONE_TAG;
  if (isDueOnOrBeforeToday(task.due, now)) return TODAY_TAG;
  return `#${listTag}`;
}

/** A pulled task, written in the house `Title #tag` convention. */
export function taskToNoteContent(task: GTask, tag: string): string {
  const title = task.title.trim() || UNTITLED;
  const body = task.notes?.trim() ? `\n${task.notes}` : "";
  return `${title} ${tag}${body}`;
}

/**
 * A note, projected onto the task fields. The task tag is dropped from the title because the
 * list already encodes it; every other tag is preserved, so the projection loses nothing.
 */
export function noteToTaskFields(content: string): { title: string; notes: string } {
  const lines = content.split("\n");
  return {
    title: withoutTaskTag(lines[0]).trim(),
    notes: lines.slice(1).join("\n"),
  };
}

export type DueAction = { kind: "set"; due: string } | { kind: "clear" } | { kind: "keep" };

/**
 * What to do with a task's due date when pushing the note's tag.
 *
 * The clearing branch is what stops the two systems oscillating. Retagging a due-today task to
 * #tasks-nearterm has to remove the due date, or resolveTaskTag pulls it straight back to
 * #tasks-today on the next pass, forever. Only a due date that would trigger that rule is
 * cleared — a future due date is the user's and is never touched.
 */
export function dueActionForTag(
  tag: string,
  currentDue: string | null | undefined,
  now: Date
): DueAction {
  if (tag === TODAY_TAG) {
    return dueDateKey(currentDue) === localDateKey(now)
      ? { kind: "keep" }
      : { kind: "set", due: dueValueForLocalDate(now) };
  }
  // Completion outranks the due date in resolveTaskTag, so a done task cannot oscillate and
  // its due date is left as the user set it.
  if (tag === DONE_TAG) return { kind: "keep" };
  return isDueOnOrBeforeToday(currentDue, now) ? { kind: "clear" } : { kind: "keep" };
}
