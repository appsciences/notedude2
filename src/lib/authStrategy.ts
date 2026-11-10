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

/** The domain Firebase hosts its auth handler on by default; the SDK's own choice. */
export const DEFAULT_AUTH_DOMAIN = "notedude2.firebaseapp.com";

/**
 * Hosts that serve `/__/auth/handler` and `/__/auth/iframe` themselves (Firebase Hosting does
 * for every domain of the project) and have `https://<host>/__/auth/handler` registered as an
 * authorized redirect URI on the OAuth client. Both are console steps (#260), so this list is
 * what must match the console.
 */
export const SAME_ORIGIN_AUTH_HOSTS = ["app.notedude.app", "notedude2.web.app"];

/**
 * The `authDomain` to initialise Firebase with.
 *
 * A redirect sign-in hands the credential back through a hidden iframe on the `authDomain`.
 * With the default domain that iframe is a third origin, and Safari and Chrome partition its
 * storage away from the app, so the redirect returns signed out — the iOS home-screen app
 * opened Google, accepted a password, and came back to an empty login screen (#260).
 * Serving the handler from the app's own origin removes the third party.
 *
 * Only the redirect client switches. Popup sign-in also goes through `authDomain`, and it works
 * today; pointing it at a handler Google has not been told about would turn that into a
 * `redirect_uri_mismatch` for everyone. A client already getting nothing has nothing to lose.
 */
export function authDomainFor(win: Window | undefined = globalThis.window): string {
  if (!win || !prefersRedirect(win)) return DEFAULT_AUTH_DOMAIN;
  return SAME_ORIGIN_AUTH_HOSTS.includes(win.location.host) ? win.location.host : DEFAULT_AUTH_DOMAIN;
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
    case "auth/redirect-incomplete":
      return "sign-in didn't finish — the app didn't get your google account back. please try again.";
    default:
      return `sign-in failed${code ? ` (${code})` : ""}. please try again.`;
  }
}
