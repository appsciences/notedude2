type KeyLike = Pick<KeyboardEvent, "key" | "code" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey">;

/**
 * Shift+Y, the archive / unarchive key (#75). Matching `e.key === "Y"` alone missed the key
 * when it arrived as a lowercase `y` with Shift held: Caps Lock flips the case, and some
 * automation tools send the base key plus a Shift modifier (#295). A non-Latin layout types
 * another letter on that key, so `code` is the fallback there. On QWERTZ that physical key
 * types `z`, which is left alone. Modifier chords are not archive: #168 (Cmd+Y) was not planned.
 */
export function isArchiveKey(e: KeyLike): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.key === "Y") return true;
  if (!e.shiftKey) return false;
  if (e.key === "y") return true;
  return e.code === "KeyY" && !/^[a-z]$/i.test(e.key);
}
