import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

export interface NoteData {
  id: string;
  content: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  isNew?: boolean;
}

function userNotesCol(uid: string) {
  return collection(db, "users", uid, "notes");
}

/** Subscribe to all non-archived notes for a user. Returns an unsubscribe function. */
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
        .filter((d) => !d.data().archived)
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            content: data.content ?? "",
            pinned: data.pinned ?? false,
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
    createdAt: note.createdAt,
    updatedAt: serverTimestamp(),
  }).catch((err) => console.error("Failed to save note:", err));
}

/** Archive a note (soft-delete). Appends #archived tag and sets archived:true. Fire-and-forget. */
export function archiveNote(uid: string, noteId: string, currentContent: string) {
  const ref = doc(db, "users", uid, "notes", noteId);
  const content = currentContent + "\n#archived";
  updateDoc(ref, { archived: true, content, updatedAt: serverTimestamp() })
    .catch((err) => console.error("Failed to archive note:", err));
}
