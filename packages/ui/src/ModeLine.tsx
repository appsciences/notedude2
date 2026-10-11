"use client";

import React from "react";
import { useTheme } from "./theme";

/** Mirrors the app's save states (#76). `saved` renders nothing. */
export type ModeLineSaveState = "saved" | "saving" | "offline" | "error" | "too-long";

export interface ModeLineProps {
  /** The mode to announce, e.g. "-- INSERT --". Empty in the resting mode, as in Vim. */
  children?: React.ReactNode;
  /** Save status, shown right-aligned. Blank when everything is acknowledged (#76). */
  saveState?: ModeLineSaveState;
  saveMessage?: string;
  /** Extra detail on hover, e.g. the Firestore error code. */
  saveDetail?: string;
}

/**
 * Vim's mode line: a single left-aligned row that names the mode when you are not in the
 * resting one, and says nothing otherwise. Like Vim's message area, its right-hand side
 * reports a save that is failing, offline, too long or slow — and is blank otherwise (#76).
 *
 * The row is always rendered at a fixed one-line height, empty or not, so announcing a mode
 * never moves the panes above it (#124, #188).
 */
export function ModeLine({ children, saveState = "saved", saveMessage = "", saveDetail }: ModeLineProps) {
  const { c, t } = useTheme();
  const alarming = saveState === "error" || saveState === "too-long";
  return (
    <div
      data-testid="mode-line"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: t.space.md,
        height: "1.5em",
        lineHeight: "1.5em",
        padding: `0 ${t.space.md}`,
        fontSize: t.fontSizes.sm,
        fontWeight: "bold",
        color: c.fg.default,
        whiteSpace: "pre",
        userSelect: "none",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <span>{children}</span>
      <span
        data-testid="save-status"
        data-save-state={saveState}
        role="status"
        aria-live="polite"
        title={saveDetail}
        style={{
          fontWeight: "normal",
          color: alarming ? c.fg.danger : c.fg.muted,
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {saveState === "saved" ? "" : saveMessage}
      </span>
    </div>
  );
}
