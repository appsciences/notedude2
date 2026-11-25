import { test } from "node:test";
import assert from "node:assert/strict";
import { authDomainFor, DEFAULT_AUTH_DOMAIN } from "./authStrategy.ts";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

const win = (host: string, userAgent: string, standalone: boolean) =>
  ({
    location: { host },
    navigator: { userAgent, maxTouchPoints: userAgent === IPHONE_UA ? 5 : 0, standalone },
    matchMedia: () => ({ matches: standalone }),
  }) as unknown as Window;

test("the iOS home-screen app uses the page's own origin for the auth handler", () => {
  assert.equal(authDomainFor(win("app.notedude.app", IPHONE_UA, true)), "app.notedude.app");
  assert.equal(authDomainFor(win("notedude2.web.app", IPHONE_UA, true)), "notedude2.web.app");
});

test("a popup client keeps the default domain, so nothing changes for anyone it works for", () => {
  assert.equal(authDomainFor(win("app.notedude.app", DESKTOP_UA, false)), DEFAULT_AUTH_DOMAIN);
  assert.equal(authDomainFor(win("app.notedude.app", DESKTOP_UA, true)), DEFAULT_AUTH_DOMAIN);
  assert.equal(authDomainFor(win("app.notedude.app", IPHONE_UA, false)), DEFAULT_AUTH_DOMAIN);
});

test("a host the console has not been told about falls back to the default", () => {
  assert.equal(authDomainFor(win("localhost:3000", IPHONE_UA, true)), DEFAULT_AUTH_DOMAIN);
  assert.equal(authDomainFor(win("evil.example", IPHONE_UA, true)), DEFAULT_AUTH_DOMAIN);
});

test("no window (static export, server) means the default", () => {
  assert.equal(authDomainFor(undefined), DEFAULT_AUTH_DOMAIN);
});
