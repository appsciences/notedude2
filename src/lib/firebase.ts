import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  projectId: "notedude2",
  appId: "1:584175873685:web:834d279663e0c171e6359c",
  storageBucket: "notedude2.firebasestorage.app",
  apiKey: "AIzaSyD_emPP1O3Q2tY5hz7ltxEyh41sJ65SOOE",
  authDomain: "notedude2.firebaseapp.com",
  messagingSenderId: "584175873685",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Aggressive local caching with multi-tab support
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
