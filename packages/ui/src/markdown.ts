/**
 * The Markdown notedude understands. The free tier is three heading levels and three kinds of
 * list; `{ premium: true }` adds code blocks, quotes, rules, task boxes, tables and the inline
 * marks (#12). Without it, premium syntax parses as plain text — exactly as typed.
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

export type TaskState = "open" | "done";
export type CellAlign = "left" | "center" | "right" | null;

export type Block =
  | { kind: "heading"; level: HeadingLevel; text: string }
  | {
      kind: "list";
      marker: ListMarker;
      indent: number;
      ordinal: number;
      text: string;
      /** Present only on a `[ ]` / `[x]` item, and only with premium. */
      task?: TaskState;
    }
  | { kind: "text"; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "table"; align: CellAlign[]; header: string[]; rows: string[][] };

export interface ParseOptions {
  /** Enables the premium syntax (#12). Off, the parse is the free tier and nothing more. */
  premium?: boolean;
}

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

const FENCE_OPEN_RE = /^[ \t]*```[ \t]*([^`\s]*)[^`]*$/;
const FENCE_CLOSE_RE = /^[ \t]*```[ \t]*$/;
const QUOTE_RE = /^[ \t]*>[ \t]?(.*)$/;
const RULE_RE = /^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const TASK_RE = /^\[([ xX])\][ \t](.*)$/;
/** A table separator row: cells of dashes with optional alignment colons, and a pipe somewhere. */
const TABLE_SEP_RE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** Splits a table row on unescaped pipes, dropping the optional outer ones. */
function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function alignOf(cell: string): CellAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

function markerOf(raw: string): ListMarker {
  if (raw === "*") return "bullet";
  if (raw === "-") return "dash";
  return "number";
}

/** Parses note text into the blocks the renderer draws. */
export function parseNote(content: string, { premium = false }: ParseOptions = {}): Block[] {
  const blocks: Block[] = [];
  // Ordinal counters, keyed by indent depth. Numbering restarts wherever a reader would
  // expect a new list to begin: when something that is not a list item interrupts, when we
  // step back out to a shallower level, and when the marker itself changes — a numbered list
  // under a bulleted one is a second list, not a continuation of the first.
  const counters = new Map<number, { marker: ListMarker; ordinal: number }>();
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (premium) {
      // A fence swallows everything up to its close — or the end of the note, if unclosed —
      // so nothing inside it is ever read as markup.
      const fence = FENCE_OPEN_RE.exec(line);
      if (fence) {
        counters.clear();
        const body: string[] = [];
        while (++i < lines.length && !FENCE_CLOSE_RE.test(lines[i])) body.push(lines[i]);
        blocks.push({ kind: "code", lang: fence[1], lines: body });
        continue;
      }

      if (line.includes("|") && i + 1 < lines.length && lines[i + 1].includes("|") &&
          TABLE_SEP_RE.test(lines[i + 1])) {
        counters.clear();
        const header = splitRow(line);
        const align = splitRow(lines[i + 1]).map(alignOf);
        while (align.length < header.length) align.push(null);
        align.length = header.length;
        const rows: string[][] = [];
        i++;
        while (i + 1 < lines.length && lines[i + 1].includes("|")) {
          const cells = splitRow(lines[++i]);
          while (cells.length < header.length) cells.push("");
          cells.length = header.length;
          rows.push(cells);
        }
        blocks.push({ kind: "table", align, header, rows });
        continue;
      }

      if (RULE_RE.test(line)) {
        counters.clear();
        blocks.push({ kind: "rule" });
        continue;
      }

      const quote = QUOTE_RE.exec(line);
      if (quote) {
        counters.clear();
        blocks.push({ kind: "quote", text: quote[1] });
        continue;
      }
    }

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
      const task = premium ? TASK_RE.exec(item[3]) : null;
      blocks.push(
        task
          ? { kind: "list", marker, indent, ordinal, text: task[2], task: task[1] === " " ? "open" : "done" }
          : { kind: "list", marker, indent, ordinal, text: item[3] }
      );
      continue;
    }

    counters.clear();
    blocks.push({ kind: "text", text: line });
  }

  return blocks;
}

/**
 * Note text with the markup taken off a single line — for list rows and snippets. This strips
 * premium syntax too, regardless of tier: a list row is a summary, not a rendering, and a
 * title of `**Groceries**` reads better as "Groceries" for everyone.
 */
export function stripMarkdownPrefix(line: string): string {
  const heading = HEADING_RE.exec(line);
  if (heading) return stripInline(heading[2]);
  const item = LIST_RE.exec(line);
  if (item) {
    const task = TASK_RE.exec(item[3]);
    return stripInline(task ? task[2] : item[3]);
  }
  const quote = QUOTE_RE.exec(line);
  if (quote) return stripInline(quote[1]);
  return stripInline(line);
}

