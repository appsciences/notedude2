import { defineConfig } from "@playwright/test";

const useEmulator = process.env.FIREBASE_ROUNDTRIP === "true";
const isCI = !!process.env.CI;

// CI runs the suite against the **production static export**, not `next dev`.
//
// Dev mode compiles each route on demand, which is pathologically slow on a GitHub runner:
// the suite took 12 minutes with 50 failures, and simply widening the timeouts made it
// 37 minutes with 55 — the app frequently never became interactive at all, so more headroom
// only bought slower failures. The export is also what actually ships, so this tests the
// real artifact. Locally `next dev` is kept for its fast rebuild loop. See #114.
// The emulator tests get far more headroom on CI: several drive two browser contexts
// through an offline/online cycle and wait for a write queue to replay, which a shared
// runner does much more slowly than a laptop. Their own sync assertions wait up to 30s
// (see SYNC_TIMEOUT in firebase-roundtrip.spec.ts), so the per-test budget has to exceed
// that or the test times out before the assertion can succeed. See #119.
const TEST_TIMEOUT = isCI ? (useEmulator ? 90_000 : 30_000) : 15_000;
const EXPECT_TIMEOUT = isCI ? 10_000 : 5_000;

/**
 * Headless is the default, set explicitly here rather than left to Playwright's implicit
 * default, and no spec or fixture may hard-code `headless: false` — one such line would
 * open a browser on every run, including on CI, which has no display at all.
 *
 * Headed is a per-run opt-in for watching a run you are debugging: `E2E_HEADED=1`, or
 * Playwright's own `--headed`, which wins over this.
 *
 * A scripted login is *not* a reason to go headed — the emulator suite signs in through
 * `__testSignIn` with no window at all. Reserve it for genuine manual interaction, such as
 * a real Google SSO/MFA prompt. Nothing committed here needs it.
 */
const headed = process.env.E2E_HEADED === "1" || process.env.E2E_HEADED === "true";

/**
 * Retries are for the emulator suite only, and only on CI.
 *
 * They are insurance against a shared runner's networking, not a way to paper over known
 * failures: the two deterministic ones this suite hit when it first ran in CI were tracked
 * to root cause and fixed, not retried away (the PWA online-reload discarding queued writes,
 * and a welcome-note seeding race in `loadAndSignIn`). The suite now passes 272/272 with
 * retries disabled. If a test starts needing its retry, that is a signal worth reading —
 * see #103, #122, #128.
 *
 * The chromium suite deliberately gets none: it has been stable, so a retry there would
 * only hide a newly flaky test instead of surfacing it.
 */
const RETRIES = isCI && useEmulator ? 2 : 0;

export default defineConfig({
  testDir: "./e2e",
  timeout: TEST_TIMEOUT,
  expect: { timeout: EXPECT_TIMEOUT },
  retries: RETRIES,
  // Emulator runs must be serial: every beforeEach wipes the single shared emulator, so
  // parallel workers clear each other's accounts and notes mid-test (#103).
  workers: useEmulator ? 1 : undefined,
  globalSetup: useEmulator ? "./e2e/emulator-setup.ts" : undefined,
  use: {
    baseURL: useEmulator ? "http://localhost:3001" : "http://localhost:3000",
    headless: !headed,
    // next-pwa is disabled in development but active in a production build, so the export
    // ships a service worker. Nothing here tests offline behaviour, and a worker caching
    // between tests would only add nondeterminism.
    serviceWorkers: "block",
  },
  webServer: useEmulator
    ? isCI
      ? {
          // Same reasoning as the non-emulator branch below: `next dev` is too slow on a
          // runner. NEXT_PUBLIC_USE_FIREBASE_EMULATOR is inlined at *build* time for a
          // static export, so it has to be set for `npm run build`, not just the serve
          // that follows — `env` covers both, since it applies to the whole command (#119).
          command: "npm run build && npx serve out -l 3001",
          port: 3001,
          reuseExistingServer: false,
          timeout: 300_000,
          env: {
            NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true",
            // Build without the PWA runtime. `reloadOnOnline: true` reloads the page when
            // connectivity returns, which discards Firestore's in-memory mutation queue
            // (emulator mode uses memoryLocalCache) before a write made offline can replay.
            // That is exactly what the #74 lost-update test exercises. See next.config.ts.
            DISABLE_PWA: "true",
          },
        }
      : {
          command: "npm run dev -- -p 3001",
          port: 3001,
          reuseExistingServer: true,
          env: { NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true" },
        }
    : isCI
      ? {
          // `serve` resolves /test and /share to test.html and share.html, matching the
          // clean-URL behaviour Firebase Hosting gives the deployed site.
          command: "npm run build && npx serve out -l 3000",
          port: 3000,
          reuseExistingServer: false,
          timeout: 300_000,
        }
      : {
          command: "npm run dev",
          port: 3000,
          reuseExistingServer: true,
        },
  projects: useEmulator
    ? [{ name: "firebase-roundtrip", use: { browserName: "chromium" } }]
    : [
        {
          name: "chromium",
          testIgnore: ["**/firebase-roundtrip.spec.ts"],
          use: { browserName: "chromium" },
        },
      ],
});
