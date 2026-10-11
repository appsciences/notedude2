/**
 * Save reliability (#76, #198) — the parts that need no Firebase and no React.
 *
 * `NoteJournal` keeps every unacknowledged content edit in synchronous storage, so a closed
 * tab, a reload or a rejected write cannot lose text. `SaveTracker` turns write promises into
 * a status the mode line can show, and retries what failed.
 *
 * Kept free of imports so `node --test` can run it directly.
 */

/** The Firestore rules' cap on `content` (see firestore.rules). Longer content is never sent. */
export const MAX_NOTE_LENGTH = 100_000;

/** The subset of the Web Storage API the journal uses. */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface JournalNote {
  id: string;
  content: string;
  pinned: boolean;
  tagPinned: boolean;
  createdAt: number;
}

export interface JournalEntry extends JournalNote {
  /** Client clock at the time of the edit. Compared with the server's `updatedAt` on replay. */
  editedAt: number;
  /** Identifies this revision, so acknowledging an older write never drops newer text. */
  rev: string;
}

const PREFIX = "notedude:unsynced:";

/**
 * Unsynced content, one storage key per note (`notedude:unsynced:<uid>:<noteId>`) so tabs
 * sharing the storage never race on a single blob. Every storage call is guarded: a full or
 * blocked storage degrades to "no journal", never to an exception in the typing path.
 */
export class NoteJournal {
  private seq = 0;
  /** Entries storage refused (quota, blocked): kept for this session at least. */
  private mem = new Map<string, JournalEntry>();
  /**
   * Notes whose unsynced text *this* tab owns (wrote or replayed). Storage is shared between
   * tabs, but only the owning tab should hold its local copy over incoming snapshots — another
   * tab doing so would sit on stale text.
   */
  private owned = new Set<string>();
  private storage: KV | null;
  private uid: string;
  private now: () => number;

  constructor(storage: KV | null, uid: string, now: () => number = Date.now) {
    this.storage = storage;
    this.uid = uid;
    this.now = now;
  }

  private key(id: string) {
    return `${PREFIX}${this.uid}:${id}`;
  }

