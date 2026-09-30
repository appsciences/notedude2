import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNote,
  toggleHeading,
  clearHeading,
  toggleList,
  continueList,
  indentList,
  stripMarkdownPrefix,
} from "./markdown.ts";

/**
 * The whole feature rests on two pure operations — parse a note into blocks, and rewrite the
 * prefix of the lines a selection touches. Everything the shortcuts and the renderer do is a
 * thin wrapper over these, so this is where the behaviour is actually pinned down.
 *
 * The `#tag` cases are not incidental: notedude stores archiving and task state as `#tags`
 * inside note content, so a parser that mistook `#tasks-today` for a heading would break
 * filtering, the task lists, and `#archived`. See #156.
 */

// ---------------------------------------------------------------- parseNote

test("parses the three heading levels", () => {
  assert.deepEqual(parseNote("# Title"), [{ kind: "heading", level: 1, text: "Title" }]);
  assert.deepEqual(parseNote("## Heading"), [{ kind: "heading", level: 2, text: "Heading" }]);
  assert.deepEqual(parseNote("### Sub"), [{ kind: "heading", level: 3, text: "Sub" }]);
});

test("a fourth level is not a heading — the free tier stops at three", () => {
  assert.deepEqual(parseNote("#### Deep"), [{ kind: "text", text: "#### Deep" }]);
});

test("a hash with no space is a tag, not a heading", () => {
  assert.deepEqual(parseNote("#tag"), [{ kind: "text", text: "#tag" }]);
  assert.deepEqual(parseNote("#tasks-today"), [{ kind: "text", text: "#tasks-today" }]);
  assert.deepEqual(parseNote("#archived"), [{ kind: "text", text: "#archived" }]);
});

test("a tag trailing a line of prose stays prose", () => {
  assert.deepEqual(parseNote("buy milk #tasks-today"), [
    { kind: "text", text: "buy milk #tasks-today" },
  ]);
});

test("a heading may itself contain a tag", () => {
  assert.deepEqual(parseNote("## Groceries #tasks-today"), [
    { kind: "heading", level: 2, text: "Groceries #tasks-today" },
  ]);
});

test("parses the three list markers", () => {
  assert.deepEqual(parseNote("* one"), [
    { kind: "list", marker: "bullet", indent: 0, ordinal: 1, text: "one" },
  ]);
  assert.deepEqual(parseNote("- one"), [
    { kind: "list", marker: "dash", indent: 0, ordinal: 1, text: "one" },
  ]);
  assert.deepEqual(parseNote("1. one"), [
    { kind: "list", marker: "number", indent: 0, ordinal: 1, text: "one" },
  ]);
});

test("a bare dash is not a list item — a marker needs a space after it", () => {
  assert.deepEqual(parseNote("-"), [{ kind: "text", text: "-" }]);
  assert.deepEqual(parseNote("---"), [{ kind: "text", text: "---" }]);
});

test("an empty list item is still a list item", () => {
  assert.deepEqual(parseNote("* "), [
    { kind: "list", marker: "bullet", indent: 0, ordinal: 1, text: "" },
  ]);
});

test("records nesting depth", () => {
  const blocks = parseNote("* top\n  * nested\n    * deeper");
  assert.deepEqual(
    blocks.map((b) => (b.kind === "list" ? b.indent : -1)),
    [0, 2, 4]
  );
});

test("ordered lists renumber on render regardless of the source numbers", () => {
  const blocks = parseNote("1. a\n1. b\n1. c");
  assert.deepEqual(
    blocks.map((b) => (b.kind === "list" ? b.ordinal : -1)),
    [1, 2, 3]
  );
});

test("numbering restarts after the list is interrupted", () => {
  const blocks = parseNote("1. a\n1. b\nprose\n1. c");
  assert.deepEqual(
    blocks.filter((b) => b.kind === "list").map((b) => (b as { ordinal: number }).ordinal),
    [1, 2, 1]
  );
});

test("a numbered list under a bulleted one starts its own count", () => {
  const blocks = parseNote("* milk\n- eggs\n1. bread\n1. jam");
  assert.deepEqual(
    blocks.filter((b) => b.kind === "list").map((b) => (b as { ordinal: number }).ordinal),
    [1, 1, 1, 2]
  );
});

