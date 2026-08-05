"use client";

import React from "react";
import { useTheme } from "./theme";
import { formatTimestamp, getNoteMetaSnippet, getNoteTitle, type NoteSummary } from "./noteText";

export interface NoteListItemProps {
  note: NoteSummary;
  selected: boolean;
  /** Archived rows stay in the list but recede (#96). */
  archived: boolean;
  /** Briefly true right after a save, to flash the row green. */
  flashing?: boolean;
  onClick?: () => void;
}

/**
 * One row in the list pane: pin indicators and title on top, timestamp and snippet below.
 * Both lines truncate rather than wrap — the row is a fixed two lines tall so the list
 * stays scannable.
 */
export function NoteListItem({
  note,
  selected,
  archived,
  flashing = false,
  onClick,
}: NoteListItemProps) {
  const { c, t } = useTheme();

  const background = flashing
    ? c.bg.saveFlash
    : selected
      ? c.bg.selected
      : "transparent";

  const truncate: React.CSSProperties = {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  return (
    <div
      data-testid="note-item"
      data-selected={selected ? "true" : "false"}
      data-pinned={note.pinned ? "true" : "false"}
      data-tagpinned={note.tagPinned ? "true" : "false"}
      data-archived={archived ? "true" : "false"}
      data-flash={flashing ? "true" : "false"}
      onClick={onClick}
      style={{
        padding: t.space.md,
        cursor: "pointer",
        background,
        transition: t.transitions.flash,
        opacity: archived ? t.opacities.dim : 1,
      }}
    >
      <div
        data-testid="note-item-title"
        style={{ fontWeight: 400, fontSize: t.fontSizes.md, ...truncate }}
      >
        {note.pinned && <span style={{ marginRight: t.space.xxs }}>○</span>}
        {note.tagPinned && (
          <span
            style={{
              fontSize: t.fontSizes.bullet,
              opacity: t.opacities.bullet,
              marginRight: t.space.xxs,
            }}
          >
            #
          </span>
        )}
        {getNoteTitle(note)}
      </div>
      <div
        data-testid="note-item-meta"
        style={{ fontSize: t.fontSizes.sm, color: c.fg.muted, ...truncate }}
      >
        {formatTimestamp(note.createdAt)} | {getNoteMetaSnippet(note)}
      </div>
    </div>
  );
}
