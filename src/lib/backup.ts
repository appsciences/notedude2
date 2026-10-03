/**
 * Notes backup: serialization, validation and merge for Export / Import (#16).
 *
 * Deliberately pure — no React, Firebase or DOM — so any front end can reuse it (the
 * Claude-artifact port, #201, in particular). Triggering a download or a file picker and
 * writing the merged notes are the caller's job.
 *
 * Format, version 1:
 *   { format: "notedude-backup", version: 1, exportedAt: ISO string, notes: BackupNote[] }
 */

export const BACKUP_FORMAT = "notedude-backup";
export const BACKUP_VERSION = 1;

/** The content cap enforced by `firestore.rules`. Import rejects rather than truncates. */
export const MAX_CONTENT_LENGTH = 100_000;

/** Firestore's own limit on a document id, in bytes; checked conservatively on length. */
const MAX_ID_LENGTH = 1500;

/** A note as stored: exactly the fields the security rules whitelist, plus its id. */
export interface BackupNote {
  id: string;
  content: string;
  pinned: boolean;
  tagPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  notes: BackupNote[];
}

/** Anything note-shaped the app holds in memory; `isNew` marks an untouched draft. */
export type NoteLike = BackupNote & { isNew?: boolean };

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

function pick(n: BackupNote): BackupNote {
  return {
    id: n.id,
    content: n.content,
    pinned: n.pinned,
    tagPinned: n.tagPinned,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

// --- Export --------------------------------------------------------------------------

/**
 * Every note, archived included, oldest first. An untouched draft (`isNew`) is left out —
 * it was never saved and holds nothing the user wrote.
 */
export function buildBackup(notes: readonly NoteLike[], now: Date = new Date()): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    notes: notes
      .filter((n) => !n.isNew)
      .map(pick)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
  };
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2) + "\n";
}

/** `notedude-YYYY-MM-DD.json`, in the user's local date. */
export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `notedude-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// --- Import: validation --------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function validateNote(raw: unknown, index: number): BackupNote {
  const where = `note ${index + 1}`;
  if (!isRecord(raw)) throw new BackupError(`${where} is not an object`);
  const { id, content, pinned, tagPinned, createdAt, updatedAt } = raw;
  if (typeof id !== "string" || id === "" || id === "." || id === ".." || id.includes("/") || id.length > MAX_ID_LENGTH) {
    throw new BackupError(`${where} has an invalid id`);
  }
  if (typeof content !== "string") throw new BackupError(`${where} has no text content`);
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new BackupError(`${where} is longer than the 100,000-character limit`);
  }
  if (typeof pinned !== "boolean" || typeof tagPinned !== "boolean") {
    throw new BackupError(`${where} has an invalid pin flag`);
  }
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt) ||
      typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) {
    throw new BackupError(`${where} has an invalid timestamp`);
  }
  // Unknown keys are dropped here: only whitelisted fields can ever reach a write.
  return { id, content, pinned, tagPinned, createdAt, updatedAt };
}

/**
 * Parse and validate a whole backup file. All or nothing: throws a BackupError with a
 * user-facing message on the first problem, so a caller never writes part of a bad file.
 */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("not a notedude backup file");
  }
  if (!isRecord(data) || data.format !== BACKUP_FORMAT) {
    throw new BackupError("not a notedude backup file");
  }
  if (data.version !== BACKUP_VERSION) {
    throw new BackupError(`unsupported backup version ${String(data.version)}`);
  }
  if (!Array.isArray(data.notes)) throw new BackupError("backup has no notes list");
  const notes = data.notes.map(validateNote);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : "",
    notes,
  };
}

// --- Import: merge -------------------------------------------------------------------

export interface ImportPlan {
  /** The notes to write, in file order. Never includes an id that already exists. */
  toWrite: BackupNote[];
  /** `toWrite.length`. */
  imported: number;
  /** Same id and identical content as a note already present (or earlier in the file). */
  skipped: number;
  /** Of `imported`, how many clashed by id with different content and got a fresh id. */
  renamed: number;
}

/**
 * Decide what an import writes. Nothing existing is ever overwritten:
 * - id not present → imported as is;
 * - same id, identical content → skipped;
 * - same id, different content → imported as a new note under `newId()`.
 * Notes earlier in the same file count as present, so a file with repeats is safe too.
 */
export function planImport(
  existing: readonly BackupNote[],
  incoming: readonly BackupNote[],
  newId: () => string,
): ImportPlan {
  const contentById = new Map(existing.map((n) => [n.id, n.content]));
  const toWrite: BackupNote[] = [];
  let skipped = 0;
  let renamed = 0;

  for (const raw of incoming) {
    const note = pick(raw);
    if (!contentById.has(note.id)) {
      contentById.set(note.id, note.content);
      toWrite.push(note);
      continue;
    }
    if (contentById.get(note.id) === note.content) {
      skipped++;
      continue;
    }
    let id = newId();
    while (contentById.has(id)) id = newId();
    contentById.set(id, note.content);
    toWrite.push({ ...note, id });
    renamed++;
  }

  return { toWrite, imported: toWrite.length, skipped, renamed };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "imported 3 notes", or "imported 3, skipped 2 duplicates". */
export function importSummary(plan: ImportPlan): string {
  if (plan.skipped === 0) return `imported ${plural(plan.imported, "note")}`;
  return `imported ${plan.imported}, skipped ${plural(plan.skipped, "duplicate")}`;
}
