import { useState, useEffect, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { prefersRedirect, describeAuthError } from "./authStrategy";

// Dismissing the popup, or superseding it with a second click, is a user's choice rather
// than a failure — neither belongs on the login screen as an error.
// Set just before leaving for Google, read once on return. A redirect that comes back with no
// credential and no user used to look like nothing had happened (#260).
const REDIRECT_PENDING_KEY = "notedude:redirectPending";

function takeRedirectPending(): boolean {
  try {
    const pending = localStorage.getItem(REDIRECT_PENDING_KEY) === "1";
    localStorage.removeItem(REDIRECT_PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
}

const CANCELLED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request"]);

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Claim the credential left by a redirect sign-in. onAuthStateChanged alone would fire
    // with null first and flash the login screen at a user who just authenticated.
    const returning = takeRedirectPending();
    const claimed = getRedirectResult(auth).catch((e) => {
      console.error("Redirect sign-in failed:", e);
      setError(describeAuthError(e));
      return "failed" as const;
    });
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u || !returning) return;
      // We left for Google and came back with nobody signed in and no error to show.
      void claimed.then((result) => {
        if (!result) setError(describeAuthError({ code: "auth/redirect-incomplete" }));
      });
    });
  }, []);

  const login = useCallback(async () => {
    setError(null);
    try {
      // See authStrategy.ts: the popup is the flow that works everywhere except an iOS
      // home-screen app, where it opens detached and never returns (#111, #132).
      if (prefersRedirect()) {
        try { localStorage.setItem(REDIRECT_PENDING_KEY, "1"); } catch { /* private mode */ }
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (e) {
      if (CANCELLED.has((e as { code?: string } | null)?.code ?? "")) return;
      // Swallowing this is what made #132 look like nothing had happened at all.
      console.error("Sign-in failed:", e);
      setError(describeAuthError(e));
    }
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  return { user, loading, error, login, logout };
}
