/**
 * Demo mode keeps every note in one localStorage array that all open tabs share (#216).
 * A tab writing its whole array put back its stale copy of every note it had not touched,
 * so saving note B in one tab undid a saved edit to note A from another.
 *
 * Instead each tab remembers the array as it last read or wrote it (`base`), and merges per
 * note: a note only one side changed takes that side's version (a deletion included); a note
 * both sides changed differently keeps this tab's version in place and the other tab's as a
 * separate copy, so neither edit is silently lost.
 */

export interface DemoNote {
  id: string;
  content: string;
  pinned: boolean;
  tagPinned: boolean;
  createdAt: number;
  updatedAt: number;
  isNew?: boolean;
}

export interface DemoConflict {
  /** The note both tabs changed; it keeps this tab's version. */
  id: string;
  /** The copy that holds the other tab's version. */
  copyId: string;
}

const same = (a: DemoNote | undefined, b: DemoNote | undefined) =>
  a === b ||
  (!!a && !!b &&
    a.content === b.content &&
    a.pinned === b.pinned &&
    a.tagPinned === b.tagPinned &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    !!a.isNew === !!b.isNew);

/**
 * Three-way merge of this tab's notes (`mine`) with what is stored now (`stored`), against
 * the version both started from (`base`). Ids in `keep` take this tab's version whatever the
 * other side did — the note open in the editor must not change under the caret.
 */
export function mergeDemoNotes(
  base: DemoNote[],
  mine: DemoNote[],
  stored: DemoNote[],
  newId: () => string = () => crypto.randomUUID(),
  keep: ReadonlySet<string> = new Set(),
): { merged: DemoNote[]; conflicts: DemoConflict[] } {
  const b = new Map(base.map((x) => [x.id, x]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const s = new Map(stored.map((x) => [x.id, x]));
  const merged: DemoNote[] = [];
  const conflicts: DemoConflict[] = [];

  // Stored order first, then notes only this tab has; display order is sorted anyway.
  const ids = [...new Set([...s.keys(), ...m.keys(), ...b.keys()])];
  for (const id of ids) {
    const was = b.get(id);
    const ours = m.get(id);
    const theirs = s.get(id);
    if (keep.has(id) && ours) { merged.push(ours); continue; }
    const oursChanged = !same(ours, was);
    const theirsChanged = !same(theirs, was);

    if (!oursChanged) { if (theirs) merged.push(theirs); continue; }
    if (!theirsChanged || same(ours, theirs)) { if (ours) merged.push(ours); continue; }

    // Both sides changed it, differently. A deletion never beats an edit.
    if (!ours) { merged.push(theirs!); continue; }
    if (!theirs) { merged.push(ours); continue; }
    const copyId = newId();
    merged.push(ours, { ...theirs, id: copyId, isNew: false });
    conflicts.push({ id, copyId });
  }
  return { merged, conflicts };
}
