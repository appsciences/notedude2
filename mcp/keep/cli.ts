import "dotenv/config";
import admin from "firebase-admin";
import { GoogleKeepClient } from "./client.ts";
import { ConfigError, loadKeepConfig } from "./config.ts";
import { NotedudeStore } from "./store.ts";
import { formatReport, runSync } from "./sync.ts";
import type { LeaveScopePolicy } from "./types.ts";

/**
 * CLI entry point for Keep sync — `npm run sync:keep`, suitable for cron/launchd.
 *
 *   --dry-run                 print the plan without executing it
 *   --on-leave-scope=delete   delete the Keep note when a note leaves scope
 *                             (default: unlink, which leaves it in place)
 */

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const policyArg = argv.find((a) => a.startsWith("--on-leave-scope="))?.split("=")[1];

if (policyArg && policyArg !== "unlink" && policyArg !== "delete") {
  console.error(`--on-leave-scope must be "unlink" or "delete", got "${policyArg}".`);
  process.exit(2);
}

let config;
try {
  config = loadKeepConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(2);
  }
  throw err;
}

const uid = process.env.NOTEDUDE_USER_UID;
if (!uid) {
  console.error("Missing NOTEDUDE_USER_UID in .env");
  process.exit(2);
}

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: "notedude2" });

const report = await runSync(
  new GoogleKeepClient({ keyFile: config.keyFile, subject: config.subject }),
  new NotedudeStore(admin.firestore(), uid),
  { onLeaveScope: (policyArg as LeaveScopePolicy) ?? config.onLeaveScope, dryRun }
);

console.log(formatReport(report));

// A failed operation must surface to cron as a non-zero exit.
process.exit(report.result && report.result.failed.length > 0 ? 1 : 0);
