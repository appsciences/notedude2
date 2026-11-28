/**
 * Whether the local-dev sign-in bypass is on.
 *
 * `NEXT_PUBLIC_SKIP_AUTH=true` renders the app straight away, with no sign-in screen and no
 * account. A production build ignores the flag, so a leaked or mis-set env var can never
 * disable authentication on the deployed site.
 *
 * Takes the two values as arguments, not `process.env`, because Next inlines
 * `process.env.NEXT_PUBLIC_*` only where it is written out literally; the caller passes them.
 */
export function skipAuthEnabled(flag: string | undefined, nodeEnv: string | undefined): boolean {
  return flag === "true" && nodeEnv !== "production";
}

/**
 * The header shown while the bypass is on. Without it the bypass looked like a broken app:
 * no login screen, no account name, and an `ll` that does nothing, since there is no session
 * to log out of (#230).
 */
export const DEV_MODE_LABEL =
  "dev mode: sign-in skipped (NEXT_PUBLIC_SKIP_AUTH). Notes stay in this tab and ll does nothing.";
