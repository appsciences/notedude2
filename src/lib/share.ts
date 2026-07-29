/**
 * Web Share Target plumbing (#110).
 *
 * Android hands a share to `/share` as query params. The app is a static export with no
 * server, so that route cannot write the note itself — it parks the payload here and the
 * app picks it up on mount. localStorage (not sessionStorage) because the installed PWA
 * may open the share in a fresh tab.
 */

export const PENDING_SHARE_KEY = "notedude:pendingShare";

/**
 * Collapse Android's title/text/url triple into one note body. Values are joined by
 * newline in that order, blanks dropped, and duplicates removed — sharing a link often
 * sends the same string as both `text` and `url`.
 */
export function composeSharedNote(params: URLSearchParams): string {
  const parts = ["title", "text", "url"]
    .map((k) => params.get(k)?.trim())
    .filter((v): v is string => !!v);
  return [...new Set(parts)].join("\n");
}

/** Read and clear the parked share, so a reload cannot resurrect it. */
export function takePendingShare(): string | null {
  try {
    const value = localStorage.getItem(PENDING_SHARE_KEY);
    if (value !== null) localStorage.removeItem(PENDING_SHARE_KEY);
    return value && value.trim() !== "" ? value : null;
  } catch {
    // Private-mode Safari and friends can throw on storage access.
    return null;
  }
}
