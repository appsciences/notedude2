import { ref, uploadBytes, getDownloadURL, updateMetadata } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Where attachment bytes go. The app only ever talks to this interface, so the signed-in app
 * uses Firebase Storage while the account-less /test harness uses memory — which is what lets
 * Playwright drive the whole paste → render → open flow without a Firebase project.
 */
export interface AttachmentStore {
  upload(id: string, file: File, name: string): Promise<void>;
  /** A URL the browser can load the file from. */
  url(id: string): Promise<string>;
  /** Flags an id whose reference left every note. Purely a hint: see spec, "Storage". */
  markRemoved(id: string): Promise<void>;
  clearRemoved(id: string): Promise<void>;
}

/** `users/{uid}/attachments/{id}` — keyed by user, not note, so copied text still resolves. */
export const attachmentPath = (uid: string, id: string) => `users/${uid}/attachments/${id}`;

export function firebaseAttachmentStore(uid: string): AttachmentStore {
  const at = (id: string) => ref(storage, attachmentPath(uid, id));
  return {
    async upload(id, file, name) {
      await uploadBytes(at(id), file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: { name },
      });
    },
    url: (id) => getDownloadURL(at(id)),
    async markRemoved(id) {
      await updateMetadata(at(id), { customMetadata: { removedAt: new Date().toISOString() } });
    },
    async clearRemoved(id) {
      await updateMetadata(at(id), { customMetadata: { removedAt: "" } });
    },
  };
}

let memoryStore: AttachmentStore | null = null;

/**
 * One per page, created on first use: React may build the app's `useMemo` twice in development
 * and the test hook on `window` has to point at the instance that is actually used.
 */
export function memoryAttachmentStore(): AttachmentStore {
  return (memoryStore ??= createMemoryStore());
}

function createMemoryStore(): AttachmentStore {
  const files = new Map<string, { url: string; name: string; type: string }>();
  const removed = new Set<string>();
  if (typeof window !== "undefined") {
    (window as unknown as { __testAttachments?: unknown }).__testAttachments = {
      files,
      removed,
    };
  }
  return {
    async upload(id, file, name) {
      files.set(id, { url: URL.createObjectURL(file), name, type: file.type });
    },
    async url(id) {
      const f = files.get(id);
      if (!f) throw new Error("missing attachment");
      return f.url;
    },
    async markRemoved(id) { removed.add(id); },
    async clearRemoved(id) { removed.delete(id); },
  };
}
