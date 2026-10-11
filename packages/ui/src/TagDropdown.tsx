"use client";

import React from "react";
import { useTheme } from "./theme";

export interface TagSuggestion {
  tag: string;
  lastUsed: number;
}

/**
 * `search` hangs full-width beneath the search bar; `editor` is a popover pinned to the
 * caret inside the note editor. They are the same list with different anchoring, so they
 * are the same component — the variant decides placement, test ids, and how a row is
 * committed.
 */
export type TagDropdownVariant = "search" | "editor";

export interface TagDropdownProps {
  variant: TagDropdownVariant;
  tags: TagSuggestion[];
  /** Index of the keyboard-highlighted row, or -1 for none. */
  selectedIndex: number;
  onSelect: (tag: string) => void;
  /**
   * How many leading entries are "recently used". A rule is drawn after them to separate
   * recency-ordered suggestions from the alphabetical remainder.
   */
  recentCount: number;
  /** Caret position for the `editor` variant. Ignored by `search`. */
  position?: { top: number; left: number };
}

export function TagDropdown({
  variant,
  tags,
  selectedIndex,
  onSelect,
  recentCount,
  position,
}: TagDropdownProps) {
  const { c, t } = useTheme();
  if (tags.length === 0) return null;

  const isEditor = variant === "editor";
  const prefix = isEditor ? "editor-tag" : "tag";

  const container: React.CSSProperties = isEditor
    ? {
        position: "absolute",
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        background: c.bg.raised,
        border: `1px solid ${c.border.subtle}`,
        zIndex: t.zIndices.popover,
        minWidth: t.sizes.tagPopoverMinWidth,
      }
    : {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        padding: `${t.space.xs}px ${t.space.md}px`,
        background: c.bg.raised,
        border: `1px solid ${c.border.subtle}`,
      };

  // The search list only rules off a recent section that actually has entries; the editor
  // list cannot reach `recentCount === 0` with rows present, so the extra guard is omitted.
  const showSeparatorAt = (i: number) =>
    i === recentCount && recentCount < tags.length && (isEditor || recentCount > 0);

  return (
    <div data-testid={`${prefix}-dropdown`} style={container}>
      {tags.map(({ tag }, i) => (
        <div key={tag}>
          {showSeparatorAt(i) && (
            <div
              data-testid={`${prefix}-separator`}
              style={{
                borderTop: `1px solid ${c.border.default}`,
                margin: `${t.space.xs}px 0`,
              }}
            />
          )}
          <div
            data-testid={`${prefix}-item`}
            data-selected={i === selectedIndex ? "true" : "false"}
            // The editor list commits on mousedown with the default prevented, so the
            // textarea never loses focus and the caret stays where the tag is going.
            {...(isEditor
              ? { onMouseDown: (e: React.MouseEvent) => { e.preventDefault(); onSelect(tag); } }
              : { onClick: () => onSelect(tag) })}
            style={{
              padding: `${t.space.xs}px ${t.space.md}px`,
              cursor: "pointer",
              background: i === selectedIndex ? c.bg.selected : "transparent",
            }}
          >
            {tag}
          </div>
        </div>
      ))}
    </div>
  );
}
