import { test } from "node:test";
import assert from "node:assert/strict";
import { isArchiveKey } from "./shortcuts.ts";

type K = { key: string; code?: string; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean };
const ev = (k: K) => ({ code: "", shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...k });

test("Shift+Y archives as a browser normally reports it", () => {
  assert.equal(isArchiveKey(ev({ key: "Y", code: "KeyY", shiftKey: true })), true);
});

test("Shift+Y still archives when it arrives as a lowercase y with Shift held (#295)", () => {
  // Caps Lock on, or an automation tool that sends the base key plus a Shift modifier.
  assert.equal(isArchiveKey(ev({ key: "y", code: "KeyY", shiftKey: true })), true);
  assert.equal(isArchiveKey(ev({ key: "y", shiftKey: true })), true);
});

test("Shift+Y archives on a non-Latin layout, where the Y key types another letter", () => {
  assert.equal(isArchiveKey(ev({ key: "Н", code: "KeyY", shiftKey: true })), true);
});

test("a bare y never archives", () => {
  assert.equal(isArchiveKey(ev({ key: "y", code: "KeyY" })), false);
});

test("on QWERTZ the physical KeyY types z, so Shift there is Z and does not archive", () => {
  assert.equal(isArchiveKey(ev({ key: "Z", code: "KeyY", shiftKey: true })), false);
});

test("Cmd+Y, Ctrl+Y and Alt+Shift+Y are not the archive key (#168 was not planned)", () => {
  assert.equal(isArchiveKey(ev({ key: "y", code: "KeyY", metaKey: true })), false);
  assert.equal(isArchiveKey(ev({ key: "y", code: "KeyY", ctrlKey: true })), false);
  assert.equal(isArchiveKey(ev({ key: "Y", code: "KeyY", shiftKey: true, metaKey: true })), false);
  assert.equal(isArchiveKey(ev({ key: "Y", code: "KeyY", shiftKey: true, altKey: true })), false);
});
