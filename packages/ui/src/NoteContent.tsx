"use client";

import React from "react";
import { useTheme } from "./theme";
import { renderWithLinks } from "./noteText";

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

/** Read-only note text: newlines preserved, bare URLs turned into links. */
export function NoteText({ content }: NoteTextProps) {
  return (
    <div style={{ whiteSpace: "pre-wrap", minHeight: "100%" }}>
      {renderWithLinks(content)}
    </div>
  );
}
