import { defineConfig } from "@playwright/test";

const useEmulator = process.env.FIREBASE_ROUNDTRIP === "true";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15000,
  globalSetup: useEmulator ? "./e2e/emulator-setup.ts" : undefined,
  use: {
    baseURL: useEmulator ? "http://localhost:3001" : "http://localhost:3000",
    headless: true,
  },
  webServer: useEmulator
    ? {
        command: "npm run dev -- -p 3001",
        port: 3001,
        reuseExistingServer: false,
        env: { NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true" },
      }
    : {
        command: "npm run dev",
        port: 3000,
        reuseExistingServer: !process.env.CI,
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
