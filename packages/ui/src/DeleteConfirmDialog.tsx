"use client";

import React from "react";
import { useTheme } from "./theme";

export interface DeleteConfirmDialogProps {
  /** Title of the note about to be deleted, shown in the prompt. */
  title: string;
  /** Called on a click of the "yes" hint — the keyboard path (Enter) lives in the host. */
  onConfirm?: () => void;
  /** Called on scrim click or a click of the "no" hint (Esc in the host). */
  onCancel?: () => void;
}

/**
 * The `d → d` confirmation: a terminal-style prompt over a dim scrim. Keys are handled by
 * the host (Enter accepts, Esc cancels); the hints here are also clickable for touch.
 */
export function DeleteConfirmDialog({ title, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const { c, t } = useTheme();
  const hint = {
    cursor: "pointer",
    color: c.fg.default,
    background: "transparent",
    border: "none",
    padding: 0,
    font: "inherit",
  } as const;
  return (
    <div
      data-testid="delete-confirm-overlay"
      onClick={onCancel}
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
        role="alertdialog"
        aria-label="confirm permanent delete"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.bg.dialog,
          border: `1px solid ${c.border.strong}`,
          borderRadius: t.radii.md,
          padding: `${t.space.lg}px ${t.space.xl}px`,
          minWidth: t.sizes.dialogMinWidth,
          maxWidth: "min(90vw, 480px)",
          fontFamily: t.fonts.mono,
          fontSize: t.fontSizes.md,
          color: c.fg.default,
        }}
      >
        <div style={{ marginBottom: t.space.touch, overflowWrap: "anywhere" }}>
          <span style={{ opacity: t.opacities.dim }}>$ </span>
          delete &quot;{title}&quot; permanently?
        </div>
        <div style={{ display: "flex", gap: t.space.xl, fontSize: t.fontSizes.sm }}>
          <button type="button" data-testid="delete-confirm-yes" onClick={onConfirm} style={hint}>
            [Enter] yes
          </button>
          <button type="button" data-testid="delete-confirm-no" onClick={onCancel} style={{ ...hint, opacity: t.opacities.dim }}>
            [Esc] no
          </button>
        </div>
      </div>
    </div>
  );
}
