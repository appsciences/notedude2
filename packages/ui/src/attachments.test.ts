import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attachmentRef,
  findAttachments,
  isImageType,
  sanitizeAttachmentName,
  newAttachmentId,
  MAX_ATTACHMENT_BYTES,
} from "./attachments.ts";
import { parseInline } from "./markdown.ts";

test("an image is written with a bang, anything else without", () => {
  assert.equal(attachmentRef({ id: "abc123", name: "shot.png", image: true }), "![shot.png](attach:abc123)");
  assert.equal(attachmentRef({ id: "abc123", name: "Q3.pdf", image: false }), "[Q3.pdf](attach:abc123)");
});

test("image-ness comes from the content type", () => {
  assert.equal(isImageType("image/png"), true);
  assert.equal(isImageType("image/svg+xml"), false); // can carry script — shown as a file
  assert.equal(isImageType("application/pdf"), false);
  assert.equal(isImageType(""), false);
});

test("names are stripped of path, control characters and link-breaking brackets", () => {
  assert.equal(sanitizeAttachmentName("C:\\x\\y\\a[1].png"), "a(1).png");
  assert.equal(sanitizeAttachmentName("a/b/c.txt"), "c.txt");
  assert.equal(sanitizeAttachmentName("  \u0000  "), "file");
  assert.equal(sanitizeAttachmentName("x".repeat(400)).length, 255);
});

test("ids are url-safe and distinct", () => {
  const a = newAttachmentId();
  assert.match(a, /^[A-Za-z0-9]{16,}$/);
  assert.notEqual(a, newAttachmentId());
});

test("findAttachments lists every reference with its position", () => {
  const text = "hi ![a.png](attach:idAAAA01) and [b.pdf](attach:idAAAA02)\n[c](https://x.com)";
  const found = findAttachments(text);
  assert.deepEqual(found.map((f) => [f.id, f.name, f.image]), [["idAAAA01", "a.png", true], ["idAAAA02", "b.pdf", false]]);
  assert.equal(text.slice(found[0].start, found[0].end), "![a.png](attach:idAAAA01)");
});

test("parseInline turns a reference into an attachment node, premium or not", () => {
  for (const premium of [true, false]) {
    assert.deepEqual(parseInline("see ![a.png](attach:idAAAA01) ok", { premium }), [
      { kind: "text", text: "see " },
      { kind: "attachment", id: "idAAAA01", name: "a.png", image: true },
      { kind: "text", text: " ok" },
    ]);
  }
});

test("an attach: target is never a link", () => {
  assert.equal(parseInline("[x](attach:idAAAA01)", { premium: true })[0].kind, "attachment");
  assert.equal(parseInline("[x](attach:bad id here)", { premium: true }).some((n) => n.kind === "link"), false);
});

test("the cap matches the MCP server's", () => {
  assert.equal(MAX_ATTACHMENT_BYTES, 20 * 1024 * 1024);
});