  put(note: JournalNote): JournalEntry {
    this.owned.add(note.id);
    const entry: JournalEntry = {
      id: note.id,
      content: note.content,
      pinned: note.pinned,
      tagPinned: note.tagPinned,
      createdAt: note.createdAt,
      editedAt: this.now(),
      rev: `${this.now().toString(36)}-${(this.seq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    };
    try {
      if (!this.storage) throw new Error("no storage");
      this.storage.setItem(this.key(note.id), JSON.stringify(entry));
      this.mem.delete(note.id);
    } catch {
      // Quota or blocked storage: keep it in memory, so the write still goes out and is
      // still retried — it just will not survive a reload.
      this.mem.set(note.id, entry);
    }
    return entry;
  }

  get(id: string): JournalEntry | null {
    try {
      const raw = this.storage?.getItem(this.key(id));
      if (raw) return JSON.parse(raw) as JournalEntry;
    } catch {
      /* fall through to memory */
    }
    return this.mem.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.get(id) !== null;
  }

  all(): JournalEntry[] {
    const out: JournalEntry[] = [...this.mem.values()];
    try {
      const s = this.storage;
      if (!s) return out;
      const mine = `${PREFIX}${this.uid}:`;
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(mine)) keys.push(k);
      }
      for (const k of keys) {
        const raw = s.getItem(k);
        if (!raw) continue;
        try {
          const e = JSON.parse(raw) as JournalEntry;
          if (!this.mem.has(e.id)) out.push(e);
        } catch {
          /* a corrupt entry is skipped, not fatal */
        }
      }
    } catch {
      /* blocked storage */
    }
    return out;
  }

  /** The server acknowledged revision `rev`: drop the entry, unless newer text replaced it. */
  ack(id: string, rev: string) {
    if (this.get(id)?.rev === rev) this.remove(id);
  }

  /** Take ownership of an entry found in storage (replayed on load). */
  claim(id: string) {
    this.owned.add(id);
  }

  /** Whether this tab holds unsynced text for the note — see `owned`. */
  ownsUnsynced(id: string): boolean {
    if (!this.owned.has(id)) return false;
    if (this.has(id)) return true;
    this.owned.delete(id); // acknowledged, possibly by another tab
    return false;
  }

  remove(id: string) {
    this.mem.delete(id);
    this.owned.delete(id);
    try {
      this.storage?.removeItem(this.key(id));
    } catch {
      /* blocked storage */
    }
  }
}

/** Firestore error code (`permission-denied`, `unavailable`, …), or `unknown`. */
export function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && code ? code : "unknown";
}

export type SaveState = "saved" | "saving" | "offline" | "error" | "too-long";

export interface SaveStatus {
  state: SaveState;
  /** What the mode line says. Empty for `saved`. */
  message: string;
  /** The Firestore error code, for `error`. */
  code?: string;
}

/** Shown as `saving…` only once a write has been in flight this long while online. */
export const SLOW_SAVE_MS = 2000;

const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;

type Op = () => Promise<void>;

interface RunOptions {
  /** Error codes that mean "give up on this write" rather than "retry it" (e.g. not-found). */
  dropOn?: string[];
}

interface Target {
  /** Sequence number of the most recent write issued for this target. */
  latest: number;
  /** In-flight writes, by sequence number, with their start time. */
  inflight: Map<number, number>;
  failure: { op: Op; code: string; options: RunOptions } | null;
  waiters: ((ok: boolean) => void)[];
}

/**
 * Tracks every write by target (`content:<id>`, `pin:<id>`, …). Only the most recent write
 * to a target decides its outcome, so a stale write that fails late neither reports nor
 * retries old content.
 */
export class SaveTracker {
  private targets = new Map<string, Target>();
  private tooLong = new Map<string, number>();
  private listeners = new Set<() => void>();
  private seq = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryDelay = RETRY_MIN_MS;
  private scheduleRetries: boolean;
  private now: () => number;

  constructor(opts: { scheduleRetries?: boolean; now?: () => number } = {}) {
    this.scheduleRetries = opts.scheduleRetries ?? true;
    this.now = opts.now ?? Date.now;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private target(key: string): Target {
    let t = this.targets.get(key);
    if (!t) {
      t = { latest: 0, inflight: new Map(), failure: null, waiters: [] };
      this.targets.set(key, t);
    }
    return t;
  }

  /** Runs `op` as the newest write to `key`. Resolves true when it was acknowledged. */
  run(key: string, op: Op, options: RunOptions = {}): Promise<boolean> {
    const t = this.target(key);
    const n = ++this.seq;
    t.latest = n;
    t.inflight.set(n, this.now());
    this.emit();
    let p: Promise<void>;
    try {
      p = op();
    } catch (err) {
      p = Promise.reject(err);
    }
    return p.then(
      () => this.settle(key, n, null, op, options),
      (err) => this.settle(key, n, err ?? new Error("write failed"), op, options)
    );
  }

  private settle(key: string, n: number, err: unknown, op: Op, options: RunOptions): boolean {
    const t = this.target(key);
    t.inflight.delete(n);
    if (n === t.latest) {
      if (err === null) {
        t.failure = null;
      } else {
        const code = errorCode(err);
        console.error(`Write failed (${key}):`, err);
        t.failure = options.dropOn?.includes(code) ? null : { op, code, options };
      }
    }
    if (t.inflight.size === 0) {
      const ok = !t.failure;
      for (const w of t.waiters.splice(0)) w(ok);
    }
    if (this.hasFailures()) this.scheduleRetry();
    else this.retryDelay = RETRY_MIN_MS;
    this.emit();
    return n === t.latest ? err === null : true;
  }

  /** Resolves once nothing is in flight for `key`: true if its latest write was acknowledged. */
  whenSettled(key: string): Promise<boolean> {
    const noteId = key.startsWith("content:") ? key.slice("content:".length) : null;
    if (noteId && this.tooLong.has(noteId)) return Promise.resolve(false);
    const t = this.targets.get(key);
    if (!t || t.inflight.size === 0) return Promise.resolve(!t?.failure);
    return new Promise((resolve) => t.waiters.push(resolve));
  }

  hasFailures(): boolean {
    for (const t of this.targets.values()) if (t.failure) return true;
    return false;
  }

  /** Re-runs every failed write. */
  async retryFailed(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    const jobs: Promise<boolean>[] = [];
    for (const [key, t] of this.targets) {
      if (t.failure && t.inflight.size === 0) jobs.push(this.run(key, t.failure.op, t.failure.options));
    }
    await Promise.all(jobs);
  }

  private scheduleRetry() {
    if (!this.scheduleRetries || this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.retryFailed();
    }, delay);
  }

  /** Forget a target entirely — its note was discarded or deleted. */
  forget(key: string) {
    const t = this.targets.get(key);
    if (!t) return;
    t.failure = null;
    if (t.inflight.size === 0) this.targets.delete(key);
    this.emit();
  }

  markTooLong(noteId: string, length: number) {
    if (this.tooLong.get(noteId) === length) return;
    this.tooLong.set(noteId, length);
    this.emit();
  }

  clearTooLong(noteId: string) {
    if (this.tooLong.delete(noteId)) this.emit();
  }

  /** The single most serious thing to tell the user, given connectivity and the time. */
  status(online: boolean, now: number = this.now()): SaveStatus {
    for (const length of this.tooLong.values()) {
      return {
        state: "too-long",
        message: `note too long to sync: ${length}/${MAX_NOTE_LENGTH} chars — kept on this device`,
      };
    }
    for (const t of this.targets.values()) {
      if (t.failure) {
        return { state: "error", message: "couldn't save — kept on this device, retrying", code: t.failure.code };
      }
    }
    let oldest = Infinity;
    for (const t of this.targets.values()) for (const started of t.inflight.values()) oldest = Math.min(oldest, started);
    if (oldest !== Infinity) {
      if (!online) return { state: "offline", message: "offline — saved on this device, will sync" };
      if (now - oldest >= SLOW_SAVE_MS) return { state: "saving", message: "saving…" };
    }
    return { state: "saved", message: "" };
  }
}
