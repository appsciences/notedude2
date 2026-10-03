import { test } from "node:test";
import assert from "node:assert/strict";
import { sentryOptions, scrubEvent, scrubBreadcrumb } from "./monitoring.ts";

/**
 * Sentry is opt-in and must never carry note content (#206). Everything that decides
 * *whether* and *what* we send is pure, so it is tested here without a browser.
 */

test("no DSN means no options — Sentry is never initialised", () => {
  assert.equal(sentryOptions({}), null);
  assert.equal(sentryOptions({ dsn: "" }), null);
  assert.equal(sentryOptions({ dsn: "   " }), null);
});

test("with a DSN, options carry release and environment and never send PII", () => {
  const o = sentryOptions({ dsn: "https://k@o1.ingest.sentry.io/1", release: "abc123", environment: "production" });
  assert.ok(o);
  assert.equal(o.dsn, "https://k@o1.ingest.sentry.io/1");
  assert.equal(o.release, "abc123");
  assert.equal(o.environment, "production");
  assert.equal(o.sendDefaultPii, false);
  assert.equal(o.tracesSampleRate, 0);
});

test("environment defaults to 'development' and release to undefined", () => {
  const o = sentryOptions({ dsn: "https://k@o1.ingest.sentry.io/1" });
  assert.ok(o);
  assert.equal(o.environment, "development");
  assert.equal(o.release, undefined);
});

test("scrubEvent drops user, request data/cookies/headers and keeps the error", () => {
  const event = {
    message: "boom",
    exception: { values: [{ type: "TypeError", value: "x is not a function" }] },
    user: { id: "u1", email: "a@b.c", ip_address: "1.2.3.4" },
    request: {
      url: "https://notedude2.web.app/",
      data: "note body text",
      cookies: { a: "b" },
      headers: { cookie: "a=b", "user-agent": "UA" },
      query_string: "q=secret note search",
    },
  };
  const out = scrubEvent(event);
  assert.equal(out.user, undefined);
  assert.equal(out.request?.data, undefined);
  assert.equal(out.request?.cookies, undefined);
  assert.equal(out.request?.headers, undefined);
  assert.equal(out.request?.query_string, undefined);
  assert.equal(out.request?.url, "https://notedude2.web.app/");
  assert.equal(out.message, "boom");
  assert.deepEqual(out.exception, event.exception);
});

test("scrubEvent tolerates an event with no user or request", () => {
  assert.deepEqual(scrubEvent({ message: "m" }), { message: "m" });
});

test("scrubBreadcrumb drops DOM and console crumbs — they can hold note text", () => {
  assert.equal(scrubBreadcrumb({ category: "ui.click", message: "div.note > p" }), null);
  assert.equal(scrubBreadcrumb({ category: "ui.input", message: "textarea" }), null);
  assert.equal(scrubBreadcrumb({ category: "console", message: "saving: my secret note" }), null);
});

test("scrubBreadcrumb keeps navigation and network crumbs", () => {
  const nav = { category: "navigation", data: { from: "/", to: "/share" } };
  const xhr = { category: "fetch", data: { url: "https://firestore.googleapis.com/x", status_code: 200 } };
  assert.deepEqual(scrubBreadcrumb(nav), nav);
  assert.deepEqual(scrubBreadcrumb(xhr), xhr);
});