// ------------------------------------------------------------------------------ inline

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold" | "italic" | "strike"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "url"; href: string };

const URL_RE = /^https?:\/\/[^\s<>"]+/;
/** The only schemes a `[label](target)` may point at. Everything else — `javascript:` above
 *  all — stays literal text, since the target is written by whoever wrote the note. */
const SAFE_HREF_RE = /^(?:https?:\/\/|mailto:)[^\s<>"]+$/i;

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);
const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** Length of the run of `ch` starting at `at`. */
function runLength(s: string, at: number, ch: string): number {
  let n = 0;
  while (s[at + n] === ch) n++;
  return n;
}

/**
 * Where a `delim` opened at `from` closes, or -1. The closer must follow a non-space, and an
 * underscore closer may not be followed by a letter — that is what keeps `snake_case` literal.
 * When the closer sits inside a longer run (`***`), it is taken from the end of the run, so
 * `**bold *italic***` closes the bold on the last two stars and leaves the italic intact.
 */
function findCloser(s: string, from: number, delim: string): number {
  const ch = delim[0];
  for (let j = from; j < s.length; j++) {
    if (s[j] === "`") {
      // Skip over inline code: a delimiter inside it is literal.
      const end = s.indexOf("`", j + 1);
      if (end === -1) break;
      j = end;
      continue;
    }
    if (s[j] !== ch) continue;
    const run = runLength(s, j, ch);
    if (run < delim.length) { j += run - 1; continue; }
    const at = j + run - delim.length;
    if (at > from && !isSpace(s[at - 1]) && !(ch === "_" && isWordChar(s[at + delim.length]))) {
      return at;
    }
    j += run - 1;
  }
  return -1;
}

function pushText(out: Inline[], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === "text") last.text += text;
  else out.push({ kind: "text", text });
}

/**
 * Parses one line's inline markup. Without premium only bare URLs are recognised — the same
 * links the app has always drawn.
 */
export function parseInline(text: string, { premium = true }: ParseOptions = {}): Inline[] {
  const out: Inline[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === "h") {
      const url = URL_RE.exec(text.slice(i));
      if (url && !isWordChar(text[i - 1])) {
        out.push({ kind: "url", href: url[0] });
        i += url[0].length;
        continue;
      }
    }

    if (premium) {
      if (ch === "`") {
        const end = text.indexOf("`", i + 1);
        if (end > i + 1) {
          out.push({ kind: "code", text: text.slice(i + 1, end) });
          i = end + 1;
          continue;
        }
      }

      if (ch === "[") {
        const close = text.indexOf("](", i + 1);
        const end = close === -1 ? -1 : text.indexOf(")", close + 2);
        if (close > i && end !== -1) {
          const href = text.slice(close + 2, end).trim();
          if (SAFE_HREF_RE.test(href)) {
            out.push({ kind: "link", href, children: parseInline(text.slice(i + 1, close), { premium }) });
            i = end + 1;
            continue;
          }
        }
      }

      if (ch === "*" || ch === "_" || ch === "~") {
        const run = runLength(text, i, ch);
        // `~` only ever pairs up as `~~`; `*` and `_` try the double (bold) form first.
        const delim = ch === "~" ? (run >= 2 ? "~~" : "") : run >= 2 ? ch + ch : ch;
        const opensWord = !isSpace(text[i + delim.length]) &&
          !(ch === "_" && isWordChar(text[i - 1]));
        if (delim && opensWord) {
          const at = findCloser(text, i + delim.length, delim);
          if (at !== -1) {
            const kind = ch === "~" ? "strike" : delim.length === 2 ? "bold" : "italic";
            out.push({ kind, children: parseInline(text.slice(i + delim.length, at), { premium }) });
            i = at + delim.length;
            continue;
          }
        }
        // Unmatched: the whole run is literal, so `**open` never half-parses as italic.
        pushText(out, text.slice(i, i + Math.max(run, 1)));
        i += Math.max(run, 1);
        continue;
      }
    }

    pushText(out, ch);
    i++;
  }

  return out;
}

function flatten(nodes: Inline[]): string {
  return nodes
    .map((n) => (n.kind === "text" || n.kind === "code" ? n.text : n.kind === "url" ? n.href : flatten(n.children)))
    .join("");
}

/** A line's words with the inline marks taken off — `**a** [b](…)` becomes `a b`. */
export function stripInline(text: string): string {
  return flatten(parseInline(text, { premium: true }));
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