test("numbering is tracked per indent level", () => {
  const blocks = parseNote("1. a\n  1. x\n  1. y\n1. b");
  assert.deepEqual(
    blocks.filter((b) => b.kind === "list").map((b) => (b as { ordinal: number }).ordinal),
    [1, 1, 2, 2]
  );
});

test("blank lines survive as empty text blocks", () => {
  assert.deepEqual(parseNote("a\n\nb"), [
    { kind: "text", text: "a" },
    { kind: "text", text: "" },
    { kind: "text", text: "b" },
  ]);
});

// ------------------------------------------------------------ toggleHeading

test("applies a heading to the cursor's line", () => {
  const r = toggleHeading("hello", 0, 0, 2);
  assert.equal(r.text, "## hello");
});

test("pressing the same level again returns the line to body", () => {
  const r = toggleHeading("## hello", 0, 0, 2);
  assert.equal(r.text, "hello");
});

test("a different level replaces rather than stacking hashes", () => {
  assert.equal(toggleHeading("## hello", 0, 0, 1).text, "# hello");
  assert.equal(toggleHeading("# hello", 0, 0, 3).text, "### hello");
});

test("a heading replaces a list marker instead of coexisting with it", () => {
  assert.equal(toggleHeading("* hello", 0, 0, 2).text, "## hello");
});

test("only the cursor's line is touched", () => {
  const r = toggleHeading("one\ntwo\nthree", 4, 4, 2);
  assert.equal(r.text, "one\n## two\nthree");
});

test("a selection spanning lines headings every line it touches", () => {
  const r = toggleHeading("one\ntwo\nthree", 0, 7, 2);
  assert.equal(r.text, "## one\n## two\nthree");
});

test("a mixed selection is levelled up, not toggled off", () => {
  const r = toggleHeading("## one\ntwo", 0, 8, 2);
  assert.equal(r.text, "## one\n## two");
});

test("a selection already uniformly at the level toggles off", () => {
  const r = toggleHeading("## one\n## two", 0, 10, 2);
  assert.equal(r.text, "one\ntwo");
});

test("a selection ending exactly at a line start does not reach that line", () => {
  const r = toggleHeading("one\ntwo", 0, 4, 2);
  assert.equal(r.text, "## one\ntwo");
});

test("the cursor follows the text it was sitting in front of", () => {
  const r = toggleHeading("hello", 0, 0, 2);
  assert.equal(r.selectionStart, 3);
  assert.equal(r.text.slice(r.selectionStart), "hello");
});

test("removing a prefix never drags the cursor onto the previous line", () => {
  const r = toggleHeading("## hi", 1, 1, 2);
  assert.equal(r.text, "hi");
  assert.equal(r.selectionStart, 0);
});

test("blank lines in a selection are left alone", () => {
  const r = toggleHeading("one\n\ntwo", 0, 8, 2);
  assert.equal(r.text, "## one\n\n## two");
});

// ------------------------------------------------------------- clearHeading

test("body strips any heading level", () => {
  assert.equal(clearHeading("# a", 0, 0).text, "a");
  assert.equal(clearHeading("## a", 0, 0).text, "a");
  assert.equal(clearHeading("### a", 0, 0).text, "a");
});

test("body on an unformatted line changes nothing", () => {
  const r = clearHeading("plain", 0, 0);
  assert.equal(r.text, "plain");
  assert.equal(r.selectionStart, 0);
});

test("body also clears list markers", () => {
  assert.equal(clearHeading("* a", 0, 0).text, "a");
  assert.equal(clearHeading("1. a", 0, 0).text, "a");
});

// --------------------------------------------------------------- toggleList

test("applies each marker to the cursor's line", () => {
  assert.equal(toggleList("a", 0, 0, "bullet").text, "* a");
  assert.equal(toggleList("a", 0, 0, "dash").text, "- a");
  assert.equal(toggleList("a", 0, 0, "number").text, "1. a");
});

