import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * `DISABLE_PWA=true` builds the export without the service worker or the next-pwa client
 * runtime. Used by the Firebase emulator suite in CI (#119).
 *
 * `reloadOnOnline: true` reloads the page the moment connectivity returns. In emulator mode
 * Firestore is configured with `memoryLocalCache()`, so that reload throws away the
 * in-memory mutation queue before it can replay — a write made offline is lost. That is
 * what broke the #74 lost-update test the first time the emulator suite ran against a
 * production build: the pin was applied locally, then vanished on reconnect.
 *
 * These tests were written against `next dev`, where next-pwa is disabled and neither the
 * worker nor the online-reload exists, so this restores the environment they assume rather
 * than weakening them. The PWA layer is still exercised by the main chromium job, which
 * runs against the full export.
 *
 * Production is unaffected: it uses `persistentLocalCache`, whose queue is IndexedDB-backed
 * and survives a reload.
 */
const disablePWA = process.env.NODE_ENV === "development" || process.env.DISABLE_PWA === "true";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: disablePWA,
  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {
  output: "export",
};

export default withPWA(nextConfig);
