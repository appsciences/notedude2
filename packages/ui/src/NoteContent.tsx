"use client";

import React from "react";
import { useTheme, type Theme } from "./theme";
import { parseInline, parseNote, type Inline } from "./markdown";

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
  /** Renders the premium syntax (#12). Off, it shows as typed; headings and lists still render. */
  premium?: boolean;
  /** Shows the raw Markdown, read-only, instead of rendering it (`m` in idle). */
  source?: boolean;
}

const HEADING_STYLE = {
  1: { size: "h1", weight: "bold" },
  2: { size: "h2", weight: "bold" },
  3: { size: "h3", weight: "medium" },
} as const;

/** What a marker is drawn as. The source keeps `*` / `-` / `1.`; the reader never sees them. */
const MARKER_GLYPH = { bullet: "•", dash: "–" } as const;
const TASK_GLYPH = { open: "☐", done: "☑" } as const;

/** Draws a parsed line. Link targets were vetted by the parser — only http(s) and mailto. */
function renderInline(nodes: Inline[], theme: Theme): React.ReactNode[] {
  const { t, c } = theme;
  return nodes.map((n, i) => {
    switch (n.kind) {
      case "text":
        return n.text;
      case "bold":
        return (
          <strong key={i} style={{ fontWeight: t.fontWeights.bold }}>
            {renderInline(n.children, theme)}
          </strong>
        );
      case "italic":
        return <em key={i}>{renderInline(n.children, theme)}</em>;
      case "strike":
        return <s key={i}>{renderInline(n.children, theme)}</s>;
      case "code":
        return (
          <code
            key={i}
            data-testid="md-code"
            style={{ background: c.bg.code, borderRadius: t.radii.sm, fontFamily: "inherit" }}
          >
            {n.text}
          </code>
        );
      case "link":
      case "url":
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecorationColor: c.fg.subtle }}
          >
            {n.kind === "url" ? n.href : renderInline(n.children, theme)}
          </a>
        );
    }
  });
}

/**
 * Read-only note text: Markdown rendered, newlines preserved, bare URLs turned into links.
 *
 * Every line is its own block rather than one `pre-wrap` run, because a heading needs its own
 * size and a list item needs a hanging indent. Blank lines therefore have to carry an explicit
 * height or they would collapse and the note would lose its spacing on entering view mode.
 */
export function NoteText({ content, premium = false, source = false }: NoteTextProps) {
  const theme = useTheme();
  const { t, c } = theme;
  const blankHeight = `${t.lineHeights.normal}em`;
  const inline = (text: string) => renderInline(parseInline(text, { premium }), theme);

  if (source) {
    // The exact characters, nothing interpreted — for reading or copying the Markdown.
    return (
      <div data-testid="note-source" style={{ whiteSpace: "pre-wrap", minHeight: "100%" }}>
        {content}
      </div>
    );
  }

  const blocks = parseNote(content, { premium });

  return (
    // `pre-wrap` on the container is redundant for the blocks below, which each set their
    // own — it is here so the read view still reports text-rendering properties identical to
    // the editor's, which is the invariant #91 pins down.
    <div style={{ whiteSpace: "pre-wrap", minHeight: "100%" }}>
      {blocks.map((block, i) => {
        // Block furniture gets air above it, but never at the very top of the pane — the first
        // line has to keep landing where the editor's first line does (#91).
        const gap = i === 0 ? 0 : t.space.md;

        switch (block.kind) {
          case "heading": {
            const { size, weight } = HEADING_STYLE[block.level];
            return (
              <div
                key={i}
                data-testid="md-heading"
                data-level={block.level}
                style={{
                  fontSize: t.fontSizes[size],
                  fontWeight: t.fontWeights[weight],
                  marginTop: gap,
                  whiteSpace: "pre-wrap",
                }}
              >
                {inline(block.text)}
              </div>
            );
          }

          case "list": {
            const glyph = block.task
              ? TASK_GLYPH[block.task]
              : block.marker === "number"
                ? `${block.ordinal}.`
                : MARKER_GLYPH[block.marker];
            const done = block.task === "done";
            return (
              <div
                key={i}
                data-testid="md-list-item"
                data-marker={block.marker}
                data-indent={block.indent}
                data-task={block.task}
                style={{
                  display: "flex",
                  marginLeft: `${block.indent}ch`,
                  minHeight: blankHeight,
                  opacity: done ? t.opacities.dim : undefined,
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
                <span
                  style={{
                    whiteSpace: "pre-wrap",
                    minWidth: 0,
                    textDecoration: done ? "line-through" : undefined,
                  }}
                >
                  {inline(block.text)}
                </span>
              </div>
            );
          }

          case "code":
            // Verbatim: no inline parse, no links — a fence is where you put text that must
            // not be interpreted.
            return (
              <pre
                key={i}
                data-testid="md-code-block"
                data-lang={block.lang || undefined}
                style={{
                  margin: 0,
                  marginTop: gap,
                  background: c.bg.code,
                  borderRadius: t.radii.sm,
                  padding: `${t.space.xs}px ${t.space.md}px`,
                  fontFamily: "inherit",
                  whiteSpace: "pre",
                  overflowX: "auto",
                  minHeight: blankHeight,
                }}
              >
                {block.lines.join("\n")}
              </pre>
            );

          case "quote":
            return (
              <div
                key={i}
                data-testid="md-quote"
                style={{
                  borderLeft: `2px solid ${c.border.default}`,
                  paddingLeft: "1ch",
                  color: c.fg.muted,
                  minHeight: blankHeight,
                  whiteSpace: "pre-wrap",
                }}
              >
                {inline(block.text)}
              </div>
            );

          case "rule":
            // Takes one line's height, so a note's vertical rhythm matches its source.
            return (
              <div
                key={i}
                data-testid="md-rule"
                role="separator"
                style={{ height: blankHeight, display: "flex", alignItems: "center" }}
              >
                <div style={{ flex: 1, borderTop: `1px solid ${c.border.default}` }} />
              </div>
            );

          case "table":
            return (
              <div key={i} style={{ overflowX: "auto", marginTop: gap }}>
                <table
                  data-testid="md-table"
                  style={{ borderCollapse: "collapse", whiteSpace: "pre-wrap" }}
                >
                  <thead>
                    <tr>
                      {block.header.map((cell, j) => (
                        <th
                          key={j}
                          style={{
                            textAlign: block.align[j] ?? "left",
                            fontWeight: t.fontWeights.bold,
                            borderBottom: `1px solid ${c.border.default}`,
                            padding: "0 1ch",
                          }}
                        >
                          {inline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, j) => (
                          <td
                            key={j}
                            style={{
                              textAlign: block.align[j] ?? "left",
                              borderBottom: `1px solid ${c.border.subtle}`,
                              padding: "0 1ch",
                            }}
                          >
                            {inline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "text":
            return (
              <div key={i} style={{ whiteSpace: "pre-wrap", minHeight: blankHeight }}>
                {inline(block.text)}
              </div>
            );
        }
      })}
    </div>
  );
}
