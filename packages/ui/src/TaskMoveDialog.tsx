"use client";

import React from "react";
import { useTheme } from "./theme";

export interface TaskMoveDialogProps {
  /** The task lists to choose from, in the order they should appear. */
  tags: string[];
  /** Index of the keyboard-highlighted row. */
  selectedIndex: number;
  onSelect: (tag: string) => void;
  onDismiss?: () => void;
  label?: string;
}

/**
 * The `t → m` chooser. Unlike the help overlay this is a true modal over a dim scrim: the
 * note it acts on stays visible behind it.
 */
export function TaskMoveDialog({
  tags,
  selectedIndex,
  onSelect,
  onDismiss,
  label = "move note to task list",
}: TaskMoveDialogProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="task-move-overlay"
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
          fontFamily: t.fonts.mono,
          fontSize: t.fontSizes.md,
        }}
      >
        <div
          style={{
            marginBottom: t.space.touch,
            fontSize: t.fontSizes.sm,
            opacity: t.opacities.dim,
          }}
        >
          {label}
        </div>
        {tags.map((tag, i) => (
          <div
            key={tag}
            data-testid="task-move-item"
            data-selected={i === selectedIndex ? "true" : "false"}
            onClick={() => onSelect(tag)}
            style={{
              padding: `${t.space.sm}px ${t.space.md}px`,
              borderRadius: t.radii.sm,
              cursor: "pointer",
              background: i === selectedIndex ? c.bg.selectedMuted : "transparent",
              color: c.fg.default,
            }}
          >
            {tag}
          </div>
        ))}
      </div>
    </div>
  );
}
