/**
 * Change detection and conflict resolution for the Google Tasks sync (#138).
 */
import { taskTagOf } from "../tags";
import { dueDateKey } from "./dates";
import { noteToTaskFields } from "./mapping";
import type { GTask, SyncLink } from "./types";

export const CONFLICT_TAG = "#sync-conflict";

/** FNV-1a. Not cryptographic — this only has to be stable, cheap and dependency-free. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Hashes only what crosses the boundary. Edits the sync cannot represent — a pin, a tag-pin —
 * leave the hash alone and so do not provoke a pointless round trip.
 */
export function noteSyncHash(content: string): string {
  const { title, notes } = noteToTaskFields(content);
  return hash([title, notes, taskTagOf(content) ?? ""].join("\u0000"));
}

/** Due is hashed by calendar date, so a same-day time change is not a change. */
export function taskSyncHash(task: GTask): string {
  return hash(
    [task.title ?? "", task.notes ?? "", task.status, dueDateKey(task.due) ?? ""].join("\u0000")
  );
}

export type PairAction =
  | { kind: "noop" }
  | { kind: "push" }
  | { kind: "pull" }
  | { kind: "conflict"; winner: "note" | "task" };

/**
 * Which way a linked pair should move, by comparing both sides against the hashes stored at
 * the last successful sync. A conflict resolves last-write-wins; the loser's text is not
 * discarded but folded in by mergeConflict.
 */
export function decidePairAction(input: {
  link: SyncLink;
  noteHash: string;
  taskHash: string;
  noteUpdatedAt: number;
  taskUpdatedAt: number;
}): PairAction {
  const noteMoved = input.noteHash !== input.link.noteHash;
  const taskMoved = input.taskHash !== input.link.taskHash;

  if (!noteMoved && !taskMoved) return { kind: "noop" };
  if (noteMoved && !taskMoved) return { kind: "push" };
  if (!noteMoved && taskMoved) return { kind: "pull" };

  return {
    kind: "conflict",
    winner: input.noteUpdatedAt >= input.taskUpdatedAt ? "note" : "task",
  };
}

/**
 * Folds the losing side of a conflict into the winning note under a #sync-conflict marker.
 *
 * Last-write-wins alone would delete text the user wrote on the losing side. #75 and #76 are
 * both open data-loss bugs; a sync that can silently drop a sentence would be a third.
 */
export function mergeConflict(winningContent: string, losingText: string): string {
  const losing = losingText.trim();
  if (!losing || winningContent.includes(losing)) return winningContent;
  return `${winningContent}\n\n${CONFLICT_TAG}\n${losing}`;
}
