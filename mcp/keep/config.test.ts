import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, loadKeepConfig } from "./config.ts";

test("reads a complete configuration", () => {
  const c = loadKeepConfig({
    GOOGLE_KEEP_SERVICE_ACCOUNT: "/keys/keep.json",
    GOOGLE_KEEP_SUBJECT: "me@corp.com",
    KEEP_ON_LEAVE_SCOPE: "delete",
  } as NodeJS.ProcessEnv);
  assert.deepEqual(c, { keyFile: "/keys/keep.json", subject: "me@corp.com", onLeaveScope: "delete" });
});

test("falls back to the Firebase service account key", () => {
  const c = loadKeepConfig({
    GOOGLE_APPLICATION_CREDENTIALS: "/keys/firebase.json",
    GOOGLE_KEEP_SUBJECT: "me@corp.com",
  } as NodeJS.ProcessEnv);
  assert.equal(c.keyFile, "/keys/firebase.json");
});

test("defaults to the non-destructive leave-scope policy", () => {
  const c = loadKeepConfig({
    GOOGLE_APPLICATION_CREDENTIALS: "/k.json",
    GOOGLE_KEEP_SUBJECT: "me@corp.com",
  } as NodeJS.ProcessEnv);
  assert.equal(c.onLeaveScope, "unlink");
});

test("a missing key file is a clear error", () => {
  assert.throws(
    () => loadKeepConfig({ GOOGLE_KEEP_SUBJECT: "me@corp.com" } as NodeJS.ProcessEnv),
    (e: unknown) => e instanceof ConfigError && /GOOGLE_KEEP_SERVICE_ACCOUNT/.test((e as Error).message)
  );
});

test("a missing subject explains the Workspace requirement", () => {
  assert.throws(
    () => loadKeepConfig({ GOOGLE_APPLICATION_CREDENTIALS: "/k.json" } as NodeJS.ProcessEnv),
    (e: unknown) => e instanceof ConfigError && /gmail\.com/.test((e as Error).message)
  );
});

test("an unrecognised leave-scope policy is rejected rather than assumed", () => {
  assert.throws(
    () =>
      loadKeepConfig({
        GOOGLE_APPLICATION_CREDENTIALS: "/k.json",
        GOOGLE_KEEP_SUBJECT: "me@corp.com",
        KEEP_ON_LEAVE_SCOPE: "purge",
      } as NodeJS.ProcessEnv),
    ConfigError
  );
});
