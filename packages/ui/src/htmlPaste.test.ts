import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlToNoteText, type PastedNode } from "./htmlPaste.ts";

/**
 * The paste converter has to emit the same markers the list shortcuts write, because the
 * reader parses them back with `parseNote`. It used to emit display glyphs — `•` for bullets
 * and `a.` for nested numbering — which nothing parses, so a pasted list rendered as flat
 * prose the moment #164 gave notes a renderer. That is #179, and it is what most of these
 * cases pin down.
 *
 * The tree here is `PastedNode`, not the DOM, so these run under `node --test`.
 */

const text = (s: string): PastedNode => ({ text: s });
const el = (tag: string, ...children: PastedNode[]): PastedNode => ({ tag, children });
const li = (...children: PastedNode[]): PastedNode => el("li", ...children);

// ------------------------------------------------------------------ markers

test("an unordered list becomes `* ` items, the marker the renderer reads as a bullet", () => {
  const tree = el("ul", li(text("milk")), li(text("eggs")));
  assert.equal(htmlToNoteText(tree), "* milk\n* eggs");
});

test("an ordered list becomes `N. ` items, numbered from one", () => {
  const tree = el("ol", li(text("first")), li(text("second")), li(text("third")));
  assert.equal(htmlToNoteText(tree), "1. first\n2. second\n3. third");
});

test("nested ordered items keep numbering rather than switching to letters (#179)", () => {
  // `a.` has no Markdown equivalent here, so the old lettering parsed as plain text.
  const tree = el("ol", li(text("parent"), el("ol", li(text("one")), li(text("two")))));
  assert.equal(htmlToNoteText(tree), "1. parent\n  1. one\n  2. two");
});

test("each depth adds two spaces, matching the indent the shortcuts write", () => {
  const tree = el("ul", li(text("top"), el("ul", li(text("mid"), el("ul", li(text("deep")))))));
  assert.equal(htmlToNoteText(tree), "* top\n  * mid\n    * deep");
});

// -------------------------------------------------------------------- #135

test("a nested list starts on its own line instead of gluing onto its parent (#135)", () => {
  const tree = el("ul", li(text("fruit"), el("ul", li(text("apples")))), li(text("bread")));
  assert.equal(htmlToNoteText(tree), "* fruit\n  * apples\n* bread");
});

// ------------------------------------------------------------------- prose

test("paragraphs and divs each end a line", () => {
  const tree = el("body", el("p", text("one")), el("div", text("two")));
  assert.equal(htmlToNoteText(tree), "one\ntwo");
});

test("a br is a newline", () => {
  const tree = el("p", text("one"), el("br"), text("two"));
  assert.equal(htmlToNoteText(tree), "one\ntwo");
});

test("runs of blank lines collapse to one, and the result is trimmed", () => {
  const tree = el("body", el("p", text("")), el("p", text("one")), el("p", text("")), el("p", text("")), el("p", text("two")));
  assert.equal(htmlToNoteText(tree), "one\n\ntwo");
});

test("unknown elements contribute their text without adding structure", () => {
  const tree = el("body", el("span", text("plain ")), el("strong", text("bold")));
  assert.equal(htmlToNoteText(tree), "plain bold");
});

test("item text is trimmed, so source indentation in the HTML does not leak in", () => {
  const tree = el("ul", li(text("\n      milk\n    ")));
  assert.equal(htmlToNoteText(tree), "* milk");
});

test("an empty tree converts to nothing, letting the caller fall back to a plain paste", () => {
  assert.equal(htmlToNoteText(el("body")), "");
});

// ------------------------------------------------------------ round-tripping

test("a list survives the round trip back through the note parser", async () => {
  const { parseNote } = await import("./markdown.ts");
  const converted = htmlToNoteText(el("ul", li(text("milk")), li(text("eggs"))));
  const blocks = parseNote(converted);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["list", "list"],
    "pasted items must parse as list blocks, not text (#179)",
  );
});
