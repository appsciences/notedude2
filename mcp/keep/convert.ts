import { createHash } from "node:crypto";

/**
 * Mapping between notedude's single `content` string and Keep's {title, body}
 * shape, plus the content hashing that change detection is built on.
 */

/** A checklist item as returned by the Keep API. */
export interface KeepListItem {
  text?: { text?: string };
  checked?: boolean;
}

/** Split notedude content into Keep's title/body pair. First line is the title. */
export function toKeep(content: string): { title: string; body: string } {
  const nl = content.indexOf("\n");
  if (nl === -1) return { title: content, body: "" };
  return { title: content.slice(0, nl), body: content.slice(nl + 1) };
}

/** Rejoin a Keep title/body pair into notedude content. */
export function fromKeep(note: { title: string; body: string }): string {
  return note.body === "" ? note.title : `${note.title}\n${note.body}`;
}

/**
 * The form content takes after a round trip through Keep.
 *
 * The trip is lossy for trailing whitespace — "Title\n" comes back as "Title" —
 * so change detection compares canonical forms. Hashing the raw content instead
 * would flag every synced note as locally modified on every single run.
 */
export function canonical(content: string): string {
  return fromKeep(toKeep(content));
}

/** Merge-base hash. Taken over the canonical form, for the reason above. */
export function contentHash(content: string): string {
  return createHash("sha256").update(canonical(content), "utf8").digest("hex");
}

/**
 * Render a Keep checklist as markdown checkboxes.
 *
 * notedude stores plain text, and the Keep API cannot update a note in place, so
 * a checklist edited in notedude comes back as a text note. Round-tripping a
 * checklist degrades it — see spec.md § Content mapping.
 */
export function listToText(items: KeepListItem[]): string {
  return items.map((i) => `- [${i.checked ? "x" : " "}] ${i.text?.text ?? ""}`).join("\n");
}
