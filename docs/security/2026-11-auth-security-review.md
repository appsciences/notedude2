# Security review: Google auth, rules and token handling (#14)

Date: 2026-11-25. Scope: a code-level review of this repository at `main` (`adc665d`) plus the
changes in the same PR. Covered: Firebase / Google OAuth configuration as it appears in code,
redirect handling, Firestore and Storage rules, token and session handling, secrets in client
code, hosting headers, CI credentials.

**Not covered:** no scanning or penetration testing of the live site, and no inspection of the
Firebase, Google Cloud or OAuth consoles. Every finding marked *console* below is something the
code implies but only the console can confirm.

## Summary

No high-severity issue was found in the code. The rules are owner-only with closed schemas,
markdown links are scheme-allowlisted, test hooks exist only in emulator builds and the auth
bypass is compiled out of production. The main gaps are defence in depth (no App Check, no
Content-Security-Policy), local data surviving sign-out, and the share-target route creating
notes without confirmation.

| # | Severity | Finding | Where to fix |
|---|---|---|---|
| M1 | Medium | No App Check; the API key's restrictions are unknown | console + small code change |
| M2 | Medium | Notes stay on the device after sign-out | code |
| M3 | Medium | Any link to `/share?text=…` silently creates a note | code |
| M4 | Medium | No Content-Security-Policy | `firebase.json` |
| L1 | Low | Production authorized domains probably include `localhost` | console |
| L2 | Low | Storage `update` rule allows replacing a file with one of the same size | `storage.rules` |
| L3 | Low | Google Tasks link fields have no length cap | `firestore.rules` |
| L4 | Low | Long-lived service-account JSON keys for deploys and the MCP | console + CI |
| L5 | Low | Sentry network breadcrumbs keep full URLs | `src/lib/monitoring.ts` |
| L6 | Info | `firestore-debug.log` was committed despite `.gitignore` | fixed in this PR |
| V1 | Verify | `X-Frame-Options: DENY` may block the same-origin auth iframe on iOS | test on device |

## Findings

### M1. No App Check, API key restrictions unknown (*console*)

`src/lib/firebase.ts` (now `src/lib/firebaseConfig.ts`) ships the web API key, as every Firebase
web app must. The key is not a secret, but without restrictions and without App Check anyone can
use it from a script: create Firebase Auth accounts in bulk, and then read and write up to the
quota inside their own `users/{uid}` tree. On the free plan that exhausts the daily quota for
everyone; on Blaze it is billed.

Fix:
- In Google Cloud console, APIs & Services, Credentials, restrict the browser key to HTTP
  referrers `https://app.notedude.app/*`, `https://notedude2.web.app/*`,
  `https://notedude2.firebaseapp.com/*`, and to the APIs the web app uses (Identity Toolkit,
  Token Service, Cloud Firestore, Cloud Storage for Firebase, Firebase Installations).
- Enable App Check with reCAPTCHA Enterprise, add `initializeAppCheck` in `src/lib/firebase.ts`,
  watch the metrics for a week, then enforce for Firestore and Storage. Needs a debug token for
  the emulator suite.

### M2. Notes stay on the device after sign-out

`useAuth().logout` only calls `signOut`. Firestore runs with `persistentLocalCache`, so every
note the user has opened stays in IndexedDB, and the unsynced-edit journal
(`notedude:unsynced:<uid>:<noteId>` in `localStorage`) stays too. The next person on a shared or
borrowed computer cannot see them in the app (rules and the UI block that), but they are readable
from DevTools or the disk.

Fix: on sign-out, after any pending writes settle (or after warning that unsynced text will be
lost), call `terminate(db)` then `clearIndexedDbPersistence(db)`, remove the user's journal keys
and `notedude:pendingShare`, and reload. Add an e2e test that signs out and finds no note text in
IndexedDB or `localStorage`.

### M3. `/share?text=…` silently creates a note

`src/app/share/page.tsx` parks any `title`/`text`/`url` query parameters and the app turns them
into a note on its next load (`App.tsx`, `takePendingShare`). The route is meant for Android's
share sheet, but any web page or email can link to it. A signed-in user who clicks such a link
gets a note they did not write; if it carries a `#tasks-*` tag it also flows to Google Tasks
through the MCP sync. Nothing is exfiltrated, so this is spam/phishing injection rather than data
theft.

Fix: open the shared text in the editor as a new, unsaved note that the user keeps with `Esc`
or discards, instead of saving it straight away; or accept a share only when the page runs as the
installed app (`display-mode: standalone`), which is how the share sheet opens it.

### M4. No Content-Security-Policy

