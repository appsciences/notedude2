import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { prefersRedirect } from "./sign-in-mode";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Claim the credential left by a redirect sign-in. onAuthStateChanged alone would fire
    // with null first and flash the login screen at a user who just authenticated.
    getRedirectResult(auth).catch((e) => console.error("Redirect sign-in failed:", e));
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const login = () =>
    prefersRedirect()
      ? signInWithRedirect(auth, googleProvider)
      : signInWithPopup(auth, googleProvider).catch((e) => {
          if (e?.code !== "auth/popup-closed-by-user") throw e;
        });

  const logout = () => signOut(auth);

  return { user, loading, login, logout };
}
