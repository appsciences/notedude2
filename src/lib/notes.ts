import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export interface NoteData {
  id: string;
  content: string;
  pinned: boolean;
  pinnedTags: string[];
  createdAt: number;
  updatedAt: number;
  isNew?: boolean;
}

function userNotesCol(uid: string) {
  return collection(db, "users", uid, "notes");
}

/** Subscribe to all notes for a user. Returns an unsubscribe function. */
export function subscribeToNotes(
  uid: string,
  onNotes: (notes: NoteData[]) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    userNotesCol(uid),
    { includeMetadataChanges: false },
    (snap) => {
      const notes: NoteData[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          content: data.content ?? "",
          pinned: data.pinned ?? false,
          pinnedTags: Array.isArray(data.pinnedTags) ? data.pinnedTags : [],
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
    pinnedTags: note.pinnedTags ?? [],
    createdAt: note.createdAt,
    updatedAt: serverTimestamp(),
  }).catch((err) => console.error("Failed to save note:", err));
}

/** Delete a note. Fire-and-forget. */
export function deleteNote(uid: string, noteId: string) {
  const ref = doc(db, "users", uid, "notes", noteId);
  deleteDoc(ref).catch((err) => console.error("Failed to delete note:", err));
}
