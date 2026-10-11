import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNote, parseInline, stripInline, stripMarkdownPrefix } from "./markdown.ts";

/**
 * The premium Markdown tier (#12): block syntax behind `{ premium: true }`, and the inline
 * parser the renderer runs over every line of text.
 *
 * The gate is tested as carefully as the syntax. A reader without the entitlement must see
 * premium syntax exactly as typed — the parse without `premium` is the free tier, unchanged.
 */

const P = { premium: true } as const;

// ---------------------------------------------------------------- the gate

test("without premium, premium blocks stay plain text", () => {
  const src = "```\ncode\n```\n> quote\n---\n- [ ] task";
  assert.deepEqual(parseNote(src), [
    { kind: "text", text: "```" },
    { kind: "text", text: "code" },
    { kind: "text", text: "```" },
    { kind: "text", text: "> quote" },
    { kind: "text", text: "---" },
    { kind: "list", marker: "dash", indent: 0, ordinal: 1, text: "[ ] task" },
  ]);
});

test("premium still parses the free-tier headings and lists identically", () => {
  const src = "# T\n* a\n  1. b";
  assert.deepEqual(parseNote(src, P), parseNote(src));
});

// ---------------------------------------------------------------- code blocks

test("a fenced block keeps its lines verbatim, language included", () => {
  assert.deepEqual(parseNote("```ts\nconst a = 1;\n# not a heading\n```", P), [
    { kind: "code", lang: "ts", lines: ["const a = 1;", "# not a heading"] },
  ]);
});

test("nothing inside a fence is parsed, not even list markers", () => {
  assert.deepEqual(parseNote("```\n* item\n> q\n```\nafter", P), [
    { kind: "code", lang: "", lines: ["* item", "> q"] },
    { kind: "text", text: "after" },
  ]);
});

test("an unclosed fence runs to the end of the note", () => {
  assert.deepEqual(parseNote("```\na\nb", P), [{ kind: "code", lang: "", lines: ["a", "b"] }]);
});

test("a fence restarts list numbering after it", () => {
  const blocks = parseNote("1. a\n```\nx\n```\n1. b", P);
  assert.equal(blocks[2].kind === "list" && blocks[2].ordinal, 1);
});

// ---------------------------------------------------------------- quotes and rules

test("blockquotes, with or without the space", () => {
  assert.deepEqual(parseNote("> said\n>tight", P), [
    { kind: "quote", text: "said" },
    { kind: "quote", text: "tight" },
  ]);
});

test("horizontal rules in all three spellings, but only alone on the line", () => {
  assert.deepEqual(parseNote("---\n***\n___\n-----\n--- x", P), [
    { kind: "rule" },
    { kind: "rule" },
    { kind: "rule" },
    { kind: "rule" },
    { kind: "text", text: "--- x" },
  ]);
});

// ---------------------------------------------------------------- task lists

test("task items carry their state and drop the box from the text", () => {
  assert.deepEqual(parseNote("- [ ] milk\n- [x] eggs\n* [X] bread", P), [
    { kind: "list", marker: "dash", indent: 0, ordinal: 1, text: "milk", task: "open" },
    { kind: "list", marker: "dash", indent: 0, ordinal: 2, text: "eggs", task: "done" },
    { kind: "list", marker: "bullet", indent: 0, ordinal: 1, text: "bread", task: "done" },
  ]);
});

test("a bracket that is not a task box is ordinary item text", () => {
  assert.deepEqual(parseNote("- [link] thing", P), [
    { kind: "list", marker: "dash", indent: 0, ordinal: 1, text: "[link] thing" },
  ]);
});

// ---------------------------------------------------------------- tables

test("a pipe table with alignment", () => {
  const src = "| Name | Qty | Note |\n|:---|---:|:--:|\n| milk | 2 | #tasks-today |";
  assert.deepEqual(parseNote(src, P), [
    {
      kind: "table",
      align: ["left", "right", "center"],
      header: ["Name", "Qty", "Note"],
      rows: [["milk", "2", "#tasks-today"]],
    },
  ]);
});

test("outer pipes are optional and short rows are padded", () => {
  const src = "a | b\n--- | ---\n1 |\n2 | 3";
  assert.deepEqual(parseNote(src, P), [
    { kind: "table", align: [null, null], header: ["a", "b"], rows: [["1", ""], ["2", "3"]] },
  ]);
});

