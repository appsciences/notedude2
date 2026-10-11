import * as Sentry from "@sentry/nextjs";
import { sentryOptions, scrubEvent, scrubBreadcrumb } from "@/lib/monitoring";

// Client-only: the app is a static export, so there is no server or edge runtime to
// instrument. With no DSN (dev, tests, forks) `sentryOptions` is null and Sentry is never
// initialised — nothing is sent. See #206 and the "Monitoring" section of spec.md.
const options = sentryOptions({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_RELEASE,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
});

if (options) {
  Sentry.init({
    ...options,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
