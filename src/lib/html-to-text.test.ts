import { describe, it, expect } from "vitest";
import { htmlToPlainText } from "./html-to-text";

/**
 * The paste converter had no coverage at all before #133 — ~45 lines of recursive list
 * arithmetic that only ran when a human pasted rich text into the editor.
 */
describe("htmlToPlainText", () => {
  describe("blocks and line breaks", () => {
    it("passes plain text straight through", () => {
      expect(htmlToPlainText("hello world")).toBe("hello world");
    });

    it("puts each paragraph on its own line", () => {
      expect(htmlToPlainText("<p>one</p><p>two</p>")).toBe("one\ntwo");
    });

    it("turns <br> into a line break", () => {
      expect(htmlToPlainText("line1<br>line2")).toBe("line1\nline2");
    });

    it("treats <div> as a block, like <p>", () => {
      expect(htmlToPlainText("<div>a</div><div>b</div>")).toBe("a\nb");
    });

    it("keeps inline formatting as plain text", () => {
      expect(htmlToPlainText("<p>hello <b>bold</b> world</p>")).toBe("hello bold world");
    });

    it("collapses runs of three or more newlines down to one blank line", () => {
      expect(htmlToPlainText("<p>a</p><br><br><br><p>b</p>")).toBe("a\n\nb");
    });

    it("trims leading and trailing whitespace", () => {
      expect(htmlToPlainText("<p>  spaced  </p>")).toBe("spaced");
    });

    it("returns empty string for markup with no text", () => {
      expect(htmlToPlainText("<p></p>")).toBe("");
      expect(htmlToPlainText("")).toBe("");
    });
  });

  describe("unordered lists", () => {
    it("bullets each item", () => {
      expect(htmlToPlainText("<ul><li>x</li><li>y</li></ul>")).toBe("• x\n• y");
    });

    it("bullets a single item", () => {
      expect(htmlToPlainText("<ul><li>only</li></ul>")).toBe("• only");
    });
  });

  describe("ordered lists", () => {
    it("numbers items from one", () => {
      expect(htmlToPlainText("<ol><li>a</li><li>b</li><li>c</li></ol>")).toBe("1. a\n2. b\n3. c");
    });

    it("restarts numbering for a second, separate list", () => {
      expect(htmlToPlainText("<ol><li>a</li></ol><ol><li>b</li></ol>")).toBe("1. a\n1. b");
    });

    it("keeps counting past nine", () => {
      const items = Array.from({ length: 11 }, (_, i) => `<li>i${i}</li>`).join("");
      const out = htmlToPlainText(`<ol>${items}</ol>`);
      expect(out.split("\n")[9]).toBe("10. i9");
      expect(out.split("\n")[10]).toBe("11. i10");
    });
  });

  describe("lists mixed with prose", () => {
    it("keeps paragraphs before and after a list on their own lines", () => {
      expect(htmlToPlainText("<p>Intro</p><ol><li>a</li><li>b</li></ol><p>Outro</p>")).toBe(
        "Intro\n1. a\n2. b\nOutro"
      );
    });
  });

  describe("nested lists", () => {
    it("letters a nested ordered list and indents it two spaces", () => {
      const out = htmlToPlainText(
        "<ol><li>one<ol><li>sub1</li><li>sub2</li></ol></li><li>two</li></ol>"
      );
      // NOTE: `1. one  a. sub1` on one line is a known defect — the first nested item is
      // glued to its parent instead of starting a new line. Tracked in #135; this
      // expectation pins today's behaviour and should flip when that is fixed.
      expect(out).toBe("1. one  a. sub1\n  b. sub2\n2. two");

      // What is genuinely correct here, and must survive the #135 fix:
      expect(out).toContain("  a. sub1"); // nested ordered items are lettered and indented
      expect(out).toContain("  b. sub2");
      expect(out).toContain("2. two"); // the outer list resumes its own numbering
    });

    it("indents a nested unordered list", () => {
      // Also affected by #135 — `• one` and `• sub` belong on separate lines.
      expect(htmlToPlainText("<ul><li>one<ul><li>sub</li></ul></li></ul>")).toBe("• one  • sub");
    });

    it("numbers the outer list independently of the nested one", () => {
      const out = htmlToPlainText(
        "<ol><li>first<ol><li>x</li></ol></li><li>second</li><li>third</li></ol>"
      );
      expect(out).toContain("2. second");
      expect(out).toContain("3. third");
      expect(out).toContain("  a. x");
    });
  });
});
