"use client";

import React from "react";
import { useTheme } from "./theme";

/**
 * The tag-substitution prompt (#163). When present the bar stops being a search box and
 * becomes `s #old → <target>`: the source is fixed text, the same input now holds the
 * replacement, and the hint states the outcome and the blast radius.
 */
export interface SearchBarSubstitute {
  /** The tag being replaced. Not editable — the operation is anchored to it. */
  source: string;
  /** Outcome and blast radius, e.g. `remove from 12 notes`. */
  hint: string;
  /** Dims the hint when the target is refused, so a rejection reads as one. */
  invalid?: boolean;
}

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * False puts the input in `readOnly` — the app is not in its search state, so the box
   * shows the active filter but does not accept typing until it is clicked.
   */
  active: boolean;
  /** Called when a non-active bar is clicked, to enter the search state. */
  onActivate?: () => void;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Present only in the substitution sub-state. */
  substitute?: SearchBarSubstitute;
}

/**
 * The prompt row at the top of the app: a `>` sigil and a borderless input that reads as
 * part of the page rather than as a form control.
 *
 * Tag substitution reuses this row rather than opening a surface of its own. The bar is
 * already a terminal prompt, so focus never has to leave the input it is in and the panes
 * below never move — see the layout rule behind #124.
 */
export function SearchBar({
  value,
  onChange,
  active,
  onActivate,
  placeholder = "search notes...",
  inputRef,
  substitute,
}: SearchBarProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="top-pane"
      style={{
        padding: `${t.space.md}px`,
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      {/* The row itself is already `top-pane`, so the prompt needs an element of its own to
          be addressable — and one that exists only while a substitution is being composed. */}
      {substitute ? (
        <span
          data-testid="substitute-prompt"
          style={{ display: "flex", alignItems: "center", gap: t.space.xs, marginRight: t.space.xs }}
        >
          <span style={{ userSelect: "none" }}>s</span>
          <span data-testid="substitute-source" style={{ userSelect: "none", whiteSpace: "nowrap" }}>
            {substitute.source}
          </span>
          <span style={{ userSelect: "none", opacity: t.opacities.dim }}>&rarr;</span>
        </span>
      ) : (
        <span style={{ userSelect: "none", marginRight: t.space.xs }}>&gt;</span>
      )}
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        placeholder={substitute ? "" : placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!active}
        onClick={() => { if (!active) onActivate?.(); }}
        style={{
          width: "100%",
          padding: `${t.space.xs}px 0`,
          fontFamily: "inherit",
          fontSize: "inherit",
          border: "none",
          outline: "none",
          background: "transparent",
          color: "inherit",
        }}
      />
      {substitute && (
        <span
          data-testid="substitute-hint"
          style={{
            userSelect: "none",
            marginLeft: t.space.md,
            whiteSpace: "nowrap",
            fontSize: t.fontSizes.sm,
            color: substitute.invalid ? c.fg.default : c.fg.subtle,
            opacity: substitute.invalid ? 1 : t.opacities.dim,
          }}
        >
          {substitute.hint}
        </span>
      )}
    </div>
  );
}
