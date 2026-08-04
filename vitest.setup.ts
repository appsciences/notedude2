/**
 * Node 24 installs an experimental `localStorage` global that wins over happy-dom's and is
 * an empty object — no `getItem`, no `clear`, nothing (it warns about `--localstorage-file`
 * on startup). Anything reading storage would fail against a stub the browser never has.
 *
 * So the suite installs its own in-memory Storage. The app touches localStorage for the
 * theme, recent search tags, demo notes and the pending share, and all of them should see
 * something that behaves like the real thing.
 */
class MemoryStorage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const storage = new MemoryStorage() as unknown as Storage;

for (const target of [globalThis, globalThis.window].filter(Boolean)) {
  Object.defineProperty(target, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}
