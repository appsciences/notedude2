import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // Never reload on reconnect: it threw away the open editor and queued writes, and Firestore
  // reconnects on its own. The app retries failed saves on `online` instead (#137, #76).
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {
  output: "export",
};

export default withPWA(nextConfig);
