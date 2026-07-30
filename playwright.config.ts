import { defineConfig } from "@playwright/test";

const useEmulator = process.env.FIREBASE_ROUNDTRIP === "true";
const isCI = !!process.env.CI;

// A GitHub runner serves these tests from `next dev`, which compiles each route on demand
// and is far slower than a warm local dev server. The first CI run finished in 12.2 minutes
// with 50 tests timing out on the default 5s expect — waiting for the app to render at all,
// not on anything the app got wrong. The timeouts below are headroom for that, not a licence
// for slow assertions: locally the same suite passes in under two minutes. See #114.
const TEST_TIMEOUT = isCI ? 60_000 : 15_000;
const EXPECT_TIMEOUT = isCI ? 20_000 : 5_000;

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
  },
  webServer: useEmulator
    ? {
        command: "npm run dev -- -p 3001",
        port: 3001,
        reuseExistingServer: true,
        env: { NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true" },
      }
    : {
        command: "npm run dev",
        port: 3000,
        reuseExistingServer: !isCI,
        // Next's cold start on a CI runner can outrun the 60s default.
        timeout: isCI ? 180_000 : undefined,
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
