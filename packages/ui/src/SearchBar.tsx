"use client";

import React from "react";
import { useTheme } from "./theme";

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
}

/**
 * The prompt row at the top of the app: a `>` sigil and a borderless input that reads as
 * part of the page rather than as a form control.
 */
export function SearchBar({
  value,
  onChange,
  active,
  onActivate,
  placeholder = "search notes...",
  inputRef,
}: SearchBarProps) {
  const { t } = useTheme();
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
      <span style={{ userSelect: "none", marginRight: t.space.xs }}>&gt;</span>
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        placeholder={placeholder}
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
    </div>
  );
}
