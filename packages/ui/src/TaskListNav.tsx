"use client";

import React from "react";
import { useTheme } from "./theme";

export interface TaskListNavEntry {
  /** The full tag, e.g. `#tasks-today`. */
  tag: string;
  /** How many notes currently sit in this list. */
  count: number;
}

export interface TaskListNavProps {
  lists: TaskListNavEntry[];
  /** The list matching the active filter, or null when no list is selected. */
  activeTag?: string | null;
  onSelect: (tag: string) => void;
}

/** `#tasks-today` reads as `today` — the prefix is the same on every entry. */
function listLabel(tag: string): string {
  return tag.replace(/^#tasks-/, "");
}

/**
 * The five task lists as first-class navigation, used by the `todude` variant (#151).
 *
 * A list *is* a saved filter, so selecting one here is the same state change the `t → i/t/n/l/d`
 * chords make — the nav renders that state, it does not own it. Counts are passed in rather
 * than derived, keeping the library free of the archive and scope rules that decide what counts.
 */
export function TaskListNav({ lists, activeTag = null, onSelect }: TaskListNavProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="task-list-nav"
      style={{
        display: "flex",
        gap: t.space.xs,
        padding: `${t.space.sm}px ${t.space.md}px`,
        fontFamily: t.fonts.mono,
        fontSize: t.fontSizes.sm,
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {lists.map(({ tag, count }) => {
        const active = tag === activeTag;
        return (
          <button
            key={tag}
            type="button"
            data-testid="task-list-nav-item"
            data-tag={tag}
            data-count={count}
            data-active={active ? "true" : "false"}
            onClick={() => onSelect(tag)}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: t.space.sm,
              padding: `${t.space.xs}px ${t.space.md}px`,
              border: "none",
              borderRadius: t.radii.sm,
              cursor: "pointer",
              whiteSpace: "nowrap",
              fontFamily: "inherit",
              fontSize: "inherit",
              background: active ? c.bg.selected : "transparent",
              color: active ? c.fg.default : c.fg.dim,
            }}
          >
            <span>{listLabel(tag)}</span>
            {/* Zero is worth showing: an empty Today is information, not an absence. */}
            <span style={{ color: c.fg.muted, fontSize: t.fontSizes.xs }}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
