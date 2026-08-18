/**
 * Tab / Shift+Tab indentation for the note editor (#154).
 *
 * Pure text transforms — they take a value and a selection and return the value and selection
 * that should replace them, so the caller owns all DOM contact. `null` means "nothing to do",
 * which the caller must still swallow: the point of taking `Tab` is that focus stays put.
 */

const TAB = "\t";

/** A replacement value plus where the selection should land afterwards. */
export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** Index of the first character of the line containing `index`. */
function lineStart(value: string, index: number): number {
  if (index <= 0) return 0;
  return value.lastIndexOf("\n", index - 1) + 1;
}

/**
 * The whole-line span a line-wise operation should touch.
 *
 * A selection that stops exactly on a line break does not reach the line after it — dragging
 * down to the start of the next line is how most people select "these two lines", and
 * indenting a third would be a surprise.
 */
function blockRange(value: string, start: number, end: number): { from: number; to: number } {
  const from = lineStart(value, start);
  const lastChar = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", lastChar);
  return { from, to: nextBreak === -1 ? value.length : nextBreak };
}

/**
 * `Tab`. A caret or a within-line selection becomes a literal tab character; a selection that
 * spans lines indents each of them instead, and stays over those lines so `Tab` can be pressed
 * again to indent further.
 *
 * Blank lines inside a block are left alone — indenting them would only leave trailing
 * whitespace behind.
 */
export function indentSelection(value: string, start: number, end: number): TextEdit {
  if (!value.slice(start, end).includes("\n")) {
    return {
      value: value.slice(0, start) + TAB + value.slice(end),
      selectionStart: start + TAB.length,
      selectionEnd: start + TAB.length,
    };
  }

  const { from, to } = blockRange(value, start, end);
  let added = 0;
  const lines = value.slice(from, to).split("\n").map((line) => {
    if (line === "") return line;
    added += TAB.length;
    return TAB + line;
  });

  return {
    value: value.slice(0, from) + lines.join("\n") + value.slice(to),
    selectionStart: from,
    selectionEnd: to + added,
  };
}

/**
 * `Shift+Tab`. Strips one level of leading indentation from every line the selection touches:
 * a tab if there is one, otherwise up to `tabSize` spaces. Lines already flush left are left
 * alone rather than losing a character, and if that leaves nothing to do the whole edit is
 * dropped so the note is never marked dirty for a keystroke that changed nothing.
 */
export function outdentSelection(
  value: string,
  start: number,
  end: number,
  tabSize: number,
): TextEdit | null {
  const { from, to } = blockRange(value, start, end);

  let removedFromFirst = 0;
  let removedTotal = 0;
  const lines = value.slice(from, to).split("\n").map((line, i) => {
    let width = 0;
    if (line.startsWith(TAB)) {
      width = TAB.length;
    } else {
      while (width < tabSize && line[width] === " ") width++;
    }
    if (i === 0) removedFromFirst = width;
    removedTotal += width;
    return line.slice(width);
  });

  if (removedTotal === 0) return null;

  const selectionStart = Math.max(from, start - removedFromFirst);
  return {
    value: value.slice(0, from) + lines.join("\n") + value.slice(to),
    selectionStart,
    selectionEnd: Math.max(selectionStart, end - removedTotal),
  };
}
