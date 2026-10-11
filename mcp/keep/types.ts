/**
 * Shared types for Google Keep sync. See spec.md § Google Keep Sync and #142.
 *
 * The Keep API has no update method and its delete is irreversible, so every type
 * here is shaped around "create the replacement before removing the original".
 */

/** A notedude note, as stored at `users/{uid}/notes/{noteId}`. */
export interface NotedudeNote {
  id: string;
  content: string;
  updatedAt: number;
}

/**
 * A Keep note, normalised. `body` is always plain text — a checklist
 * (`body.list`) is rendered to markdown checkboxes when read.
 */
export interface KeepNote {
  /** Resource name, e.g. `notes/abc123`. */
  name: string;
  title: string;
  body: string;
  updateTime: number;
  trashed: boolean;
  /** True when the Keep note is a checklist, which cannot be edited in place. */
  isList?: boolean;
  /**
   * True when the Keep note carries attachments. The API can download media but
   * offers no way to upload it, so a replaced note's attachments are gone for
   * good. Such notes are never replaced or deleted — see `planSync`.
   */
  hasAttachments?: boolean;
}

/**
 * The persisted link between a notedude note and its Keep counterpart, at
 * `users/{uid}/keepSync/{noteId}`.
 *
 * Unlinked records are retained as **tombstones** rather than deleted. Without
 * them, a note that leaves sync scope would have its Keep counterpart re-imported
 * as a brand-new notedude note on the next run, duplicating it forever.
 */
export interface SyncMapping {
  noteId: string;
  keepName: string;
  /** Hash of the canonical content at last successful sync — the merge base. */
  baseHash: string;
  lastSyncedAt: number;
  /** Tombstone: the pair no longer syncs, but the Keep note must not be re-imported. */
  unlinked?: boolean;
  /** Set when the Keep note was deleted on unlink (`--on-leave-scope=delete`). */
  keepDeleted?: boolean;
}

/** What to do with the Keep note when a notedude note leaves sync scope. */
export type LeaveScopePolicy = "unlink" | "delete";

/**
 * A single planned change. `planSync` returns these; `applyOps` executes them.
 * Keeping planning pure is what makes the whole diff testable without network.
 */
export type SyncOp =
  /** New in notedude → create in Keep. */
  | { kind: "create-keep"; noteId: string; content: string }
  /** Edited in notedude → create the replacement, then delete `keepName`. */
  | { kind: "replace-keep"; noteId: string; keepName: string; content: string }
  /** New in Keep → create in notedude. */
  | { kind: "create-notedude"; keepName: string; content: string }
  /** Edited in Keep → update the notedude note. */
  | { kind: "update-notedude"; noteId: string; keepName: string; content: string }
  /**
   * Both sides changed. `content` (notedude's) wins and is pushed to Keep;
   * `conflictContent` (Keep's) is preserved as a new `#sync-conflict` note,
   * written **before** the Keep note is replaced.
   */
  | { kind: "conflict"; noteId: string; keepName: string; content: string; conflictContent: string }
  /** Both sides changed to the same content — no writes, just move the merge base. */
  | { kind: "rebase"; noteId: string; keepName: string; content: string }
  /** Deleted or trashed in Keep → soft-archive the notedude note. */
  | { kind: "archive-notedude"; noteId: string; keepName: string }
  /** Left sync scope → tombstone the mapping, optionally deleting the Keep note. */
  | { kind: "unlink"; noteId: string; keepName: string; deleteKeep: boolean }
  /** Reported, never silent: something the user should know was not synced. */
  | { kind: "skip"; noteId?: string; keepName?: string; reason: string };

/** Everything `planSync` needs. Pure data — no clients, no I/O. */
export interface PlanInput {
  notes: NotedudeNote[];
  keepNotes: KeepNote[];
  mappings: SyncMapping[];
  onLeaveScope: LeaveScopePolicy;
}

/** The subset of the Keep API this feature uses. Implemented for real and faked in tests. */
export interface KeepClient {
  listNotes(): Promise<KeepNote[]>;
  createNote(title: string, body: string): Promise<KeepNote>;
  deleteNote(name: string): Promise<void>;
}

/** notedude's side of sync. `NotedudeStore` implements it; tests fake it. */
export interface NoteStore {
  listNotes(): Promise<NotedudeNote[]>;
  listMappings(): Promise<SyncMapping[]>;
  createNote(content: string): Promise<string>;
  updateNote(noteId: string, content: string): Promise<void>;
  archiveNote(noteId: string): Promise<void>;
  saveMapping(m: SyncMapping): Promise<void>;
  markUnlinked(noteId: string, keepDeleted: boolean): Promise<void>;
}
