"use client";

import React from "react";
import { useTheme } from "./theme";

/** A key as the app's keydown handler sees it. */
export interface PadKey {
  key: string;
  shift?: boolean;
}

export interface CommandKeypadProps {
  onKey: (key: PadKey) => void;
}

interface PadButton extends PadKey {
  /** What the cap shows; defaults to `key`. */
  label?: string;
  aria: string;
}

/**
 * Only keys that do something in idle state, grouped by what they do. There is deliberately no
 * alphabet: the point is a keyboard that cannot type into a note, only command one. `t` and
 * `d` are chord starters, so their second keys (`i t n l d m`) are on the pad too.
 */
const ROWS: PadButton[][] = [
  [
    { key: "c", aria: "compose" },
    { key: "C", shift: true, aria: "compose clean" },
    { key: "e", aria: "edit" },
    { key: "i", aria: "insert" },
    { key: "/", aria: "search" },
    { key: "o", aria: "open attachment" },
    { key: "?", shift: true, aria: "help" },
  ],
  [
    { key: "j", aria: "next note" },
    { key: "k", aria: "previous note" },
    { key: "z", aria: "undo" },
    { key: "Z", shift: true, aria: "redo" },
    { key: "p", aria: "pin" },
    { key: "P", shift: true, aria: "tag-pin" },
    { key: "Y", shift: true, aria: "archive" },
  ],
  [
    { key: "t", aria: "task chord" },
    { key: "d", aria: "delete or theme chord" },
    { key: "n", aria: "n" },
    { key: "l", aria: "l" },
    { key: "m", aria: "markdown source" },
    { key: "Escape", label: "esc", aria: "escape" },
    { key: "Enter", label: "\u21b5", aria: "enter" },
  ],
];

/**
 * The phone's stand-in for a keyboard in idle state (#108): a pad of command keys that sends
 * the same key events a hardware keyboard would, so nothing about a command is reimplemented.
 *
 * Buttons take no focus (`preventDefault` on mouse/pointer down), so tapping one never raises
 * the native keyboard and never moves focus off the app.
 */
export function CommandKeypad({ onKey }: CommandKeypadProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="command-keypad"
      role="group"
      aria-label="command keys"
      style={{
        display: "grid",
        gap: t.space.xs,
        padding: t.space.sm,
        borderTop: `1px solid ${c.border.seam}`,
      }}
    >
      {ROWS.map((row, r) => (
        <div key={r} style={{ display: "flex", gap: t.space.xs }}>
          {row.map((k) => (
            <button
              key={k.key}
              type="button"
              data-key={k.key}
              aria-label={k.aria}
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onKey({ key: k.key, shift: k.shift })}
              style={{
                flex: 1,
                minHeight: 44,
                fontFamily: "inherit",
                fontSize: t.fontSizes.md,
                color: "inherit",
                background: "transparent",
                border: `1px solid ${c.border.default}`,
                borderRadius: t.radii.sm,
                cursor: "pointer",
                touchAction: "manipulation",
              }}
            >
              {k.label ?? k.key}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
