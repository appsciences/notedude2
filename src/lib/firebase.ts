import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  memoryLocalCache,
} from "firebase/firestore";

const firebaseConfig = {
  projectId: "notedude2",
  appId: "1:584175873685:web:834d279663e0c171e6359c",
  storageBucket: "notedude2.firebasestorage.app",
  apiKey: "AIzaSyD_emPP1O3Q2tY5hz7ltxEyh41sJ65SOOE",
  authDomain: "notedude2.firebaseapp.com",
  messagingSenderId: "584175873685",
};

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
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
  // Expose for Playwright test helpers
  if (typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__testSignIn = (email: string, password: string) =>
      signInWithEmailAndPassword(auth, email, password);
  }
}
