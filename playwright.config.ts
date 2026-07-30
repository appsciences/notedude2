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

export default defineConfig({
  testDir: "./e2e",
  timeout: TEST_TIMEOUT,
  expect: { timeout: EXPECT_TIMEOUT },
  // Emulator runs must be serial: every beforeEach wipes the single shared emulator, so
  // parallel workers clear each other's accounts and notes mid-test (#103).
  workers: useEmulator ? 1 : undefined,
  globalSetup: useEmulator ? "./e2e/emulator-setup.ts" : undefined,
  use: {
    baseURL: useEmulator ? "http://localhost:3001" : "http://localhost:3000",
    headless: true,
    // next-pwa is disabled in development but active in a production build, so the export
    // ships a service worker. Nothing here tests offline behaviour, and a worker caching
    // between tests would only add nondeterminism.
    serviceWorkers: "block",
  },
  webServer: useEmulator
    ? {
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