`firebase.json` sets good headers (HSTS, `nosniff`, `X-Frame-Options`, Referrer-Policy,
Permissions-Policy) but no CSP. Firebase Auth keeps the refresh token in IndexedDB, readable by
any script on the origin, so one XSS bug would be an account takeover. The markdown renderer is
safe today (React escaping, `SAFE_HREF_RE` allowing only `http(s):` and `mailto:`, `noopener`),
so this is defence in depth.

Fix: ship `Content-Security-Policy-Report-Only` first, then enforce. A starting point (inline
scripts in `layout.tsx` need hashes or moving to files):

```
default-src 'self';
script-src 'self' https://apis.google.com https://www.googletagmanager.com 'sha256-…';
connect-src 'self' https://*.googleapis.com https://securetoken.googleapis.com
  https://identitytoolkit.googleapis.com https://firebasestorage.googleapis.com
  https://*.ingest.sentry.io https://www.google-analytics.com;
img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com;
frame-src https://notedude2.firebaseapp.com https://accounts.google.com;
style-src 'self' 'unsafe-inline'; font-src 'self' data:;
object-src 'none'; base-uri 'self'; frame-ancestors 'none'
```

### L1. `localhost` in production authorized domains (*console*)

`e2e/sign-in-flow.spec.ts` models the authorized domains as `localhost`, `127.0.0.1` and
`notedude2.web.app`, and Firebase adds `localhost` by default. With it, any page served on a
developer's machine can run Google sign-in against the production project. Once staging exists
(#171), remove `localhost` and `127.0.0.1` from production (Authentication, Settings,
Authorized domains) and keep them on staging and the emulators.

### L2. Storage `update` allows same-size replacement

`storage.rules` intends only the removal hint to change after upload, but
`request.resource.size == resource.size` also admits new content of the same length. Only the
owner can do it, to their own files. Tighten with
`request.resource.md5Hash == resource.md5Hash` (and keep `contentType` unchanged).

### L3. Google Tasks link fields uncapped

`isValidGTaskLink` checks types but not lengths, so a client can write up to the 1 MiB document
limit per link record. Add `.size() <= 256` (ids, hashes) to each string.

### L4. Long-lived service-account keys (*console*)

CI deploys with a JSON key in `FIREBASE_SERVICE_ACCOUNT_NOTEDUDE2`; the MCP README tells users to
download an Admin SDK key to their laptop. A leaked key is full project access until revoked.
Separately, the deploy service accounts currently lack Service Usage Consumer and Firebase
Hosting Admin on `notedude2`, which is why deploys since Oct 22 fail.

Fix: give the deploy account only Firebase Hosting Admin, Service Usage Consumer and (for staging
rules deploys) Firebase Rules Admin; move CI to Workload Identity Federation
(`google-github-actions/auth`) and delete the JSON keys; rotate any key that has ever been on a
laptop.

### L5. Sentry keeps full URLs in network breadcrumbs

`scrubBreadcrumb` keeps `fetch`/`xhr` breadcrumbs, URL included. Firestore and Storage requests
do not carry auth tokens in the URL today, but a Storage download URL does carry a bearer
`token=` query parameter. Strip query strings from breadcrumb `data.url` as a backstop.

### L6. `firestore-debug.log` committed

Tracked despite `.gitignore`; it holds only emulator startup output and a local file path. Removed
from the index in this PR.

### V1. Verify: same-origin auth iframe vs `X-Frame-Options: DENY`

For the iOS home-screen app, #260 points `authDomain` at the app's own origin, so the SDK frames
`https://app.notedude.app/__/auth/iframe`. `firebase.json` sends `X-Frame-Options: DENY` on `**`,
which forbids framing even from the same origin. If Hosting applies custom headers to its reserved
`/__/` paths, that iframe is blocked. Test sign-in from the iOS home-screen app on production; if
it fails, exclude `/__/**` from that header (or switch it to `frame-ancestors 'self'` in the CSP).

## What is already in good shape

- Firestore rules: owner-only per `users/{uid}`, closed field lists, 100k content cap, default
  deny for every other path, emulator tests for the rules (#142).
- Redirect handling: same-origin auth hosts are an allowlist; unknown hosts fall back to the
  default domain (`authStrategy.ts`, tested).
- `NEXT_PUBLIC_SKIP_AUTH` is compiled out of production builds; `window.__test*` hooks exist only
  in emulator builds.
- Markdown links: scheme allowlist, `target="_blank"` with `noopener noreferrer`.
- Sentry: no PII, no request bodies, DOM and console breadcrumbs dropped (#206).
- The only privileged code (Admin SDK) is the MCP server, run locally over stdio.
