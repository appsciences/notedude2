import { test } from "node:test";
import assert from "node:assert/strict";
import { gaConfig } from "./analytics.ts";

/**
 * Google Analytics is opt-in and page-views-only (#207). Whether it loads, and exactly
 * what the bootstrap script says, is decided in pure code so it can be tested without a
 * browser.
 */

test("no measurement ID means no config — the script is never loaded", () => {
  assert.equal(gaConfig(undefined), null);
  assert.equal(gaConfig(""), null);
  assert.equal(gaConfig("   "), null);
});

test("an ID that is not a GA4 measurement ID is rejected", () => {
  // It is interpolated into an inline <script>, so anything but G-XXXX must never get in.
  assert.equal(gaConfig("UA-12345-1"), null);
  assert.equal(gaConfig("G-"), null);
  assert.equal(gaConfig("g-abc123"), null);
  assert.equal(gaConfig(`G-ABC123"); alert(1); ("`), null);
  assert.equal(gaConfig("G-ABC 123"), null);
});

test("a valid ID yields the gtag.js URL and a bootstrap that configures only that ID", () => {
  const c = gaConfig(" G-ABC123XYZ ");
  assert.ok(c);
  assert.equal(c.src, "https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ");
  assert.match(c.bootstrap, /window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]/);
  assert.match(c.bootstrap, /gtag\('js',\s*new Date\(\)\)/);
  assert.match(c.bootstrap, /gtag\('config',\s*"G-ABC123XYZ"/);
});

test("the bootstrap is privacy-restrictive and attaches no identity", () => {
  const c = gaConfig("G-ABC123XYZ");
  assert.ok(c);
  assert.match(c.bootstrap, /anonymize_ip:\s*true/);
  assert.match(c.bootstrap, /allow_google_signals:\s*false/);
  assert.match(c.bootstrap, /allow_ad_personalization_signals:\s*false/);
  assert.doesNotMatch(c.bootstrap, /user_id|set_user|user_properties/);
});

test("the bootstrap sends exactly one event: the automatic page_view", () => {
  const c = gaConfig("G-ABC123XYZ");
  assert.ok(c);
  assert.doesNotMatch(c.bootstrap, /gtag\('event'/);
  // The declaration, 'js' and 'config' — nothing else calls gtag.
  assert.equal(c.bootstrap.match(/gtag\(/g)?.length, 3);
});
