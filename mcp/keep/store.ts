import type admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { NotedudeNote, SyncMapping } from "./types.ts";

/**
 * notedude's side of the sync: notes at `users/{uid}/notes` and sync mappings at
 * `users/{uid}/keepSync`.
 *
 * The mapping collection is reachable only through the Admin SDK — the Firestore
 * rules allow `users/{userId}/notes/{noteId}` and nothing else, so the default
 * deny already keeps browser clients out of it.
 */
export class NotedudeStore {
  constructor(
    private readonly db: admin.firestore.Firestore,
    private readonly uid: string
  ) {}

  private notesCol() {
    return this.db.collection("users").doc(this.uid).collection("notes");
  }

  private mappingCol() {
    return this.db.collection("users").doc(this.uid).collection("keepSync");
  }

  async listNotes(): Promise<NotedudeNote[]> {
    const snap = await this.notesCol().get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        content: data.content ?? "",
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt ?? 0,
      };
    });
  }

  async listMappings(): Promise<SyncMapping[]> {
    const snap = await this.mappingCol().get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        noteId: d.id,
        keepName: data.keepName ?? "",
        baseHash: data.baseHash ?? "",
        lastSyncedAt: data.lastSyncedAt ?? 0,
        unlinked: data.unlinked === true,
        keepDeleted: data.keepDeleted === true,
      };
    });
  }

  /** Create a note. Fields match the security-rules whitelist so the app reads it normally. */
  async createNote(content: string): Promise<string> {
    const ref = this.notesCol().doc();
    await ref.set({
      content,
      pinned: false,
      tagPinned: false,
      createdAt: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  async updateNote(noteId: string, content: string): Promise<void> {
    await this.notesCol().doc(noteId).update({
      content,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Soft-archive by appending `#archived`, exactly as `Shift+Y` and the MCP
   * `delete_note` tool do. Idempotent. Notes are never hard-deleted by sync.
   */
  async archiveNote(noteId: string): Promise<void> {
    const ref = this.notesCol().doc(noteId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const current: string = snap.data()?.content ?? "";
    if (/#archived(?=[\s,.]|$)/i.test(current)) return;
    const sep = current.endsWith("\n") || current === "" ? "" : " ";
    await ref.update({
      content: current + sep + "#archived",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  async saveMapping(m: SyncMapping): Promise<void> {
    await this.mappingCol().doc(m.noteId).set({
      keepName: m.keepName,
      baseHash: m.baseHash,
      lastSyncedAt: m.lastSyncedAt,
      unlinked: m.unlinked ?? false,
      keepDeleted: m.keepDeleted ?? false,
    });
  }

  /**
   * Tombstone a mapping. The record is kept, not deleted: it is what stops the
   * orphaned Keep note being re-imported as a new note on the next run.
   */
  async markUnlinked(noteId: string, keepDeleted: boolean): Promise<void> {
    await this.mappingCol().doc(noteId).set(
      { unlinked: true, keepDeleted, lastSyncedAt: Date.now() },
      { merge: true }
    );
  }
}
