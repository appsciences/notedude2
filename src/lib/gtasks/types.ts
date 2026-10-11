/** Google Tasks API shapes, narrowed to the fields the sync reads. See #138. */

export interface GTask {
  id: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  /**
   * RFC3339, but Google Tasks treats this as a **calendar date**: the time part is always
   * midnight UTC and is not meaningful. Read it with the UTC accessors — see dates.ts.
   */
  due?: string | null;
  /** RFC3339 instant of the last change, used to break conflicts. */
  updated?: string;
  deleted?: boolean;
}

export interface GTaskList {
  id: string;
  title: string;
}

/** One link record: `users/{uid}/gtasks/{noteId}`. Disposable — rebuildable by title match. */
export interface SyncLink {
  taskId: string;
  listId: string;
  noteHash: string;
  taskHash: string;
  lastSyncedAt: number;
}
