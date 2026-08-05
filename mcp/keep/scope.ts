import { toKeep } from "./convert.ts";

/**
 * Which notes sync to Keep. See spec.md § What syncs.
 *
 * The rule the feature exists to enforce: everything *except* `#tasks-*` notes,
 * which belong to Google Tasks (#138).
 */

/** Keep caps the title at 1,000 characters. */
export const KEEP_TITLE_MAX = 1000;
/** Keep caps the text body at 20,000 characters. notedude allows 100,000. */
export const KEEP_BODY_MAX = 20000;

/**
 * Task tags, matched exactly as the app's `TASK_TAG_RE` does — at least one
 * character must follow the hyphen, so a bare `#tasks` is not a task tag.
 */
const TASK_TAG_RE = /#tasks-[\w-]+/i;
const ARCHIVED_RE = /#archived(?=[\s,.]|$)/i;
const CONFLICT_RE = /#sync-conflict(?=[\s,.]|$)/i;

export type ScopeReason = "task-tagged" | "archived" | "conflict-copy" | "blank" | "too-large";

export interface ScopeResult {
  inScope: boolean;
  reason?: ScopeReason;
}

/**
 * Decide whether `content` may live in Keep.
 *
 * Order matters: the tag checks come first so an oversized task note reports
 * "task-tagged" rather than "too-large" — it was never going to sync, and
 * reporting a size problem for it would be noise.
 */
export function syncScope(content: string): ScopeResult {
  if (TASK_TAG_RE.test(content)) return { inScope: false, reason: "task-tagged" };
  if (ARCHIVED_RE.test(content)) return { inScope: false, reason: "archived" };
  if (CONFLICT_RE.test(content)) return { inScope: false, reason: "conflict-copy" };
  if (content.trim() === "") return { inScope: false, reason: "blank" };

  const { title, body } = toKeep(content);
  if (title.length > KEEP_TITLE_MAX || body.length > KEEP_BODY_MAX) {
    return { inScope: false, reason: "too-large" };
  }
  return { inScope: true };
}
