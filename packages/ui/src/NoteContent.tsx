"use client";

import React from "react";
import { useTheme } from "./theme";
import { renderWithLinks } from "./noteText";
import { parseNote } from "./markdown";

export interface NoteContentProps {
  /** The pane's contents: read-only note text, or the editor when editing. */
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}

/**
 * The right pane. It owns the padding that both the read view and the editor sit inside, so
 * text lands at an identical origin in either mode — the editor resets the browser's default
 * textarea padding for exactly this reason (#91).
 */
export function NoteContent({ children, onClick }: NoteContentProps) {
  const { t } = useTheme();
  return (
    <div
      data-testid="content-pane"
      onClick={onClick}
      style={{
        flex: 1,
        padding: t.space.lg,
        overflowY: "auto",
        position: "relative",
      }}
    >
      {children}
    </div>
  );
}

export interface NoteTextProps {
  content: string;
}

const HEADING_STYLE = {
  1: { size: "h1", weight: "bold" },
  2: { size: "h2", weight: "bold" },
  3: { size: "h3", weight: "medium" },
} as const;

/** What a marker is drawn as. The source keeps `*` / `-` / `1.`; the reader never sees them. */
const MARKER_GLYPH = { bullet: "•", dash: "–" } as const;

/**
 * Read-only note text: Markdown headings and lists rendered, newlines preserved, bare URLs
 * turned into links.
 *
 * Every line is its own block rather than one `pre-wrap` run, because a heading needs its own
 * size and a list item needs a hanging indent. Blank lines therefore have to carry an explicit
 * height or they would collapse and the note would lose its spacing on entering view mode.
 */
export function NoteText({ content }: NoteTextProps) {
  const { t } = useTheme();
  const blocks = parseNote(content);
  const blankHeight = `${t.lineHeights.normal}em`;

  return (
    // `pre-wrap` on the container is redundant for the blocks below, which each set their
    // own — it is here so the read view still reports text-rendering properties identical to
    // the editor's, which is the invariant #91 pins down.
    <div style={{ whiteSpace: "pre-wrap", minHeight: "100%" }}>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          const { size, weight } = HEADING_STYLE[block.level];
          return (
            <div
              key={i}
              data-testid="md-heading"
              data-level={block.level}
              style={{
                fontSize: t.fontSizes[size],
                fontWeight: t.fontWeights[weight],
                // Headings need air above them, but never at the very top of the pane — the
                // first line has to keep landing where the editor's first line does (#91).
                marginTop: i === 0 ? 0 : t.space.md,
                whiteSpace: "pre-wrap",
              }}
            >
              {renderWithLinks(block.text)}
            </div>
          );
        }

        if (block.kind === "list") {
          const glyph =
            block.marker === "number" ? `${block.ordinal}.` : MARKER_GLYPH[block.marker];
          return (
            <div
              key={i}
              data-testid="md-list-item"
              data-marker={block.marker}
              data-indent={block.indent}
              style={{
                display: "flex",
                marginLeft: `${block.indent}ch`,
                minHeight: blankHeight,
              }}
            >
              <span
                aria-hidden="true"
                style={{ flexShrink: 0, minWidth: `${glyph.length + 1}ch` }}
              >
                {glyph}
              </span>
              {/* `minWidth: 0` lets a long item wrap inside the flex row instead of
                  overflowing it, which is what produces the hanging indent. */}
              <span style={{ whiteSpace: "pre-wrap", minWidth: 0 }}>
                {renderWithLinks(block.text)}
              </span>
            </div>
          );
        }

        return (
          <div key={i} style={{ whiteSpace: "pre-wrap", minHeight: blankHeight }}>
            {renderWithLinks(block.text)}
          </div>
        );
      })}
    </div>
  );
}
