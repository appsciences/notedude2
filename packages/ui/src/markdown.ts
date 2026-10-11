/**
 * The Markdown notedude understands: three heading levels and three kinds of list. Nothing
 * else — bold, code, links and the rest are the premium tier (#12).
 *
 * Notes are plain text in Firestore and stay that way. A heading *is* the characters `## `,
 * so the shortcuts here are line-prefix rewrites and the renderer is a per-line parse. That
 * keeps the editor an ordinary `<textarea>`, which is what lets edit mode double as the raw
 * source view (#156, #157).
 *
 * Two rules earn their keep:
 *
 * - A marker needs a space after it. `#tasks-today` and `#archived` are how this app stores
 *   task state and archiving, so a parser that read `#` as a heading would quietly break
 *   filtering and the task lists.
 * - Nothing here imports React or the tokens, so it is unit-testable under `node --test`.
 */

export type HeadingLevel = 1 | 2 | 3;
export type ListMarker = "bullet" | "dash" | "number";

export type Block =
  | { kind: "heading"; level: HeadingLevel; text: string }
  | { kind: "list"; marker: ListMarker; indent: number; ordinal: number; text: string }
  | { kind: "text"; text: string };

/** The result of a shortcut: the new note text, and where the caret ends up in it. */
export interface TextEdit {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** One nesting step. Two spaces, so an indented marker still lines up on the mono grid. */
const INDENT = "  ";

/**
 * `(?!#)` stops `#### x` from being read as `###` plus a stray hash, and the explicit space
 * class is what separates a heading from a `#tag`.
 */
const HEADING_RE = /^(#{1,3})(?!#)[ \t](.*)$/;
const LIST_RE = /^([ \t]*)([*-]|\d+\.)[ \t](.*)$/;

function markerOf(raw: string): ListMarker {
  if (raw === "*") return "bullet";
  if (raw === "-") return "dash";
  return "number";
}

/** Parses note text into the blocks the renderer draws. */
export function parseNote(content: string): Block[] {
  const blocks: Block[] = [];
  // Ordinal counters, keyed by indent depth. Numbering restarts wherever a reader would
  // expect a new list to begin: when something that is not a list item interrupts, when we
  // step back out to a shallower level, and when the marker itself changes — a numbered list
  // under a bulleted one is a second list, not a continuation of the first.
  const counters = new Map<number, { marker: ListMarker; ordinal: number }>();

  for (const line of content.split("\n")) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
      counters.clear();
      blocks.push({
        kind: "heading",
        level: heading[1].length as HeadingLevel,
        text: heading[2],
      });
      continue;
    }

    const item = LIST_RE.exec(line);
    if (item) {
      const indent = item[1].length;
      const marker = markerOf(item[2]);
      for (const depth of [...counters.keys()]) if (depth > indent) counters.delete(depth);
      const running = counters.get(indent);
      const ordinal = running && running.marker === marker ? running.ordinal + 1 : 1;
      counters.set(indent, { marker, ordinal });
      blocks.push({ kind: "list", marker, indent, ordinal, text: item[3] });
      continue;
    }

    counters.clear();
    blocks.push({ kind: "text", text: line });
  }

  return blocks;
}

/** Note text with the markup taken off a single line — for list rows and snippets. */
export function stripMarkdownPrefix(line: string): string {
  const heading = HEADING_RE.exec(line);
  if (heading) return heading[2];
  const item = LIST_RE.exec(line);
  if (item) return item[3];
  return line;
}

interface Line {
  start: number;
  end: number;
  text: string;
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf("\n", start);
    if (nl === -1) {
      lines.push({ start, end: text.length, text: text.slice(start) });
      return lines;
    }
    lines.push({ start, end: nl, text: text.slice(start, nl) });
    start = nl + 1;
  }
}

/** The inclusive range of lines a selection touches. */
function selectedLines(lines: Line[], selStart: number, selEnd: number): [number, number] {
  const at = (pos: number) => {
    const i = lines.findIndex((l) => pos <= l.end);
    return i === -1 ? lines.length - 1 : i;
  };
  const first = at(selStart);
  let last = at(selEnd);
  // A selection ending exactly where a line begins has not actually reached into it — this
  // is what stops a full-line drag from formatting the line below as well.
  if (last > first && selEnd === lines[last].start) last--;
  return [first, last];
}

/** Splits a line into its indentation and whatever is left once any marker is removed. */
function splitPrefix(line: string): { indent: string; body: string } {
  const heading = HEADING_RE.exec(line);
  // ATX headings are not indented, so a heading contributes no indentation to carry over.
  if (heading) return { indent: "", body: heading[2] };
  const item = LIST_RE.exec(line);
  if (item) return { indent: item[1], body: item[3] };
  const plain = /^([ \t]*)(.*)$/.exec(line)!;
  return { indent: plain[1], body: plain[2] };
}

function headingLevelOf(line: string): HeadingLevel | 0 {
  const heading = HEADING_RE.exec(line);
  return heading ? (heading[1].length as HeadingLevel) : 0;
}

function listMarkerOf(line: string): ListMarker | null {
  const item = LIST_RE.exec(line);
  return item ? markerOf(item[2]) : null;
}

/**
 * Rewrites every line a selection touches, then moves the caret by however much each line's
 * prefix grew or shrank. Removing a prefix can only ever push the caret back to the start of
 * its own line, never onto the line above.
 */
