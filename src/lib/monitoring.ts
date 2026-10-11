/**
 * Sentry configuration that is decided in pure code, so it can be unit-tested without a
 * browser (#206). The one hard rule: note content never leaves the device. Notes are the
 * product, and they can show up in more places than you would think — a DOM breadcrumb for
 * a click carries the clicked element, a console breadcrumb carries whatever was logged,
 * a request carries its query string and body. All of it is stripped here.
 */

export interface SentryEnv {
  dsn?: string;
  release?: string;
  environment?: string;
}

export interface SentryOptions {
  dsn: string;
  release: string | undefined;
  environment: string;
  sendDefaultPii: false;
  tracesSampleRate: 0;
}

/**
 * `null` when there is no DSN: dev, tests and forks then never initialise Sentry and send
 * nothing. Performance tracing is off (`tracesSampleRate: 0`) — this is for errors.
 */
export function sentryOptions({ dsn, release, environment }: SentryEnv): SentryOptions | null {
  const trimmed = dsn?.trim();
  if (!trimmed) return null;
  return {
    dsn: trimmed,
    release: release || undefined,
    environment: environment || "development",
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
}

interface ScrubbableEvent {
  user?: unknown;
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    headers?: unknown;
    query_string?: unknown;
  };
}

/**
 * Backstop for `sendDefaultPii: false`: remove the user and everything on the request
 * except its URL, whatever an integration or a manual `setUser` added.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  const out = { ...event };
  delete out.user;
  if (out.request) {
    const { url } = out.request;
    out.request = url === undefined ? {} : { url };
  }
  return out;
}

interface Crumb {
  category?: string;
}

/**
 * DOM (`ui.click`, `ui.input`) and console breadcrumbs can contain note text, so they are
 * dropped. Navigation and network crumbs carry only routes and status codes and are kept —
 * they are what makes an error reproducible.
 */
export function scrubBreadcrumb<T extends Crumb>(crumb: T): T | null {
  const category = crumb.category ?? "";
  if (category.startsWith("ui.") || category === "console") return null;
  return crumb;
}
