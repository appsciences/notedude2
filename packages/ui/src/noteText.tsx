import React from "react";
import { colors } from "./tokens";

/**
 * The shape the list and content components need in order to render a note. The app's own
 * `Note` satisfies this structurally; the library deliberately knows nothing about pinning
 * persistence, sync state, or archiving rules beyond what it draws.
 */
export interface NoteSummary {
  id: string;
  content: string;
  pinned: boolean;
  tagPinned: boolean;
  createdAt: number;
  /** True until the user first edits content — an untouched new note titles as "New Note". */
  isNew?: boolean;
}

/** What is left of a note once every #tag is stripped out. */
export function contentWithoutTags(content: string): string {
  return content.replace(/#[\w-]+/g, "").trim();
}

/**
 * Index of the first line with something on it, or -1 if every line is blank. The title is
 * this line, not literally line 1: a note that opens with empty lines still has a title, it
 * just sits further down (#126).
 */
function firstNonBlankIndex(lines: string[]): number {
  return lines.findIndex((l) => l.trim() !== "");
}

export function getNoteTitle(note: Pick<NoteSummary, "content" | "isNew">): string {
  if (note.isNew && contentWithoutTags(note.content) === "") return "New Note";
  const lines = note.content.split("\n");
  const titleIdx = firstNonBlankIndex(lines);
  // Reserved for notes that genuinely hold no text — whitespace-only included.
  return titleIdx === -1 ? "No Text Entered" : lines[titleIdx];
}

export function getNoteMetaSnippet(note: Pick<NoteSummary, "content">): string {
  if (contentWithoutTags(note.content) === "") return "No Content";
  const lines = note.content.split("\n");
  const titleIdx = firstNonBlankIndex(lines);
  if (titleIdx === -1) return "No Content";
  // Search below the title line, wherever that turned out to be.
  const snippet = lines.slice(titleIdx + 1).find((l) => l.trim() !== "") ?? "";
  return snippet.length > 30 ? snippet.slice(0, 30) + "…" : snippet;
}

/** Time today, weekday this week, month+day beyond that. */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

  if (d >= startOfToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (d >= startOfWeek) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const URL_RE = /https?:\/\/[^\s<>"]+/g;

/** Splits text into nodes, turning bare URLs into new-tab links that inherit their colour. */
export function renderWithLinks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={m[0]}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "inherit", textDecorationColor: colors.fg.subtle.dark }}
      >
        {m[0]}
      </a>
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
