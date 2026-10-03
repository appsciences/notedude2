import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs/config";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

// Installed PWAs keep running an old bundle, so an error's date says nothing about which
// deploy it came from. Stamping every event with the commit that built it does (#206).
const release = process.env.NEXT_PUBLIC_RELEASE || process.env.GITHUB_SHA;

const nextConfig: NextConfig = {
  output: "export",
  env: release ? { NEXT_PUBLIC_RELEASE: release } : undefined,
};

// Source maps are uploaded only when an auth token is present (the CI deploy build); local
// and PR builds skip the upload, and `silent` spares them the "no auth token" warnings.
export default withSentryConfig(withPWA(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  release: release ? { name: release } : undefined,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  telemetry: false,
  widenClientFileUpload: true,
});
