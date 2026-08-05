"use client";

import React from "react";
import { useTheme } from "./theme";
import { Button } from "./Button";

export interface MobileToolbarProps {
  /** Which pane the narrow layout is currently showing. */
  view: "list" | "content";
  onCompose: () => void;
  onBack: () => void;
}

/**
 * Touch equivalents for the two shortcuts unreachable without a keyboard: `c` to compose,
 * and Esc to leave the note. Narrow viewports only (#108).
 */
export function MobileToolbar({ view, onCompose, onBack }: MobileToolbarProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="mobile-toolbar"
      style={{
        display: "flex",
        gap: t.space.md,
        padding: t.space.md,
        borderTop: `1px solid ${c.border.seam}`,
      }}
    >
      {view === "list" ? (
        <Button variant="toolbar" data-testid="mobile-compose" onClick={onCompose}>
          + new note
        </Button>
      ) : (
        <Button variant="toolbar" data-testid="mobile-back" onClick={onBack}>
          &larr; notes
        </Button>
      )}
    </div>
  );
}
