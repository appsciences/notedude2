import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  getDocsFromServer,
  query,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";

export interface NoteData {
  id: string;
  content: string;
  pinned: boolean;
  tagPinned: boolean;
  createdAt: number;
  updatedAt: number;
  isNew?: boolean;
  /** From a snapshot: this document carries a local write the server has not yet acknowledged. */
  pendingWrite?: boolean;
}

function userNotesCol(uid: string) {
  return collection(db, "users", uid, "notes");
}

/**
 * Whether the account already holds at least one note, answered by the **server**.
 *
 * Deliberately not derived from the first `onSnapshot` callback: that snapshot can be an
 * empty cache hit, which is indistinguishable from a genuinely new account and made
 * returning users seed a duplicate welcome note into their own data (#120). Reads a single
 * document — the count does not matter, only whether any exist.
 *
 * Throws when offline (the server cannot be reached); callers must treat that as "unknown"
 * rather than "empty".
 */
export async function accountHasNotes(uid: string): Promise<boolean> {
  const snap = await getDocsFromServer(query(userNotesCol(uid), limit(1)));
  return !snap.empty;
}

/** Subscribe to all notes for a user (including archived). Returns an unsubscribe function. */
export function subscribeToNotes(
  uid: string,
  onNotes: (notes: NoteData[]) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    userNotesCol(uid),
    { includeMetadataChanges: false },
    (snap) => {
      const notes: NoteData[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            content: data.content ?? "",
            pinned: data.pinned ?? false,
            tagPinned: data.tagPinned ?? false,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : data.createdAt ?? 0,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : data.updatedAt ?? 0,
            pendingWrite: d.metadata.hasPendingWrites,
          };
        });
      onNotes(notes);
    },
    onError
  );
}

// Every write below returns its promise. The local UI is optimistic; the promise resolves when
// the server acknowledges the write (it simply stays pending while offline) and rejects when
// the server refuses it. Callers hand it to the app's SaveTracker — it must never be swallowed
// with a bare `.catch(console.error)`, which is how refused saves went unnoticed (#76).

/** The fields a full-document write carries. */
export type NoteWrite = Pick<NoteData, "id" | "content" | "pinned" | "tagPinned" | "createdAt">;

/** Write a note (create or update) with a full-document setDoc. */
export function saveNote(uid: string, note: NoteWrite): Promise<void> {
  const ref = doc(db, "users", uid, "notes", note.id);
  return setDoc(ref, {
    content: note.content,
    pinned: note.pinned,
    tagPinned: note.tagPinned,
    createdAt: note.createdAt,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Toggle a note's `pinned` flag with a field-level write. Unlike saveNote (a full-document
 * setDoc), this updates only `pinned` + `updatedAt`, so it can never overwrite a concurrent
 * content edit made in another tab/device from a stale snapshot. See #74.
 */
export function setNotePinned(uid: string, noteId: string, pinned: boolean): Promise<void> {
  const ref = doc(db, "users", uid, "notes", noteId);
  return updateDoc(ref, { pinned, updatedAt: serverTimestamp() });
}

/** Toggle a note's `tagPinned` flag with a field-level write. See setNotePinned / #74. */
export function setNoteTagPinned(uid: string, noteId: string, tagPinned: boolean): Promise<void> {
  const ref = doc(db, "users", uid, "notes", noteId);
  return updateDoc(ref, { tagPinned, updatedAt: serverTimestamp() });
}

/**
 * Write a note's content with a field-level update, leaving every other field alone.
 * Used by the tag-only content changes — archive/unarchive and task-move — where the
 * caller has already computed the exact content it wants stored.
 *
 * This replaces archiveNote(), which appended `#archived` itself even though its only
 * caller had already appended it, so Firestore ended up with the tag twice. The UI suite
 * could not see it: it renders local state, which only ever held one. See #118.
 *
 * Field-level rather than setDoc for the same reason as setNotePinned — see #74.
 */
export function setNoteContent(uid: string, noteId: string, content: string): Promise<void> {
  const ref = doc(db, "users", uid, "notes", noteId);
  return updateDoc(ref, { content, updatedAt: serverTimestamp() });
}

/**
 * Permanently remove a note's document. The app only offers this for archived notes, and
 * keeps a snapshot in its undo stack so `z` can re-create it with saveNote. See #174.
 */
export function deleteNote(uid: string, noteId: string): Promise<void> {
  return deleteDoc(doc(db, "users", uid, "notes", noteId));
}
