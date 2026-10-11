import type { LeaveScopePolicy } from "./types.ts";

/**
 * Environment configuration for Keep sync.
 *
 * The Keep service account is separate from the Firebase one because it needs
 * domain-wide delegation authorised in the Workspace admin console, which the
 * Firebase key normally does not have. It falls back to the Firebase key so a
 * single-key setup still works.
 */
export interface KeepSyncConfig {
  keyFile: string;
  subject: string;
  onLeaveScope: LeaveScopePolicy;
}

export class ConfigError extends Error {}

export function loadKeepConfig(env: NodeJS.ProcessEnv = process.env): KeepSyncConfig {
  const keyFile = env.GOOGLE_KEEP_SERVICE_ACCOUNT || env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) {
    throw new ConfigError(
      "Missing GOOGLE_KEEP_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS) — " +
        "path to a service account key with domain-wide delegation for the Keep scope."
    );
  }

  const subject = env.GOOGLE_KEEP_SUBJECT;
  if (!subject) {
    throw new ConfigError(
      "Missing GOOGLE_KEEP_SUBJECT — the Workspace user to impersonate, e.g. you@yourdomain.com. " +
        "The Keep API is not available for personal @gmail.com accounts."
    );
  }

  const raw = env.KEEP_ON_LEAVE_SCOPE ?? "unlink";
  if (raw !== "unlink" && raw !== "delete") {
    throw new ConfigError(`KEEP_ON_LEAVE_SCOPE must be "unlink" or "delete", got "${raw}".`);
  }

  return { keyFile, subject, onLeaveScope: raw };
}
