/**
 * Which Firebase project a build talks to (#171).
 *
 * Production, staging and local development must never share data, credentials or auth
 * configuration. A hosting preview channel on the production project looks like a staging
 * site but writes real notes, so "staging" here means a separate Firebase project with its
 * own Auth, Firestore and Storage.
 *
 * This is pure code so it can be unit-tested and called from `next.config.ts` at build time,
 * where a misconfigured build fails before anything is deployed.
 */

export type AppEnv = "development" | "staging" | "production";

export interface FirebaseWebConfig {
  projectId: string;
  appId: string;
  storageBucket: string;
  apiKey: string;
  authDomain: string;
  messagingSenderId: string;
}

export interface ResolvedFirebase {
  env: AppEnv;
  config: FirebaseWebConfig;
  /**
   * Hosts that serve Firebase's auth handler from their own origin and are registered as
   * redirect URIs on the OAuth client (see authStrategy.ts, #260). Console-side, per project.
   */
  sameOriginAuthHosts: string[];
}

/** The production project's web config. Every value here is a public client identifier. */
export const PRODUCTION_PROJECT_ID = "notedude2";
export const PRODUCTION_FIREBASE: FirebaseWebConfig = {
  projectId: PRODUCTION_PROJECT_ID,
  appId: "1:584175873685:web:834d279663e0c171e6359c",
  storageBucket: "notedude2.firebasestorage.app",
  apiKey: "AIzaSyD_emPP1O3Q2tY5hz7ltxEyh41sJ65SOOE",
  authDomain: "notedude2.firebaseapp.com",
  messagingSenderId: "584175873685",
};
export const PRODUCTION_SAME_ORIGIN_AUTH_HOSTS = ["app.notedude.app", "notedude2.web.app"];

/**
 * The build-time inputs. Next.js inlines `NEXT_PUBLIC_*` only where it sees the literal
 * `process.env.NEXT_PUBLIC_X`, so callers in browser code must spell each one out rather
 * than passing `process.env` whole.
 */
export interface FirebaseEnvInput {
  NEXT_PUBLIC_APP_ENV?: string;
  NEXT_PUBLIC_USE_FIREBASE_EMULATOR?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_APP_ID?: string;
  NEXT_PUBLIC_FIREBASE_API_KEY?: string;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  NEXT_PUBLIC_SAME_ORIGIN_AUTH_HOSTS?: string;
}

export class FirebaseEnvError extends Error {
  constructor(message: string) {
    super(`[firebase env] ${message}`);
    this.name = "FirebaseEnvError";
  }
}

/**
 * Unset means production, so every build that exists today keeps talking to the project it
 * always has. Anything that is not one of the three names is a typo, and a typo must not
 * quietly become production.
 */
export function parseAppEnv(raw: string | undefined): AppEnv {
  const value = raw?.trim().toLowerCase();
  if (!value) return "production";
  if (value === "development" || value === "staging" || value === "production") return value;
  throw new FirebaseEnvError(`NEXT_PUBLIC_APP_ENV must be development, staging or production, not "${raw}"`);
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hostList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** A complete web config from `NEXT_PUBLIC_FIREBASE_*`, or null when none are set. */
function configFromEnv(input: FirebaseEnvInput): FirebaseWebConfig | null {
  const projectId = clean(input.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const appId = clean(input.NEXT_PUBLIC_FIREBASE_APP_ID);
  const apiKey = clean(input.NEXT_PUBLIC_FIREBASE_API_KEY);
  const messagingSenderId = clean(input.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
  if (!projectId && !appId && !apiKey && !messagingSenderId) return null;

  const missing = Object.entries({
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
    NEXT_PUBLIC_FIREBASE_APP_ID: appId,
    NEXT_PUBLIC_FIREBASE_API_KEY: apiKey,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: messagingSenderId,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    // Half a config would mix two projects: one project's API key with another's data.
    throw new FirebaseEnvError(`incomplete Firebase config, missing ${missing.join(", ")}`);
  }

  return {
    projectId: projectId!,
    appId: appId!,
    apiKey: apiKey!,
    messagingSenderId: messagingSenderId!,
    storageBucket: clean(input.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) ?? `${projectId}.firebasestorage.app`,
    authDomain: clean(input.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) ?? `${projectId}.firebaseapp.com`,
  };
}

/**
 * Pick the project for this build, and refuse the combinations that would let a test build
 * touch real notes or a production build point somewhere else.
 *
 * - production: the production project, always. An override naming another project fails.
 * - staging: a complete `NEXT_PUBLIC_FIREBASE_*` config for a project that is not production.
 *   There is no fallback; a staging build with no config fails rather than writing to prod.
 * - development: the emulators, or a config that is not production.
 */
export function resolveFirebase(input: FirebaseEnvInput): ResolvedFirebase {
  const env = parseAppEnv(input.NEXT_PUBLIC_APP_ENV);
  const emulator = input.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";
  const override = configFromEnv(input);
  const extraHosts = hostList(input.NEXT_PUBLIC_SAME_ORIGIN_AUTH_HOSTS);

  if (env === "production") {
    if (override && override.projectId !== PRODUCTION_PROJECT_ID) {
      throw new FirebaseEnvError(
        `a production build must use project ${PRODUCTION_PROJECT_ID}, not ${override.projectId}; ` +
          "set NEXT_PUBLIC_APP_ENV=staging or development for another project"
      );
    }
    return {
      env,
      config: override ?? PRODUCTION_FIREBASE,
      sameOriginAuthHosts: override ? extraHosts : PRODUCTION_SAME_ORIGIN_AUTH_HOSTS,
    };
  }

  if (!override) {
    // The emulators never reach the network, so the production project id is harmless there
    // (the emulator suite and e2e fixtures are keyed on it).
    if (env === "development" && emulator) {
      return { env, config: PRODUCTION_FIREBASE, sameOriginAuthHosts: [] };
    }
    throw new FirebaseEnvError(
      `a ${env} build needs its own Firebase project: set NEXT_PUBLIC_FIREBASE_PROJECT_ID, ` +
        "NEXT_PUBLIC_FIREBASE_APP_ID, NEXT_PUBLIC_FIREBASE_API_KEY and " +
        "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" +
        (env === "development" ? ", or NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true" : "")
    );
  }

  if (override.projectId === PRODUCTION_PROJECT_ID && !emulator) {
    throw new FirebaseEnvError(
      `a ${env} build must not use the production project ${PRODUCTION_PROJECT_ID}`
    );
  }

  return { env, config: override, sameOriginAuthHosts: extraHosts };
}

/**
 * The label every non-production page carries, so nobody mistakes staging for the real
 * thing (#171). Null for production, which shows nothing.
 */
export function nonProductionLabel(env: AppEnv): string | null {
  return env === "production" ? null : env;
}
