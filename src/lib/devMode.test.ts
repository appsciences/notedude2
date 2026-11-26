import { test } from "node:test";
import assert from "node:assert/strict";
import { skipAuthEnabled, DEV_MODE_LABEL } from "./devMode.ts";

test("the sign-in bypass is on only when the flag is exactly 'true' outside production", () => {
  assert.equal(skipAuthEnabled("true", "development"), true);
  assert.equal(skipAuthEnabled("true", "test"), true);
  assert.equal(skipAuthEnabled(undefined, "development"), false);
  assert.equal(skipAuthEnabled("false", "development"), false);
  assert.equal(skipAuthEnabled("1", "development"), false);
});

test("a production build never skips sign-in, even with the flag set", () => {
  assert.equal(skipAuthEnabled("true", "production"), false);
});

test("the dev-mode banner says sign-in is skipped and names the flag that does it (#230)", () => {
  assert.match(DEV_MODE_LABEL, /sign-in skipped/);
  assert.match(DEV_MODE_LABEL, /NEXT_PUBLIC_SKIP_AUTH/);
});
