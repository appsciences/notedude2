import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAppEnv,
  resolveFirebase,
  FirebaseEnvError,
  PRODUCTION_FIREBASE,
  PRODUCTION_SAME_ORIGIN_AUTH_HOSTS,
  nonProductionLabel,
} from "./firebaseConfig.ts";

const STAGING = {
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "notedude2-staging",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:111:web:abc",
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaStagingKey",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "111",
};

test("an unset environment is production, so existing builds keep their project", () => {
  assert.equal(parseAppEnv(undefined), "production");
  assert.equal(parseAppEnv(""), "production");
  const r = resolveFirebase({});
  assert.equal(r.env, "production");
  assert.deepEqual(r.config, PRODUCTION_FIREBASE);
  assert.deepEqual(r.sameOriginAuthHosts, PRODUCTION_SAME_ORIGIN_AUTH_HOSTS);
});

test("a misspelt environment fails instead of becoming production", () => {
  assert.throws(() => parseAppEnv("prod"), FirebaseEnvError);
  assert.throws(() => resolveFirebase({ NEXT_PUBLIC_APP_ENV: "stage" }), FirebaseEnvError);
});

test("staging uses its own project and fills in the default bucket and auth domain", () => {
  const r = resolveFirebase({ NEXT_PUBLIC_APP_ENV: "staging", ...STAGING });
  assert.equal(r.env, "staging");
  assert.equal(r.config.projectId, "notedude2-staging");
  assert.equal(r.config.storageBucket, "notedude2-staging.firebasestorage.app");
  assert.equal(r.config.authDomain, "notedude2-staging.firebaseapp.com");
  assert.deepEqual(r.sameOriginAuthHosts, []);
});

test("staging lists its own same-origin auth hosts", () => {
  const r = resolveFirebase({
    NEXT_PUBLIC_APP_ENV: "staging",
    ...STAGING,
    NEXT_PUBLIC_SAME_ORIGIN_AUTH_HOSTS: " staging.notedude.app, Notedude2-Staging.web.app ",
  });
  assert.deepEqual(r.sameOriginAuthHosts, ["staging.notedude.app", "notedude2-staging.web.app"]);
});

test("a staging build with no project of its own fails rather than writing to production", () => {
  assert.throws(() => resolveFirebase({ NEXT_PUBLIC_APP_ENV: "staging" }), /needs its own Firebase project/);
});

test("staging or development pointed at the production project fails", () => {
  for (const env of ["staging", "development"]) {
    assert.throws(
      () =>
        resolveFirebase({
          NEXT_PUBLIC_APP_ENV: env,
          ...STAGING,
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: "notedude2",
        }),
      /must not use the production project/
    );
  }
});

test("a production build pointed at another project fails", () => {
  assert.throws(
    () => resolveFirebase({ NEXT_PUBLIC_APP_ENV: "production", ...STAGING }),
    /production build must use project notedude2/
  );
});

test("half a config fails instead of mixing two projects", () => {
  assert.throws(
    () =>
      resolveFirebase({
        NEXT_PUBLIC_APP_ENV: "staging",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "notedude2-staging",
      }),
    /missing NEXT_PUBLIC_FIREBASE_APP_ID, NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID/
  );
});

test("development against the emulators may keep the production id, which never leaves the machine", () => {
  const r = resolveFirebase({ NEXT_PUBLIC_APP_ENV: "development", NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true" });
  assert.equal(r.env, "development");
  assert.equal(r.config.projectId, "notedude2");
  assert.deepEqual(r.sameOriginAuthHosts, []);
});

test("development without the emulators needs a project of its own", () => {
  assert.throws(() => resolveFirebase({ NEXT_PUBLIC_APP_ENV: "development" }), /USE_FIREBASE_EMULATOR/);
});

test("only non-production builds carry a label", () => {
  assert.equal(nonProductionLabel("production"), null);
  assert.equal(nonProductionLabel("staging"), "staging");
  assert.equal(nonProductionLabel("development"), "development");
});