test("the table ends at the first line without a pipe", () => {
  const blocks = parseNote("| a |\n|---|\n| 1 |\nplain", P);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[1], { kind: "text", text: "plain" });
});

test("pipes without a separator row are just text", () => {
  assert.deepEqual(parseNote("a | b\nc | d", P), [
    { kind: "text", text: "a | b" },
    { kind: "text", text: "c | d" },
  ]);
});

// ---------------------------------------------------------------- inline

test("plain text is a single text node", () => {
  assert.deepEqual(parseInline("hello #tag"), [{ kind: "text", text: "hello #tag" }]);
});

test("bold, italic, strike and code", () => {
  assert.deepEqual(parseInline("**b** *i* ~~s~~ `c`"), [
    { kind: "bold", children: [{ kind: "text", text: "b" }] },
    { kind: "text", text: " " },
    { kind: "italic", children: [{ kind: "text", text: "i" }] },
    { kind: "text", text: " " },
    { kind: "strike", children: [{ kind: "text", text: "s" }] },
    { kind: "text", text: " " },
    { kind: "code", text: "c" },
  ]);
});

test("underscore forms, but never inside a word", () => {
  assert.deepEqual(parseInline("__b__ _i_"), [
    { kind: "bold", children: [{ kind: "text", text: "b" }] },
    { kind: "text", text: " " },
    { kind: "italic", children: [{ kind: "text", text: "i" }] },
  ]);
  assert.deepEqual(parseInline("snake_case_name"), [{ kind: "text", text: "snake_case_name" }]);
});

test("marks nest", () => {
  assert.deepEqual(parseInline("**bold *and italic***"), [
    {
      kind: "bold",
      children: [
        { kind: "text", text: "bold " },
        { kind: "italic", children: [{ kind: "text", text: "and italic" }] },
      ],
    },
  ]);
});

test("a mark must hug its text, and an unclosed one is literal", () => {
  assert.deepEqual(parseInline("** x** and **open"), [{ kind: "text", text: "** x** and **open" }]);
  assert.deepEqual(parseInline("2 * 3 * 4"), [{ kind: "text", text: "2 * 3 * 4" }]);
});

test("inline code is literal", () => {
  assert.deepEqual(parseInline("`**x**`"), [{ kind: "code", text: "**x**" }]);
});

test("links, with marks allowed in the label", () => {
  assert.deepEqual(parseInline("see [the **docs**](https://x.dev/a)"), [
    { kind: "text", text: "see " },
    {
      kind: "link",
      href: "https://x.dev/a",
      children: [
        { kind: "text", text: "the " },
        { kind: "bold", children: [{ kind: "text", text: "docs" }] },
      ],
    },
  ]);
});

test("unsafe link schemes are left as literal text", () => {
  assert.deepEqual(parseInline("[x](javascript:alert(1))"), [
    { kind: "text", text: "[x](javascript:alert(1))" },
  ]);
  assert.deepEqual(parseInline("[x](data:text/html,hi)"), [{ kind: "text", text: "[x](data:text/html,hi)" }]);
});

test("mailto links are allowed", () => {
  assert.deepEqual(parseInline("[me](mailto:a@b.c)"), [
    { kind: "link", href: "mailto:a@b.c", children: [{ kind: "text", text: "me" }] },
  ]);
});

test("bare URLs become links, as before", () => {
  assert.deepEqual(parseInline("go to https://notedude.app now"), [
    { kind: "text", text: "go to " },
    { kind: "url", href: "https://notedude.app" },
    { kind: "text", text: " now" },
  ]);
});

test("without premium only bare URLs are recognised", () => {
  assert.deepEqual(parseInline("**b** https://a.b", { premium: false }), [
    { kind: "text", text: "**b** " },
    { kind: "url", href: "https://a.b" },
  ]);
});

// ---------------------------------------------------------------- stripping for list rows

test("stripInline drops marks but keeps the words", () => {
  assert.equal(stripInline("**Groceries** for _this_ week"), "Groceries for this week");
  assert.equal(stripInline("[docs](https://x.dev) and `code`"), "docs and code");
  assert.equal(stripInline("snake_case #tag"), "snake_case #tag");
});

test("stripMarkdownPrefix also strips quotes, task boxes and inline marks", () => {
  assert.equal(stripMarkdownPrefix("> **Quoted**"), "Quoted");
  assert.equal(stripMarkdownPrefix("- [ ] buy milk"), "buy milk");
  assert.equal(stripMarkdownPrefix("# *Title*"), "Title");
});
