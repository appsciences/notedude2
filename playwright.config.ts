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
const TEST_TIMEOUT = isCI ? 30_000 : 15_000;
const EXPECT_TIMEOUT = isCI ? 10_000 : 5_000;

/**
 * Headless is the default and the only mode CI ever uses — it is faster, and nothing in
 * the suite needs to be watched.
 *
 * `HEADED=1` opens a real browser window for the rare run that genuinely needs a human in
 * the loop: a real Google sign-in, for instance, which cannot be scripted (the emulator
 * suite signs in through `__testSignIn` precisely to avoid it). Playwright's own `--headed`
 * flag works too and wins over this.
 */
const headed = process.env.HEADED === "1" || process.env.HEADED === "true";

/**
 * Retries are for the emulator suite only, and only on CI.
 *
 * That suite is known to flake a test or two per full run (#103, #122, #128), and it now
 * gates the deploy — a retry keeps a known flake from blocking a good merge, while a
 * genuine regression fails its retry too and still blocks.
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
          env: { NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true" },
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
