"use client";

import React from "react";
import { useTheme } from "./theme";
import { NoteListItem } from "./NoteListItem";
import type { NoteSummary } from "./noteText";

export interface NoteListProps {
  /** Active notes, in display order. */
  notes: NoteSummary[];
  /**
   * Archived notes, shown below the others under an "archived" label. They are not hidden —
   * they sort to the end (#96) and stay keyboard-navigable (#95).
   */
  archivedNotes?: NoteSummary[];
  selectedId: string;
  /** Id of the note flashing green after a save, if any. */
  flashingId?: string | null;
  onSelect?: (id: string) => void;
  /** Fill the viewport instead of sitting in a fixed column — narrow layouts (#108). */
  fullWidth?: boolean;
  listRef?: React.Ref<HTMLDivElement>;
}

/** The label separating active notes from archived ones. */
function ArchivedDivider() {
  const { t } = useTheme();
  return (
    <div
      data-testid="archived-divider"
      style={{
        fontSize: t.fontSizes.xxs,
        opacity: t.opacities.label,
        textTransform: "uppercase",
        letterSpacing: t.letterSpacings.label,
        padding: `${t.space.sm}px ${t.space.md}px ${t.space.xxs}px`,
        userSelect: "none",
      }}
    >
      archived
    </div>
  );
}

/** The left pane: every note the current filter admits, active first then archived. */
export function NoteList({
  notes,
  archivedNotes = [],
  selectedId,
  flashingId = null,
  onSelect,
  fullWidth = false,
  listRef,
}: NoteListProps) {
  const { t } = useTheme();

  const renderItem = (note: NoteSummary, archived: boolean) => (
    <NoteListItem
      key={note.id}
      note={note}
      archived={archived}
      selected={note.id === selectedId}
      flashing={note.id === flashingId}
      onClick={() => onSelect?.(note.id)}
    />
  );

  return (
    <div
      ref={listRef}
      data-testid="list-pane"
      style={{
        width: fullWidth ? "100%" : t.sizes.listPaneWidth,
        overflowY: "auto",
      }}
    >
      {notes.map((note) => renderItem(note, false))}
      {archivedNotes.length > 0 && <ArchivedDivider />}
      {archivedNotes.map((note) => renderItem(note, true))}
    </div>
  );
}
