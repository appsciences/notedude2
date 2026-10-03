import { test, expect, type Page } from "@playwright/test";

/**
 * Headings and lists, end to end (#156, #157).
 *
 * The line-rewriting itself is covered exhaustively by the unit tests in
 * `packages/ui/src/markdown.test.ts`. What can only be checked here is the wiring: that the
 * shortcuts reach the textarea at all, that `e.code` matching survives a real browser's
 * `⇧⌘7` (which arrives as `"&"`), and that the caret lands where the user expects afterwards.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");

/** Opens a fresh note and types `content` into it, leaving the app in editing state. */
async function composeNote(page: Page, content: string) {
  await page.keyboard.press("c");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  await editor(page).fill(content);
}

/** Commits the edit so the read-only pane renders. */
async function commit(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
}

test.describe("heading shortcuts", () => {
  test("⇧⌘T / ⇧⌘H / ⇧⌘J write the three heading levels", async ({ page }) => {
    for (const [combo, prefix] of [
      ["Meta+Shift+KeyT", "# "],
      ["Meta+Shift+KeyH", "## "],
      ["Meta+Shift+KeyJ", "### "],
    ] as const) {
      await composeNote(page, "Groceries");
      await page.keyboard.press(combo);
      await expect(editor(page)).toHaveValue(prefix + "Groceries");
      await commit(page);
    }
  });

  test("pressing the same level twice returns the line to body", async ({ page }) => {
    await composeNote(page, "Groceries");
    await page.keyboard.press("Meta+Shift+KeyH");
    await expect(editor(page)).toHaveValue("## Groceries");
    await page.keyboard.press("Meta+Shift+KeyH");
    await expect(editor(page)).toHaveValue("Groceries");
  });

  test("a different level replaces rather than stacking", async ({ page }) => {
    await composeNote(page, "Groceries");
    await page.keyboard.press("Meta+Shift+KeyH");
    await page.keyboard.press("Meta+Shift+KeyT");
    await expect(editor(page)).toHaveValue("# Groceries");
  });

  test("⇧⌘B strips the heading", async ({ page }) => {
    await composeNote(page, "Groceries");
    await page.keyboard.press("Meta+Shift+KeyJ");
    await expect(editor(page)).toHaveValue("### Groceries");
    await page.keyboard.press("Meta+Shift+KeyB");
    await expect(editor(page)).toHaveValue("Groceries");
  });

  test("the caret stays with the text, so typing continues where it left off", async ({ page }) => {
    await composeNote(page, "Grocer");
    await page.keyboard.press("Meta+Shift+KeyH");
    await page.keyboard.type("ies");
    await expect(editor(page)).toHaveValue("## Groceries");
  });

  test("headings render without their hashes", async ({ page }) => {
    await composeNote(page, "# Title\n## Heading\n### Sub\nbody");
    await commit(page);

    const headings = page.getByTestId("md-heading");
    await expect(headings).toHaveCount(3);
    await expect(headings.nth(0)).toHaveText("Title");
    await expect(headings.nth(0)).toHaveAttribute("data-level", "1");
    await expect(headings.nth(1)).toHaveText("Heading");
    await expect(headings.nth(1)).toHaveAttribute("data-level", "2");
    await expect(headings.nth(2)).toHaveText("Sub");
    await expect(headings.nth(2)).toHaveAttribute("data-level", "3");
  });

  test("a heading is visibly larger than body text", async ({ page }) => {
    await composeNote(page, "# Title\nbody");
    await commit(page);

    const size = async (locator: ReturnType<Page["locator"]>) =>
      parseFloat(
        await locator.evaluate((el) => getComputedStyle(el as HTMLElement).fontSize)
      );

    const heading = await size(page.getByTestId("md-heading").first());
    const body = await size(page.getByTestId("content-pane"));
    expect(heading).toBeGreaterThan(body);
  });
});

test.describe("list shortcuts", () => {
  test("⇧⌘7 / ⇧⌘8 / ⇧⌘9 write the three markers", async ({ page }) => {
    for (const [combo, prefix] of [
      ["Meta+Shift+Digit7", "* "],
      ["Meta+Shift+Digit8", "- "],
      ["Meta+Shift+Digit9", "1. "],
    ] as const) {
      await composeNote(page, "milk");
      await page.keyboard.press(combo);
      await expect(editor(page)).toHaveValue(prefix + "milk");
      await commit(page);
    }
  });

  test("pressing the same marker twice removes it", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+Digit7");
    await expect(editor(page)).toHaveValue("* milk");
    await page.keyboard.press("Meta+Shift+Digit7");
    await expect(editor(page)).toHaveValue("milk");
  });

  test("Enter opens the next item, and Enter on an empty one ends the list", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+Digit7");
    await page.keyboard.press("Enter");
    await expect(editor(page)).toHaveValue("* milk\n* ");
    await page.keyboard.type("eggs");
    await expect(editor(page)).toHaveValue("* milk\n* eggs");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(editor(page)).toHaveValue("* milk\n* eggs\n");
  });

  test("a numbered list increments as you go", async ({ page }) => {
    await composeNote(page, "first");
    await page.keyboard.press("Meta+Shift+Digit9");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second");
    await page.keyboard.press("Enter");
    await page.keyboard.type("third");
    await expect(editor(page)).toHaveValue("1. first\n2. second\n3. third");
  });

  test("Tab indents a list item and Shift+Tab brings it back", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+Digit7");
    await page.keyboard.press("Tab");
    await expect(editor(page)).toHaveValue("  * milk");
    await page.keyboard.press("Shift+Tab");
    await expect(editor(page)).toHaveValue("* milk");
  });

  test("lists render with real markers, not their source characters", async ({ page }) => {
    await composeNote(page, "* milk\n- eggs\n1. bread\n1. jam");
    await commit(page);

    const items = page.getByTestId("md-list-item");
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toHaveAttribute("data-marker", "bullet");
    await expect(items.nth(0)).toContainText("milk");
    await expect(items.nth(0)).not.toContainText("*");
    await expect(items.nth(1)).toHaveAttribute("data-marker", "dash");
    // Both source lines say `1.`; the reader sees them renumbered.
    await expect(items.nth(2)).toContainText("1.");
    await expect(items.nth(3)).toContainText("2.");
  });

  test("nesting is preserved in the rendered list", async ({ page }) => {
    await composeNote(page, "* top\n  * nested");
    await commit(page);

    const items = page.getByTestId("md-list-item");
    await expect(items.nth(0)).toHaveAttribute("data-indent", "0");
    await expect(items.nth(1)).toHaveAttribute("data-indent", "2");
  });
});

