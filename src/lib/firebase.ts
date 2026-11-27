import { initializeApp } from "firebase/app";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { authDomainFor } from "./authStrategy";
import { resolveFirebase } from "./firebaseConfig";
import { getAuth, GoogleAuthProvider, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  memoryLocalCache,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";

// Which project this build talks to is decided once, at build time (#171). Each variable is
// spelled out because Next.js only inlines a literal `process.env.NEXT_PUBLIC_X`.
const resolved = resolveFirebase({
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_SAME_ORIGIN_AUTH_HOSTS: process.env.NEXT_PUBLIC_SAME_ORIGIN_AUTH_HOSTS,
});

export const appEnv = resolved.env;

const firebaseConfig = {
  ...resolved.config,
  authDomain: authDomainFor(globalThis.window, {
    defaultDomain: resolved.config.authDomain,
    sameOriginHosts: resolved.sameOriginAuthHosts,
  }),
};

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// In emulator mode use memory cache (no IndexedDB conflicts between test runs)
export const db = initializeFirestore(app, {
  localCache: useEmulator
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (useEmulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  // Expose for Playwright test helpers
  if (typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__testSignIn = (email: string, password: string) =>
      signInWithEmailAndPassword(auth, email, password);
    // Raw write to the signed-in user's own notes collection, used to exercise
    // Firestore Security Rules (field whitelist + size cap). Returns the rule
    // outcome instead of throwing so tests can assert on it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__testWriteNote = async (noteId: string, data: Record<string, unknown>) => {
      const user = auth.currentUser;
      if (!user) return { ok: false, code: "no-current-user" };
      try {
        await setDoc(doc(db, "users", user.uid, "notes", noteId), data);
        return { ok: true };
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { ok: false, code: (e as any)?.code ?? String(e) };
      }
    };
    // Raw read/write at an arbitrary path beneath the signed-in user's document.
    // Unlike __testWriteNote this is not pinned to `notes`, so it can exercise the
    // rules for collections the browser is never supposed to reach — notably the
    // server-only `keepSync` mappings (#142). `segments` is [collection, docId, ...].
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__testUserPath = async (
      segments: string[],
      data?: Record<string, unknown>
    ) => {
      const user = auth.currentUser;
      if (!user) return { ok: false, code: "no-current-user" };
      try {
        const ref = doc(db, "users", user.uid, ...segments);
        if (data === undefined) await getDoc(ref);
        else await setDoc(ref, data);
        return { ok: true };
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { ok: false, code: (e as any)?.code ?? String(e) };
      }
    };
  }
}
