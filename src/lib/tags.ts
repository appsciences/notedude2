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

// Archive state *is* the `#archived` tag in the content — by design, not a stand-in for a
// field (#75). It counts only as a whole tag: at the start of the content or after
// whitespace, and followed by whitespace, `,`, `.` or the end. So `#archived-2024`,
// `#archivedstuff`, `example.com/#archived` and `foo#archived` are not archived. The MCP
// server (mcp/index.ts, mcp/keep/) uses the same rule.
export const ARCHIVED_TAG = "#archived";
export const ARCHIVED_RE = /(?<=^|\s)#archived(?=[\s,.]|$)/i;
export const TASK_TAG_RE = /#tasks-[\w-]+/;

export function isArchivedContent(content: string): boolean {
  return ARCHIVED_RE.test(content);
}

export function appendTag(content: string, tag: string): string {
  const sep = content.endsWith("\n") || content === "" ? "" : " ";
  return content + sep + tag;
}

// Matches one whole `tag` together with the whitespace that belongs to it: the single space
// or tab in front of it (what appendTag put there), or — for a tag that starts a line — the
// single space or tab after it. Removing the match leaves the text around it exactly as it
// would read without the tag. A tag glued to other text (`example.com/#archived`) is not a
// tag and is never matched.
function tagWithSpaceRe(tag: string): RegExp {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `[ \\t]${escaped}(?=[\\s,.]|$)|(?<=^|\\n)${escaped}(?:[ \\t]|(?=[\\s,.]|$))`,
    "i",
  );
}

/** Removes the first whole occurrence of a tag — the inverse of one appendTag. */
export function stripTag(content: string, tag: string): string {
  return content.replace(tagWithSpaceRe(tag), "");
}

/**
 * Removes every whole occurrence of a tag. Repeated rather than global, because removing
 * one occurrence can be what puts the next one at the start of a line.
 */
export function stripAllTags(content: string, tag: string): string {
  const re = tagWithSpaceRe(tag);
  let out = content;
  while (re.test(out)) out = out.replace(re, "");
  return out;
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
