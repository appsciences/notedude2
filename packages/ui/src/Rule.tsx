"use client";

import React from "react";
import { useTheme } from "./theme";

/**
 * The app draws its rules as repeated characters rather than borders, so they sit on the
 * same character grid as everything else and read as part of the monospace surface.
 */

export interface RuleProps {
  /** How many `- ` pairs to lay down. The row clips, so this only needs to over-fill. */
  repeat?: number;
}

/** The horizontal `- - - -` rule under the search bar. */
export function Rule({ repeat = 300 }: RuleProps) {
  const { c, t } = useTheme();
  return (
    <div
      style={{
        overflow: "hidden",
        whiteSpace: "nowrap",
        color: c.fg.rule,
        lineHeight: String(t.lineHeights.normal),
        userSelect: "none",
        flexShrink: 0,
        fontSize: t.fontSizes.md,
      }}
    >
      {"- ".repeat(repeat)}
    </div>
  );
}

export interface PaneDividerProps {
  /**
   * How many `|` rows to draw. The caller measures the taller of the two panes and passes
   * enough rows to cover it — a short divider leaves a visible gap down the page.
   */
  rows: number;
}

/** The vertical `|` column between the list and content panes. Exactly one character wide. */
export function PaneDivider({ rows }: PaneDividerProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="divider"
      style={{
        overflow: "hidden",
        whiteSpace: "pre",
        color: c.fg.rule,
        lineHeight: String(t.lineHeights.normal),
        userSelect: "none",
        width: t.sizes.dividerWidth,
        fontSize: t.fontSizes.md,
      }}
    >
      {"|\n".repeat(rows)}
    </div>
  );
}