test("pressing the same marker again removes the list formatting", () => {
  assert.equal(toggleList("* a", 0, 0, "bullet").text, "a");
  assert.equal(toggleList("1. a", 0, 0, "number").text, "a");
});

test("a different marker replaces rather than nesting", () => {
  assert.equal(toggleList("* a", 0, 0, "number").text, "1. a");
  assert.equal(toggleList("1. a", 0, 0, "dash").text, "- a");
});

test("a list marker replaces a heading prefix", () => {
  assert.equal(toggleList("## a", 0, 0, "bullet").text, "* a");
});

test("existing indentation is preserved", () => {
  assert.equal(toggleList("  a", 0, 0, "bullet").text, "  * a");
});

test("a numbered selection is numbered sequentially", () => {
  const r = toggleList("a\nb\nc", 0, 5, "number");
  assert.equal(r.text, "1. a\n2. b\n3. c");
});

test("blank lines in a selection do not become list items", () => {
  const r = toggleList("a\n\nb", 0, 4, "bullet");
  assert.equal(r.text, "* a\n\n* b");
});

// -------------------------------------------------------------- continueList

test("Enter at the end of a list item opens the next one", () => {
  const r = continueList("* one", 5, 5);
  assert.equal(r?.text, "* one\n* ");
  assert.equal(r?.selectionStart, 8);
});

test("Enter continues the marker style and indentation", () => {
  assert.equal(continueList("- one", 5, 5)?.text, "- one\n- ");
  assert.equal(continueList("  * one", 7, 7)?.text, "  * one\n  * ");
});

test("Enter in a numbered list increments", () => {
  assert.equal(continueList("1. one", 6, 6)?.text, "1. one\n2. ");
  assert.equal(continueList("1. a\n2. b", 9, 9)?.text, "1. a\n2. b\n3. ");
});

test("Enter on an empty list item ends the list instead of adding another", () => {
  const r = continueList("* one\n* ", 8, 8);
  assert.equal(r?.text, "* one\n");
  assert.equal(r?.selectionStart, 6);
});

test("Enter on an empty nested item outdents before it ends the list", () => {
  const r = continueList("* one\n  * ", 10, 10);
  assert.equal(r?.text, "* one\n* ");
});

test("Enter mid-item splits it and carries the marker", () => {
  const r = continueList("* onetwo", 5, 5);
  assert.equal(r?.text, "* one\n* two");
});

test("Enter outside a list is left to the textarea", () => {
  assert.equal(continueList("plain", 5, 5), null);
  assert.equal(continueList("## head", 7, 7), null);
});

// --------------------------------------------------------------- indentList

test("Tab indents a list item by one level", () => {
  assert.equal(indentList("* a", 3, 3, 1)?.text, "  * a");
});

test("Shift+Tab outdents a list item", () => {
  assert.equal(indentList("  * a", 5, 5, -1)?.text, "* a");
});

test("outdenting at the left margin is a no-op rather than a corruption", () => {
  assert.equal(indentList("* a", 3, 3, -1)?.text, "* a");
});

test("indenting applies to every line in a selection", () => {
  assert.equal(indentList("* a\n* b", 0, 7, 1)?.text, "  * a\n  * b");
});

test("Tab off a list line falls through, so #154 can still claim it", () => {
  assert.equal(indentList("plain", 5, 5, 1), null);
  assert.equal(indentList("## head", 7, 7, 1), null);
});

// ------------------------------------------------------- stripMarkdownPrefix

test("strips markup so list rows show the text, not the syntax", () => {
  assert.equal(stripMarkdownPrefix("# Title"), "Title");
  assert.equal(stripMarkdownPrefix("### Sub"), "Sub");
  assert.equal(stripMarkdownPrefix("* item"), "item");
  assert.equal(stripMarkdownPrefix("- item"), "item");
  assert.equal(stripMarkdownPrefix("1. item"), "item");
  assert.equal(stripMarkdownPrefix("  * nested"), "nested");
});

test("leaves a tag line and plain prose untouched", () => {
  assert.equal(stripMarkdownPrefix("#tag"), "#tag");
  assert.equal(stripMarkdownPrefix("plain text"), "plain text");
});
