"use client";

import React from "react";
import { useTheme } from "./theme";

/** A key (or key sequence) and what it does. */
export type ShortcutRow = [key: string, description: string];

/** A titled group of shortcuts, e.g. `["navigation", [["j / ↓", "next note"], …]]`. */
export type ShortcutSection = [title: string, rows: ShortcutRow[]];

export interface HelpOverlayProps {
  sections: ShortcutSection[];
  onDismiss?: () => void;
  /** Shown at the bottom in small print. */
  hint?: string;
}

/**
 * The keyboard reference, drawn over the whole app. Its backdrop is near-opaque rather than
 * a dim scrim: the app behind it is meant to be out of the way, not half-legible.
 */
export function HelpOverlay({
  sections,
  onDismiss,
  hint = "press any key or click to close",
}: HelpOverlayProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="help-overlay"
      onClick={onDismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: c.overlay.help,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: t.zIndices.overlay,
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          maxWidth: t.sizes.overlayMaxWidth,
          width: "100%",
          padding: `${t.space.xxl}px ${t.space.xxxl}px`,
          color: c.fg.default,
          overflowY: "auto",
          maxHeight: "90vh",
        }}
      >
        <div style={{ marginBottom: t.space.xl, fontSize: t.fontSizes.lg }}>
          keyboard shortcuts
        </div>
        {sections.map(([section, rows]) => (
          <div key={section} style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: t.fontSizes.xs,
                opacity: t.opacities.label,
                textTransform: "uppercase",
                letterSpacing: t.letterSpacings.label,
                marginBottom: t.space.md,
              }}
            >
              {section}
            </div>
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: t.fontSizes.md }}
            >
              <tbody>
                {rows.map(([key, desc]) => (
                  <tr key={key}>
                    <td
                      style={{
                        paddingBottom: t.space.sm,
                        paddingRight: t.space.xxl,
                        whiteSpace: "nowrap",
                        opacity: t.opacities.dim,
                        width: 100,
                      }}
                    >
                      {key}
                    </td>
                    <td style={{ paddingBottom: t.space.sm }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div
          style={{ marginTop: t.space.md, fontSize: t.fontSizes.sm, opacity: t.opacities.label }}
        >
          {hint}
        </div>
      </div>
    </div>
  );
}