function rewriteLines(
  text: string,
  selStart: number,
  selEnd: number,
  fn: (line: string) => string
): TextEdit {
  const lines = splitLines(text);
  const [first, last] = selectedLines(lines, selStart, selEnd);

  const updated = lines.map((l) => l.text);
  for (let i = first; i <= last; i++) updated[i] = fn(lines[i].text);

  const deltaAt = (i: number) => updated[i].length - lines[i].text.length;
  const deltaBefore = (i: number) => {
    let total = 0;
    for (let k = first; k < i; k++) total += deltaAt(k);
    return total;
  };
  const moved = (pos: number, i: number) =>
    Math.max(lines[i].start + deltaBefore(i), pos + deltaBefore(i) + deltaAt(i));

  return {
    text: updated.join("\n"),
    selectionStart: moved(selStart, first),
    selectionEnd: moved(selEnd, last),
  };
}

/** Blank lines are never given a marker — a selection sweeping past one leaves it alone. */
const isBlank = (line: string) => line.trim() === "";

function nonBlankLines(lines: Line[], first: number, last: number): Line[] {
  return lines.slice(first, last + 1).filter((l) => !isBlank(l.text));
}

/**
 * Applies a heading level, or strips it if every line the selection touches already sits at
 * that level. A mixed selection is levelled up rather than toggled off, matching Apple Notes.
 */
export function toggleHeading(
  text: string,
  selStart: number,
  selEnd: number,
  level: HeadingLevel
): TextEdit {
  const lines = splitLines(text);
  const [first, last] = selectedLines(lines, selStart, selEnd);
  const covered = nonBlankLines(lines, first, last);
  const alreadyAtLevel =
    covered.length > 0 && covered.every((l) => headingLevelOf(l.text) === level);

  return rewriteLines(text, selStart, selEnd, (line) => {
    if (isBlank(line)) return line;
    const { body } = splitPrefix(line);
    return alreadyAtLevel ? body : "#".repeat(level) + " " + body;
  });
}

/** Apple Notes' "Body": drops whatever prefix the line carries, heading or list. */
export function clearHeading(text: string, selStart: number, selEnd: number): TextEdit {
  return rewriteLines(text, selStart, selEnd, (line) => {
    if (isBlank(line)) return line;
    const { indent, body } = splitPrefix(line);
    return indent + body;
  });
}

/** Applies a list marker, or strips it if the selection is already uniformly that marker. */
export function toggleList(
  text: string,
  selStart: number,
  selEnd: number,
  marker: ListMarker
): TextEdit {
  const lines = splitLines(text);
  const [first, last] = selectedLines(lines, selStart, selEnd);
  const covered = nonBlankLines(lines, first, last);
  const alreadyMarked = covered.length > 0 && covered.every((l) => listMarkerOf(l.text) === marker);

  let ordinal = 0;
  return rewriteLines(text, selStart, selEnd, (line) => {
    if (isBlank(line)) return line;
    const { indent, body } = splitPrefix(line);
    if (alreadyMarked) return indent + body;
    ordinal++;
    const raw = marker === "bullet" ? "*" : marker === "dash" ? "-" : `${ordinal}.`;
    return indent + raw + " " + body;
  });
}

/**
 * Enter inside a list. Returns `null` when the caret is not on a list item, which leaves the
 * textarea to insert an ordinary newline.
 */
export function continueList(text: string, selStart: number, selEnd: number): TextEdit | null {
  const lines = splitLines(text);
  const [idx] = selectedLines(lines, selStart, selEnd);
  const line = lines[idx];
  const item = LIST_RE.exec(line.text);
  if (!item) return null;

  const [, indent, raw, body] = item;

  // An empty item is how you leave a list: step out one level, or drop the marker entirely
  // once there is nowhere left to step out to.
  if (isBlank(body)) {
    const replacement =
      indent.length > 0 ? indent.slice(0, Math.max(0, indent.length - INDENT.length)) + raw + " " : "";
    const updated = lines.map((l) => l.text);
    updated[idx] = replacement;
    const caret = line.start + replacement.length;
    return { text: updated.join("\n"), selectionStart: caret, selectionEnd: caret };
  }

  const col = selStart - line.start;
  // Caret parked inside the marker itself — not a continuation, just a newline.
  if (col <= indent.length + raw.length) return null;

  const ordinal = parseNote(text)[idx];
  const next =
    raw.endsWith(".") && ordinal.kind === "list" ? `${ordinal.ordinal + 1}.` : raw;

  const head = line.text.slice(0, col);
  const tail = line.text.slice(col);
  const updated = lines.map((l) => l.text);
  updated[idx] = head + "\n" + indent + next + " " + tail;
  const caret = line.start + head.length + 1 + indent.length + next.length + 1;
  return { text: updated.join("\n"), selectionStart: caret, selectionEnd: caret };
}

/**
 * Tab / Shift+Tab on list lines. Returns `null` anywhere else so the key falls through —
 * #154 wants it for literal tab characters, and both features have to coexist.
 */
export function indentList(
  text: string,
  selStart: number,
  selEnd: number,
  direction: 1 | -1
): TextEdit | null {
  const lines = splitLines(text);
  const [first, last] = selectedLines(lines, selStart, selEnd);
  const covered = nonBlankLines(lines, first, last);
  if (covered.length === 0 || !covered.every((l) => LIST_RE.test(l.text))) return null;

  return rewriteLines(text, selStart, selEnd, (line) => {
    if (isBlank(line)) return line;
    if (direction > 0) return INDENT + line;
    return line.startsWith(INDENT) ? line.slice(INDENT.length) : line.replace(/^[ \t]+/, "");
  });
}
