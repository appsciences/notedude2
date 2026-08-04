/**
 * Chooses between popup and redirect Google sign-in (#111).
 *
 * Split out of `useAuth` so it can be tested without initializing Firebase (#133) — the
 * decision is pure browser-capability inspection, but importing `useAuth` drags in
 * `./firebase`, which builds a real app instance at module load.
 *
 * A popup cannot reliably hand the credential back to an installed PWA: on iOS standalone
 * it opens in a detached context that never returns, leaving sign-in permanently stuck.
 * Those clients get a redirect instead. Desktop browsers keep the popup, where it is the
 * better UX and avoids a full page reload.
 */
export function prefersRedirect(): boolean {
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
