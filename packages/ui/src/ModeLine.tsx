"use client";

import React from "react";
import { useTheme } from "./theme";

export interface ModeLineProps {
  /** The mode to announce, e.g. "-- INSERT --". Empty in the resting mode, as in Vim. */
  children?: React.ReactNode;
}

/**
 * Vim's mode line: a single left-aligned row that names the mode when you are not in the
 * resting one, and says nothing otherwise.
 *
 * The row is always rendered at a fixed one-line height, empty or not, so announcing a mode
 * never moves the panes above it (#124, #188).
 */
export function ModeLine({ children }: ModeLineProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="mode-line"
      style={{
        height: "1.5em",
        lineHeight: "1.5em",
        padding: `0 ${t.space.md}`,
        fontSize: t.fontSizes.sm,
        fontWeight: "bold",
        color: c.fg.default,
        whiteSpace: "pre",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}