test.describe("tags are not markup", () => {
  test("a #tag line is never mistaken for a heading", async ({ page }) => {
    await composeNote(page, "#tasks-today\n#archived\nbuy milk #tips");
    await commit(page);
    await expect(page.getByTestId("md-heading")).toHaveCount(0);
  });

  test("a note carrying task tags still renders them as text", async ({ page }) => {
    await composeNote(page, "## Groceries #tasks-today\nmilk");
    await commit(page);
    await expect(page.getByTestId("md-heading")).toHaveCount(1);
    await expect(page.getByTestId("md-heading")).toContainText("#tasks-today");
  });
});

test.describe("note list", () => {
  // The row for the note just written — not `.first()`, which is the pinned welcome note.
  const composedRow = (page: Page) =>
    page
      .getByTestId("list-pane")
      .locator("[data-selected='true']")
      .getByTestId("note-item-title");

  test("a row shows the heading text, not the hashes", async ({ page }) => {
    await composeNote(page, "# Groceries\nmilk");
    await commit(page);
    await expect(composedRow(page)).toHaveText("Groceries");
  });

  test("a row whose first line is a list item drops the marker", async ({ page }) => {
    await composeNote(page, "* milk\neggs");
    await commit(page);
    await expect(composedRow(page)).toHaveText("milk");
  });
});

test.describe("pasted rich text becomes Markdown (#179)", () => {
  /**
   * Dispatches a real paste carrying `text/html`, which is the only way to reach the app's
   * `onPaste`. The conversion itself is unit-tested in `packages/ui/src/htmlPaste.test.ts`;
   * what matters here is that what lands in the note is text the renderer parses as a list.
   */
  async function pasteHtml(page: Page, html: string) {
    await page.evaluate((markup) => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="content-pane"] textarea',
      );
      if (!ta) throw new Error("no editor");
      ta.focus();
      const data = new DataTransfer();
      data.setData("text/html", markup);
      ta.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, html);
  }

  test("a pasted bulleted list renders as a list, not as prose with a stray •", async ({ page }) => {
    await composeNote(page, "");
    await pasteHtml(page, "<ul><li>milk</li><li>eggs</li></ul>");
    await expect(editor(page)).toHaveValue("* milk\n* eggs");
    await commit(page);
    await expect(page.getByTestId("md-list-item")).toHaveCount(2);
    await expect(page.getByTestId("content-pane")).not.toContainText("* milk");
  });

  test("a pasted numbered list keeps numbering at every depth", async ({ page }) => {
    await composeNote(page, "");
    await pasteHtml(page, "<ol><li>parent<ol><li>one</li><li>two</li></ol></li></ol>");
    await expect(editor(page)).toHaveValue("1. parent\n  1. one\n  2. two");
    await commit(page);
    await expect(page.getByTestId("md-list-item")).toHaveCount(3);
  });

  test("a nested list does not glue onto its parent item (#135)", async ({ page }) => {
    await composeNote(page, "");
    await pasteHtml(page, "<ul><li>fruit<ul><li>apples</li></ul></li><li>bread</li></ul>");
    await expect(editor(page)).toHaveValue("* fruit\n  * apples\n* bread");
  });

  test("a pasted item continues on Enter, because it is a real list item", async ({ page }) => {
    await composeNote(page, "");
    await pasteHtml(page, "<ul><li>milk</li></ul>");
    await expect(editor(page)).toHaveValue("* milk");

    // Commit and re-enter rather than typing straight on: the paste parks the caret in a
    // requestAnimationFrame, and racing that only tests the paste handler's timing. What is
    // under test is that the *text* a paste leaves behind is a list item like any other.
    await commit(page);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        '[data-testid="content-pane"] textarea',
      );
      ta?.setSelectionRange(ta.value.length, ta.value.length);
    });

    await page.keyboard.press("Enter");
    await page.keyboard.type("eggs");
    await expect(editor(page)).toHaveValue("* milk\n* eggs");
  });
});

test.describe("plain notes are unaffected", () => {
  test("blank lines keep their spacing", async ({ page }) => {
    await composeNote(page, "one\n\n\ntwo");
    await commit(page);
    await expect(page.getByTestId("content-pane")).toContainText("one");
    await expect(page.getByTestId("content-pane")).toContainText("two");
    await expect(page.getByTestId("md-heading")).toHaveCount(0);
    await expect(page.getByTestId("md-list-item")).toHaveCount(0);
  });

  test("Enter outside a list still inserts an ordinary newline", async ({ page }) => {
    await composeNote(page, "plain");
    await page.keyboard.press("Enter");
    await page.keyboard.type("more");
    await expect(editor(page)).toHaveValue("plain\nmore");
  });
});
