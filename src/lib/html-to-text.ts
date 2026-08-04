/**
 * Converts pasted HTML into the plain text the editor stores (#133).
 *
 * Extracted from `App.tsx`'s paste handler so the list arithmetic is testable without
 * driving a browser clipboard. Rich text pasted from a doc or a web page arrives as HTML;
 * a note is a plain string, so the structure has to be rendered into characters:
 *
 * - `<ol>` numbers its items — `1.` at the top level, `a.` when nested
 * - `<ul>` bullets them with `•`
 * - nesting indents two spaces per level
 * - `<br>`, `<p>` and `<div>` become line breaks
 *
 * Runs of three or more blank lines are collapsed to one, and the result is trimmed.
 */
export function htmlToPlainText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // `counters` is one entry per open list: -1 marks a <ul> (bullets), and a count >= 0
  // tracks the next number for an <ol>. It is mutated as siblings are visited, so that
  // consecutive <li>s in the same list keep incrementing.
  function nodeToText(node: Node, counters: number[]): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    const el = node as Element;
    const tag = el.tagName?.toLowerCase();
    if (tag === "ol" || tag === "ul") {
      const newCounters = tag === "ol" ? [...counters, 0] : [...counters, -1];
      return Array.from(el.childNodes).map((c) => nodeToText(c, newCounters)).join("");
    }
    if (tag === "li") {
      const depth = counters.length - 1;
      const counter = counters[depth];
      let prefix: string;
      if (counter === -1) {
        prefix = "  ".repeat(depth) + "• ";
      } else {
        counters[depth]++;
        const n = counters[depth];
        prefix = depth === 0
          ? `${n}. `
          : "  ".repeat(depth) + `${"abcdefghijklmnopqrstuvwxyz"[n - 1]}. `;
      }
      const text = Array.from(el.childNodes).map((c) => nodeToText(c, counters)).join("").trim();
      return prefix + text + "\n";
    }
    if (tag === "br") return "\n";
    if (tag === "p" || tag === "div") {
      const text = Array.from(el.childNodes).map((c) => nodeToText(c, counters)).join("");
      return text + (text.endsWith("\n") ? "" : "\n");
    }
    return Array.from(el.childNodes).map((c) => nodeToText(c, counters)).join("");
  }

  return nodeToText(doc.body, []).replace(/\n{3,}/g, "\n\n").trim();
}
