/**
 * Pure helpers for note content: titles, snippets, tag arithmetic, ordering (#133).
 *
 * These were module-private inside `App.tsx`, reachable only by driving a browser. They
 * carry the rules that decide what a note *is* — whether it is empty, what it is called,
 * which tags it holds — so they are worth testing directly rather than through the UI.
 *
 * Parameter types are structural on purpose: each function asks for the fields it actually
 * reads, so both `App`'s `Note` and `NoteData` satisfy them and this module depends on
 * neither (and, in turn, not on Firebase).
 */

/** What is left of a note once every #tag is stripped out. A note with nothing left holds
 *  no text the user actually wrote — only tags it inherited from the active filter. */
export function contentWithoutTags(content: string): string {
  return content.replace(/#[\w-]+/g, "").trim();
}

// Tags a new note inherits from the active filter. #archived is excluded — inheriting it
// would archive the note before a single character is typed.
const NON_INHERITABLE_TAGS = new Set(["#archived"]);

export function inheritedTags(query: string): string[] {
  const tags = (query.match(/#[\w-]+/g) ?? []).map((t) => t.toLowerCase());
  return Array.from(new Set(tags)).filter((t) => !NON_INHERITABLE_TAGS.has(t));
}

/**
 * Index of the first line with something on it, or -1 if every line is blank. The title is
 * this line, not literally line 1: a note that opens with empty lines still has a title, it
 * just sits further down. Deriving it from line 1 made any such note report "No Text
 * Entered" while the Content Pane plainly showed its text (#126).
 */
export function firstNonBlankIndex(lines: string[]): number {
  return lines.findIndex((l) => l.trim() !== "");
}

export function getNoteTitle(note: { content: string; isNew?: boolean }): string {
  if (note.isNew && contentWithoutTags(note.content) === "") return "New Note";
  const lines = note.content.split("\n");
  const titleIdx = firstNonBlankIndex(lines);
  // Reserved for notes that genuinely hold no text — whitespace-only included, which used
  // to slip through as a non-empty string and render the entry with no title at all.
  return titleIdx === -1 ? "No Text Entered" : lines[titleIdx];
}

export function getNoteMetaSnippet(note: { content: string }): string {
  if (contentWithoutTags(note.content) === "") return "No Content";
  const lines = note.content.split("\n");
  const titleIdx = firstNonBlankIndex(lines);
  if (titleIdx === -1) return "No Content";
  // Search below the title line, wherever that turned out to be.
  const snippet = lines.slice(titleIdx + 1).find((l) => l.trim() !== "") ?? "";
  return snippet.length > 30 ? snippet.slice(0, 30) + "…" : snippet;
}

/** Pinned first, then newest first within each group. Generic so callers keep their type. */
export function sortNotes<T extends { pinned: boolean; createdAt: number }>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // Within same pin status, newest first
    return b.createdAt - a.createdAt;
  });
}

const ARCHIVED_RE = /#archived(?=[\s,.]|$)/i;

export function isArchived(note: { content: string }): boolean {
  return ARCHIVED_RE.test(note.content);
}

const TASK_TAG_RE = /#tasks-[\w-]+/;

// --- Tag arithmetic ---------------------------------------------------------------
// Every tag-only content change goes through these, so that adding a tag and taking it
// away again are exact inverses. Callers own the arithmetic and hand the finished string
// to setNoteContent(), which writes it verbatim — see #118.

export function appendTag(content: string, tag: string): string {
  const sep = content.endsWith("\n") || content === "" ? "" : " ";
  return content + sep + tag;
}

/** Removes a tag along with the single space appendTag put in front of it. */
export function stripTag(content: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(`[ \\t]?${escaped}(?=[\\s,.]|$)`, "i"), "");
}

/** Puts `tag` on the note, replacing whatever #tasks-* tag it already carries. A note
 *  belongs to exactly one task list. */
export function withTaskTag(content: string, tag: string): string {
  return TASK_TAG_RE.test(content) ? content.replace(TASK_TAG_RE, tag) : appendTag(content, tag);
}

export function withoutTaskTag(content: string): string {
  const current = content.match(TASK_TAG_RE)?.[0];
  return current ? stripTag(content, current) : content;
}

/** The current #tasks-* tag on a note, or null. */
export function currentTaskTag(content: string): string | null {
  return content.match(TASK_TAG_RE)?.[0] ?? null;
}

/**
 * Every tag in use, most recently used first. Callers pass active (non-archived) notes
 * only: a tag whose last remaining note has been archived is no longer in use and must
 * stop being suggested. See #90.
 */
export function extractTags(
  notes: readonly { content: string; updatedAt: number }[]
): { tag: string; lastUsed: number }[] {
  const tagMap = new Map<string, number>();
  for (const note of notes) {
    const matches = note.content.match(/#[\w-]+/g);
    if (matches) {
      for (const raw of matches) {
        const tag = raw.toLowerCase();
        const existing = tagMap.get(tag) ?? 0;
        if (note.updatedAt > existing) tagMap.set(tag, note.updatedAt);
      }
    }
  }
  return Array.from(tagMap.entries())
    .map(([tag, lastUsed]) => ({ tag, lastUsed }))
    .sort((a, b) => b.lastUsed - a.lastUsed || a.tag.localeCompare(b.tag));
}

/** Returns the '#word' token immediately before the cursor, or null if none. */
export function getHashTokenBeforeCursor(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(/#[\w-]*$/);
  return match ? match[0] : null;
}
