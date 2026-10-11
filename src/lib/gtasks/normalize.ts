/**
 * Google Tasks list name ↔ notedude tag. See #138.
 *
 * "Tasks Longterm" ↔ "tasks-longterm". A name already in tag form passes through unchanged,
 * so a user is free to name their lists either way.
 */

export const SYNCED_TAG_PREFIX = "tasks-";

/**
 * Lower-case, whitespace runs to a single dash, drop anything outside `[\w-]`, collapse
 * repeated dashes. The output must be matchable by TASK_TAG_RE, hence the character filter.
 */
export function listNameToTag(listName: string): string {
  return listName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Inverse, used when a tag has no list yet: "tasks-longterm" → "Tasks Longterm". */
export function tagToListName(tag: string): string {
  return tag
    .replace(/^#/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Whether a list is in scope for the sync. A bare "Tasks" normalizes to "tasks", which has no
 * suffix and is not a task tag, so it stays out — as does "Groceries".
 */
export function isSyncedListName(listName: string): boolean {
  const tag = listNameToTag(listName);
  return tag.startsWith(SYNCED_TAG_PREFIX) && tag.length > SYNCED_TAG_PREFIX.length;
}
