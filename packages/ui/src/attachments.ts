/**
 * Attachments live in a note as a Markdown link whose target is `attach:<id>` — see the
 * Attachments section of spec.md. This module is the one place that writes and reads that
 * syntax, so the editor, the renderer and the removal sweep all agree on it.
 */

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface AttachmentRef {
  id: string;
  name: string;
  image: boolean;
}

export interface FoundAttachment extends AttachmentRef {
  /** Offsets of the whole `![name](attach:id)` in the text it was found in. */
  start: number;
  end: number;
}

/** `![name](attach:id)` or `[name](attach:id)`. The id is alphanumeric only, which is what
 *  keeps a hand-typed target from reaching storage with a path in it. */
export const ATTACHMENT_RE = /(!?)\[([^\]\n]*)\]\(attach:([A-Za-z0-9]{8,64})\)/g;

/** SVG is left out on purpose: it can carry script, so it opens as a file, never inline. */
export function isImageType(contentType: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i.test(contentType);
}

export function attachmentRef({ id, name, image }: AttachmentRef): string {
  return `${image ? "!" : ""}[${name}](attach:${id})`;
}

/** A file name safe to put inside `[…]`: no path, no control characters, no brackets. */
export function sanitizeAttachmentName(raw: string): string {
  const leaf = raw.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .trim()
    .slice(0, 255);
  return cleaned || "file";
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function newAttachmentId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

export function findAttachments(text: string): FoundAttachment[] {
  const out: FoundAttachment[] = [];
  for (const m of text.matchAll(ATTACHMENT_RE)) {
    out.push({
      id: m[3],
      name: m[2],
      image: m[1] === "!",
      start: m.index!,
      end: m.index! + m[0].length,
    });
  }
  return out;
}
