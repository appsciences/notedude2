"use client";

import React from "react";
import { useTheme } from "./theme";

export interface MobileToolbarProps {
  /** Which pane the narrow layout is currently showing. */
  view: "list" | "content";
  onCompose: () => void;
  onBack: () => void;
  /**
   * Shows the `[keys]` toggle for the command keypad. Omit it where the keypad does not
   * apply — while editing or searching the native keyboard is the right one.
   */
  keys?: { open: boolean; onToggle: () => void };
}

/**
 * Touch equivalents for the two shortcuts unreachable without a keyboard: `c` to compose,
 * and Esc to leave the note. Narrow viewports only (#108).
 *
 * Drawn as a shell prompt rather than boxed buttons — `$ new note█` to compose, `$ cd ..` to
 * leave — so the phone keeps the terminal feel of the keyboard app. They are still real
 * `<button>`s spanning the row, which is what keeps the whole line a thumb-sized target and
 * keeps screen readers and the `data-testid`s as they were.
 */
export function MobileToolbar({ view, onCompose, onBack, keys }: MobileToolbarProps) {
  const { c, t } = useTheme();
  const compose = view === "list";
  return (
    <div
      data-testid="mobile-toolbar"
      style={{
        display: "flex",
        borderTop: `1px solid ${c.border.seam}`,
      }}
    >
      {/* Scoped to this component; the blink is dropped for anyone who asks for less motion. */}
      <style>{`
        @keyframes nd-cursor { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }
        [data-testid="mobile-cursor"] { animation: nd-cursor 1.06s steps(1) infinite; }
        @media (prefers-reduced-motion: reduce) { [data-testid="mobile-cursor"] { animation: none; } }
      `}</style>
      <button
        type="button"
        data-testid={compose ? "mobile-compose" : "mobile-back"}
        onClick={compose ? onCompose : onBack}
        aria-label={compose ? "new note" : "back to notes"}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          minHeight: 44,
          padding: `${t.space.touch}px ${t.space.lg}px`,
          border: "none",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          fontSize: t.fontSizes.md,
          textAlign: "left",
          cursor: "pointer",
          whiteSpace: "pre",
        }}
      >
        <span aria-hidden="true" style={{ color: c.fg.dim }}>{"$ "}</span>
        <span aria-hidden="true">{compose ? "new note" : "cd .."}</span>
        {compose && (
          <span
            aria-hidden="true"
            data-testid="mobile-cursor"
            style={{ marginLeft: "0.15em" }}
          >
            {"█"}
          </span>
        )}
      </button>
      {keys && (
        <button
          type="button"
          data-testid="mobile-keys-toggle"
          aria-pressed={keys.open}
          aria-label="command keys"
          onMouseDown={(e) => e.preventDefault()}
          onClick={keys.onToggle}
          style={{
            minHeight: 44,
            padding: `${t.space.touch}px ${t.space.lg}px`,
            border: "none",
            background: "transparent",
            font: "inherit",
            fontSize: t.fontSizes.md,
            color: keys.open ? "inherit" : c.fg.dim,
            cursor: "pointer",
            whiteSpace: "pre",
          }}
        >
          {keys.open ? "[keys\u2713]" : "[keys]"}
        </button>
      )}
    </div>
  );
}
