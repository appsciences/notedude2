import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
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
          };
        });
      onNotes(notes);
    },
    onError
  );
}

/** Write a note (create or update). Fire-and-forget for optimistic UI. */
export function saveNote(uid: string, note: NoteData) {
  const ref = doc(db, "users", uid, "notes", note.id);
  setDoc(ref, {
    content: note.content,
    pinned: note.pinned,
    tagPinned: note.tagPinned,
    createdAt: note.createdAt,
    updatedAt: serverTimestamp(),
  }).catch((err) => console.error("Failed to save note:", err));
}

/**
 * Toggle a note's `pinned` flag with a field-level write. Unlike saveNote (a full-document
 * setDoc), this updates only `pinned` + `updatedAt`, so it can never overwrite a concurrent
 * content edit made in another tab/device from a stale snapshot. See #74. Fire-and-forget.
 */
export function setNotePinned(uid: string, noteId: string, pinned: boolean) {
  const ref = doc(db, "users", uid, "notes", noteId);
  updateDoc(ref, { pinned, updatedAt: serverTimestamp() })
    .catch((err) => console.error("Failed to update pin:", err));
}

/** Toggle a note's `tagPinned` flag with a field-level write. See setNotePinned / #74. */
export function setNoteTagPinned(uid: string, noteId: string, tagPinned: boolean) {
  const ref = doc(db, "users", uid, "notes", noteId);
  updateDoc(ref, { tagPinned, updatedAt: serverTimestamp() })
    .catch((err) => console.error("Failed to update tag-pin:", err));
}

/** Archive a note by appending #archived tag. Fire-and-forget. */
export function archiveNote(uid: string, note: NoteData) {
  const ref = doc(db, "users", uid, "notes", note.id);
  const sep = note.content.endsWith("\n") || note.content === "" ? "" : " ";
  const content = note.content + sep + "#archived";
  updateDoc(ref, { content, updatedAt: serverTimestamp() })
    .catch((err) => console.error("Failed to archive note:", err));
}
