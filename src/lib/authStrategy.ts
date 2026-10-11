/**
 * Which Google sign-in flow a client should use.
 *
 * `signInWithPopup` is right for every client but one, and is the only flow that reliably
 * completes on this deployment. The app is served from `notedude2.web.app` /
 * `app.notedude.app` while Firebase's `authDomain` is `notedude2.firebaseapp.com`, so
 * `signInWithRedirect` has to hand the credential back by reading state through a hidden
 * iframe at `https://<authDomain>/__/auth/iframe` — a third origin. Chrome 115+ partitions
 * third-party storage, so that iframe reads nothing, `getRedirectResult()` resolves empty,
 * and the user lands back on the login screen signed out (#132).
 *
 * The exception is an iOS or iPadOS home-screen app, where a popup opens in a detached
 * context that never returns a credential at all (#111). Redirect is the only flow available
 * there, cross-origin `authDomain` notwithstanding.
 *
 * An earlier version of this rule sent *any* standalone client — and any device with a
 * coarse primary pointer — down the redirect path, which is what broke sign-in in the
 * installed **desktop** PWA. Desktop PWAs open popups perfectly well; only iOS cannot.
 */
export function prefersRedirect(win: Window | undefined = globalThis.window): boolean {
  if (!win) return false;

  const nav = win.navigator as Navigator & { standalone?: boolean };
  const ua = nav.userAgent;

  // iPadOS reports a Mac user-agent, so multi-touch is what separates it from a desktop.
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);

  // `navigator.standalone` is the iOS-only spelling of the same thing; it predates
  // `display-mode` and is still the reliable signal on older iOS Safari.
  const isStandalone =
    !!win.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;

  return isIOS && isStandalone;
}

/** A short, lowercase explanation for the login screen. */
export function describeAuthError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/popup-blocked":
      return "your browser blocked the sign-in window — allow popups for this site and try again.";
    case "auth/network-request-failed":
      return "couldn't reach google. check your connection and try again.";
    case "auth/unauthorized-domain":
      return "this domain isn't authorized for sign-in.";
    default:
      return `sign-in failed${code ? ` (${code})` : ""}. please try again.`;
  }
}
