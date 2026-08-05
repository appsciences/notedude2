/**
 * Tag arithmetic on note content.
 *
 * Every tag-only content change goes through these, so that adding a tag and taking it away
 * again are exact inverses. Callers own the arithmetic and hand the finished string to
 * setNoteContent(), which writes it verbatim — see #118.
 *
 * These live here rather than inside App.tsx because the Google Tasks sync (#138) performs the
 * same arithmetic. A second copy is precisely how add and remove stop being inverses.
 */

export const ARCHIVED_RE = /#archived(?=[\s,.]|$)/i;
export const TASK_TAG_RE = /#tasks-[\w-]+/;

export function isArchivedContent(content: string): boolean {
  return ARCHIVED_RE.test(content);
}

export function appendTag(content: string, tag: string): string {
  const sep = content.endsWith("\n") || content === "" ? "" : " ";
  return content + sep + tag;
}

/** Removes a tag along with the single space appendTag put in front of it. */
export function stripTag(content: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(`[ \\t]?${escaped}(?=[\\s,.]|$)`, "i"), "");
}

/**
 * Puts `tag` on the note, replacing whatever #tasks-* tag it already carries. A note belongs
 * to exactly one task list. Non-task tags are left untouched.
 */
export function withTaskTag(content: string, tag: string): string {
  return TASK_TAG_RE.test(content) ? content.replace(TASK_TAG_RE, tag) : appendTag(content, tag);
}

/** The note's task tag (e.g. `#tasks-today`), or null if it carries none. */
export function taskTagOf(content: string): string | null {
  return content.match(TASK_TAG_RE)?.[0] ?? null;
}

export function withoutTaskTag(content: string): string {
  const current = taskTagOf(content);
  return current ? stripTag(content, current) : content;
}
