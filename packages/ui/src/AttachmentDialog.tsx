"use client";

import React from "react";
import { useTheme } from "./theme";

export interface AttachmentDialogProps {
  /** File names, in note order. */
  names: string[];
  /** Index of the keyboard-highlighted row. */
  selectedIndex: number;
  onSelect: (index: number) => void;
  onDismiss?: () => void;
}

/**
 * The `o` chooser, for a note with more than one attachment. Same shape as the task-move
 * overlay: a modal list over a dim scrim, driven by j/k, Enter and Esc.
 */
export function AttachmentDialog({ names, selectedIndex, onSelect, onDismiss }: AttachmentDialogProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="attachment-overlay"
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: c.overlay.scrim,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: t.zIndices.dialog,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.bg.dialog,
          border: `1px solid ${c.border.strong}`,
          borderRadius: t.radii.md,
          padding: `${t.space.lg}px ${t.space.xl}px`,
          minWidth: t.sizes.dialogMinWidth,
          maxWidth: "90vw",
          fontFamily: t.fonts.mono,
          fontSize: t.fontSizes.md,
        }}
      >
        <div style={{ marginBottom: t.space.touch, fontSize: t.fontSizes.sm, opacity: t.opacities.dim }}>
          open attachment
        </div>
        {names.map((name, i) => (
          <div
            key={i}
            data-testid="attachment-item"
            data-selected={i === selectedIndex ? "true" : "false"}
            onClick={() => onSelect(i)}
            style={{
              padding: `${t.space.sm}px ${t.space.md}px`,
              borderRadius: t.radii.sm,
              cursor: "pointer",
              background: i === selectedIndex ? c.bg.selectedMuted : "transparent",
              color: c.fg.default,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
        ))}
      </div>
    </div>
  );
}
