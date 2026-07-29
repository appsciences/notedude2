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

/**
 * A popup cannot reliably hand the credential back to an installed PWA: on iOS standalone
 * it opens in a detached context that never returns, leaving sign-in permanently stuck.
 * Those clients get a redirect instead. Desktop browsers keep the popup, where it is the
 * better UX and avoids a full page reload. See #111.
 */
function prefersRedirect(): boolean {
  if (typeof window === "undefined") return false;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari predates display-mode and reports installation this way instead.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  // `pointer: coarse` describes the *primary* input, so a touch-capable laptop driven by
  // a mouse still counts as desktop and keeps the popup.
  const touchFirst = window.matchMedia?.("(pointer: coarse)").matches;
  return !!(standalone || touchFirst);
}

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
