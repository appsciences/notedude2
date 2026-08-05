import { applyOps, type ApplyResult } from "./apply.ts";
import { planSync } from "./plan.ts";
import type { KeepClient, LeaveScopePolicy, NoteStore, SyncOp } from "./types.ts";

/** Orchestrates a run: read both sides, plan, then (unless dry) apply. */

export interface SyncOptions {
  onLeaveScope?: LeaveScopePolicy;
  dryRun?: boolean;
}

export interface SyncReport {
  dryRun: boolean;
  plan: SyncOp[];
  result?: ApplyResult;
}

export async function runSync(
  keep: KeepClient,
  store: NoteStore,
  { onLeaveScope = "unlink", dryRun = false }: SyncOptions = {}
): Promise<SyncReport> {
  const [notes, keepNotes, mappings] = await Promise.all([
    store.listNotes(),
    keep.listNotes(),
    store.listMappings(),
  ]);

  const plan = planSync({ notes, keepNotes, mappings, onLeaveScope });
  if (dryRun) return { dryRun: true, plan };

  return { dryRun: false, plan, result: await applyOps(plan, keep, store) };
}

/** One line per operation, in plain language. */
export function describeOp(op: SyncOp): string {
  switch (op.kind) {
    case "create-keep":
      return `create in Keep      ${op.noteId}`;
    case "replace-keep":
      return `replace in Keep     ${op.noteId} (${op.keepName} → new note)`;
    case "create-notedude":
      return `import from Keep    ${op.keepName}`;
    case "update-notedude":
      return `update in notedude  ${op.noteId}`;
    case "conflict":
      return `CONFLICT            ${op.noteId} — notedude wins, Keep's copy saved as #sync-conflict`;
    case "rebase":
      return `converged           ${op.noteId} (no writes, merge base advanced)`;
    case "archive-notedude":
      return `archive in notedude ${op.noteId} (deleted in Keep)`;
    case "unlink":
      return `unlink              ${op.noteId}${op.deleteKeep ? ` and delete ${op.keepName}` : " (Keep note left in place)"}`;
    case "skip":
      return `skipped             ${op.noteId ?? op.keepName} — ${op.reason}`;
  }
}

/** Human-readable summary, used by both the MCP tool and the CLI. */
export function formatReport(report: SyncReport): string {
  const lines: string[] = [];

  if (report.plan.length === 0) {
    return report.dryRun ? "Dry run: nothing to sync." : "Nothing to sync — both sides are up to date.";
  }

  lines.push(report.dryRun ? `Dry run — ${report.plan.length} operation(s) planned:` : `${report.plan.length} operation(s):`);
  for (const op of report.plan) lines.push(`  ${describeOp(op)}`);

  if (report.result) {
    const { applied, failed, skipped } = report.result;
    lines.push("");
    lines.push(`Applied ${applied.length}, skipped ${skipped.length}, failed ${failed.length}.`);
    for (const f of failed) lines.push(`  FAILED  ${describeOp(f.op)} — ${f.error}`);

    if (report.plan.some((o) => o.kind === "conflict")) {
      lines.push("");
      lines.push("Conflicts were saved as #sync-conflict notes — search that tag to resolve them.");
    }
    if (skipped.some((o) => o.kind === "skip" && o.reason === "has-attachments")) {
      lines.push("");
      lines.push("Notes with Keep attachments were left untouched: the API cannot re-upload media,");
      lines.push("so replacing them would destroy the attachment. Edit those in Keep directly.");
    }
  }

  return lines.join("\n");
}
