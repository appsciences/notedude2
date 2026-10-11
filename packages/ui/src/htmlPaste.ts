/**
 * Rich text arriving on the clipboard, converted to the plain Markdown notedude stores.
 *
 * The converter predates the renderer. It used to emit the glyphs a reader sees — `• ` for
 * bullets and `a. ` for nested numbering — which is exactly what `parseNote` does *not*
 * understand, so from the moment #164 gave notes a renderer every pasted list came out as
 * flat prose carrying a stray bullet character. It now writes the same markers the list
 * shortcuts write and lets the reader draw the glyphs (#157, #179).
 *
 * The walk runs over `PastedNode` rather than the DOM, so it is unit-testable under
 * `node --test`, which has no DOM. `pastedNodeFromDom` is the adapter the app pastes through.
 */

/** One nesting step — the same two spaces `markdown.ts` indents by. */
const INDENT = "  ";

/** A sentinel counter marking an unordered level, which needs no running number. */
const UNORDERED = -1;

/**
 * A clipboard node, reduced to what the conversion actually reads: either text, or an element
 * with a lowercased tag and children.
 */
export interface PastedNode {
  /** Present on a text node. */
  text?: string;
  /** Lowercased tag name, present on an element. */
  tag?: string;
  children?: PastedNode[];
}

function isList(node: PastedNode): boolean {
  return node.tag === "ul" || node.tag === "ol";
}

function childrenOf(node: PastedNode): PastedNode[] {
  return node.children ?? [];
}

/**
 * `counters` carries one entry per open list, so an item knows its depth and, in an ordered
 * list, its number. It is mutated as items are walked — that running count is the point.
 */
function nodeToText(node: PastedNode, counters: number[]): string {
  if (node.text !== undefined) return node.text;

  const tag = node.tag;

  if (isList(node)) {
    const nested = [...counters, tag === "ol" ? 0 : UNORDERED];
    return childrenOf(node).map((c) => nodeToText(c, nested)).join("");
  }

  if (tag === "li") {
    const depth = Math.max(0, counters.length - 1);
    let marker: string;
    if (counters[depth] === UNORDERED || counters[depth] === undefined) {
      // `*` is the bulleted marker in #157's mapping; the reader draws it as •.
      marker = "*";
    } else {
      counters[depth] += 1;
      // Every depth keeps numbering. Lettering sub-items the way a word processor does has
      // no Markdown spelling here, so it used to land in the note as unparsed text (#179).
      marker = `${counters[depth]}.`;
    }

    // An item's own text and any list nested inside it are kept apart, so the nested list
    // begins on a line of its own rather than being trimmed onto the parent's (#135).
    const own = childrenOf(node)
      .filter((c) => !isList(c))
      .map((c) => nodeToText(c, counters))
      .join("")
      .trim();
    const nested = childrenOf(node)
      .filter(isList)
      .map((c) => nodeToText(c, counters))
      .join("");

    return INDENT.repeat(depth) + marker + " " + own + "\n" + nested;
  }

  if (tag === "br") return "\n";

  if (tag === "p" || tag === "div") {
    const text = childrenOf(node).map((c) => nodeToText(c, counters)).join("");
    return text + (text.endsWith("\n") ? "" : "\n");
  }

  return childrenOf(node).map((c) => nodeToText(c, counters)).join("");
}

/**
 * The note text for a pasted fragment. Empty when the fragment carried nothing worth
 * inserting, which is the caller's cue to let the browser paste plain text instead.
 */
export function htmlToNoteText(root: PastedNode): string {
  return nodeToText(root, []).replace(/\n{3,}/g, "\n\n").trim();
}

/** Browser side: the clipboard's DOM, reduced to the shape the conversion walks. */
export function pastedNodeFromDom(node: Node): PastedNode {
  if (node.nodeType === 3 /* Node.TEXT_NODE */) return { text: node.textContent ?? "" };
  return {
    tag: (node as Element).tagName?.toLowerCase(),
    children: Array.from(node.childNodes).map(pastedNodeFromDom),
  };
}
