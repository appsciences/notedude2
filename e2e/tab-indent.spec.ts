import { test, expect, type Locator, type Page } from "@playwright/test";

// Tab / Shift+Tab indentation in the editor (#154).
//
// `Tab` is claimed only in editing state. That is a deliberate accessibility trade: the key
// normally moves focus, and taking it traps a keyboard-only user unless there is another way
// out. There is — `Esc` and `⌘⏎` both save and return to idle — so the trap is escapable and
// the tests below assert both halves of that bargain.

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

/** The editing textarea, once the app is in editing state. */
function editorOf(page: Page) {
  return page.getByTestId("content-pane").getByRole("textbox");
}

/** Enter editing on the selected note and replace its content with `text`. */
async function editWith(page: Page, text: string) {
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  const editor = editorOf(page);
  await editor.fill(text);
  return editor;
}

/** Place the caret / selection by character offset, as a real select would. */
async function select(editor: Locator, start: number, end = start) {
  await editor.evaluate((el, range) => {
    const ta = el as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(range[0], range[1]);
    ta.dispatchEvent(new Event("select", { bubbles: true }));
  }, [start, end]);
}

const valueOf = (editor: Locator) => editor.inputValue();

const selectionOf = (editor: Locator) =>
  editor.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    return { start: ta.selectionStart, end: ta.selectionEnd };
  });

test.describe("Tab inserts a tab character", () => {

  test("Tab at the caret inserts a tab and leaves the caret after it", async ({ page }) => {
    const editor = await editWith(page, "Name\nAda");
    await select(editor, 4); // end of "Name"

    await page.keyboard.press("Tab");

    await expect.poll(() => valueOf(editor)).toBe("Name\t\nAda");
    expect(await selectionOf(editor)).toEqual({ start: 5, end: 5 });
  });

  test("Tab does not move focus out of the editor", async ({ page }) => {
    const editor = await editWith(page, "Name");
    await select(editor, 4);

    await page.keyboard.press("Tab");

    await expect(editor).toBeFocused();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("Tab replaces a selection inside one line with a single tab", async ({ page }) => {
    const editor = await editWith(page, "Name    Age");
    await select(editor, 4, 8); // the run of spaces

    await page.keyboard.press("Tab");

    await expect.poll(() => valueOf(editor)).toBe("Name\tAge");
    expect(await selectionOf(editor)).toEqual({ start: 5, end: 5 });
  });

  test("repeated Tab presses build up a row of columns", async ({ page }) => {
    const editor = await editWith(page, "");
    await editor.pressSequentially("Name");
    await page.keyboard.press("Tab");
    await editor.pressSequentially("Age");
    await page.keyboard.press("Tab");
    await editor.pressSequentially("City");

    await expect.poll(() => valueOf(editor)).toBe("Name\tAge\tCity");
  });
});

test.describe("Tab over a multi-line selection indents each line", () => {

  test("every selected line gains one leading tab", async ({ page }) => {
    const editor = await editWith(page, "one\ntwo\nthree");
    await select(editor, 0, 7); // "one\ntwo"

    await page.keyboard.press("Tab");

    await expect.poll(() => valueOf(editor)).toBe("\tone\n\ttwo\nthree");
  });

  test("a partial selection still indents whole lines", async ({ page }) => {
    const editor = await editWith(page, "one\ntwo\nthree");
    await select(editor, 1, 5); // "ne\nt" — touches lines 1 and 2

    await page.keyboard.press("Tab");

    await expect.poll(() => valueOf(editor)).toBe("\tone\n\ttwo\nthree");
  });

  test("the selection still covers the same lines, so Tab can be pressed again", async ({ page }) => {
    const editor = await editWith(page, "one\ntwo\nthree");
    await select(editor, 0, 7);

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    await expect.poll(() => valueOf(editor)).toBe("\t\tone\n\t\ttwo\nthree");
  });

  test("blank lines in the block are left alone", async ({ page }) => {
    const editor = await editWith(page, "one\n\ntwo");
    await select(editor, 0, 8);

    await page.keyboard.press("Tab");

    // Indenting a blank line would only leave trailing whitespace behind.
    await expect.poll(() => valueOf(editor)).toBe("\tone\n\n\ttwo");
  });

  test("a trailing newline in the selection does not indent the line below", async ({ page }) => {
    const editor = await editWith(page, "one\ntwo\nthree");
    await select(editor, 0, 8); // "one\ntwo\n" — the caret sits at the start of "three"

    await page.keyboard.press("Tab");

    await expect.poll(() => valueOf(editor)).toBe("\tone\n\ttwo\nthree");
  });
});

test.describe("Shift+Tab outdents", () => {

  test("removes one leading tab from the caret's line", async ({ page }) => {
    const editor = await editWith(page, "one\n\t\ttwo");
    await select(editor, 9); // end of "two"

    await page.keyboard.press("Shift+Tab");

    await expect.poll(() => valueOf(editor)).toBe("one\n\ttwo");
  });

  test("falls back to leading spaces when the line has no tab", async ({ page }) => {
    const editor = await editWith(page, "        eight spaces");
    await select(editor, 20);

    await page.keyboard.press("Shift+Tab");

    // One tab-width of spaces goes, not all of them.
    await expect.poll(() => valueOf(editor)).toBe("    eight spaces");
  });

  test("removes a short run of spaces without eating the first character", async ({ page }) => {
    const editor = await editWith(page, "  two spaces");
    await select(editor, 12);

    await page.keyboard.press("Shift+Tab");

    await expect.poll(() => valueOf(editor)).toBe("two spaces");
  });

  test("is a no-op on a line that is already flush left", async ({ page }) => {
    const editor = await editWith(page, "flush left");
    await select(editor, 5);

    await page.keyboard.press("Shift+Tab");

    await expect.poll(() => valueOf(editor)).toBe("flush left");
    expect(await selectionOf(editor)).toEqual({ start: 5, end: 5 });
  });

  test("a no-op Shift+Tab still keeps focus in the editor", async ({ page }) => {
    const editor = await editWith(page, "flush left");
    await select(editor, 5);

    await page.keyboard.press("Shift+Tab");

    await expect(editor).toBeFocused();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("outdents every line of a multi-line selection", async ({ page }) => {
    const editor = await editWith(page, "\tone\n\ttwo\n\tthree");
    await select(editor, 0, 9); // lines 1 and 2

    await page.keyboard.press("Shift+Tab");

    await expect.poll(() => valueOf(editor)).toBe("one\ntwo\n\tthree");
  });

  test("skips already-flush lines in a mixed selection", async ({ page }) => {
    const editor = await editWith(page, "one\n\ttwo");
    await select(editor, 0, 8);

    await page.keyboard.press("Shift+Tab");

    await expect.poll(() => valueOf(editor)).toBe("one\ntwo");
  });

  test("Tab then Shift+Tab round-trips back to the original text", async ({ page }) => {
    const editor = await editWith(page, "one\ntwo");
    await select(editor, 0, 7);

    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");

    await expect.poll(() => valueOf(editor)).toBe("one\ntwo");
  });
});

test.describe("Tabs survive the round trip to read mode", () => {

  test("a tabbed table is still tabbed after saving", async ({ page }) => {
    const editor = await editWith(page, "");
    await editor.pressSequentially("Name");
    await page.keyboard.press("Tab");
    await editor.pressSequentially("Age");
    await page.keyboard.press("Enter");
    await editor.pressSequentially("Ada");
    await page.keyboard.press("Tab");
    await editor.pressSequentially("36");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const text = await page.getByTestId("note-text").textContent();
    expect(text).toBe("Name\tAge\nAda\t36");
  });

  test("the editor and the read view agree on tab width", async ({ page }) => {
    const editor = await editWith(page, "a\tb");
    const editing = await editor.evaluate((el) => getComputedStyle(el).tabSize);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const reading = await page
      .getByTestId("note-text")
      .evaluate((el) => getComputedStyle(el).tabSize);

    expect(editing).toBe(reading);
    // Pinned rather than left to the browser's default of 8, so the two cannot drift apart.
    expect(editing).toBe("4");
  });
});

test.describe("Tab is claimed in editing state only", () => {

  test("Tab in idle state does not alter the note", async ({ page }) => {
    const before = await page.getByTestId("note-text").textContent();

    await page.keyboard.press("Tab");

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    expect(await page.getByTestId("note-text").textContent()).toBe(before);
  });

  test("Esc still leaves the editor, so the tab trap is escapable", async ({ page }) => {
    const editor = await editWith(page, "trapped");
    await page.keyboard.press("Tab");
    await expect(editor).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("Cmd+Enter still leaves the editor", async ({ page }) => {
    await editWith(page, "trapped");
    await page.keyboard.press("Tab");

    await page.keyboard.press("Meta+Enter");

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });
});

test.describe("Help overlay", () => {

  test("lists Tab and Shift+Tab under editing", async ({ page }) => {
    await page.keyboard.press("?");
    const overlay = page.getByTestId("help-overlay");
    await expect(overlay).toBeVisible();

    await expect(overlay).toContainText("editing");
    await expect(overlay).toContainText("Tab");
    await expect(overlay).toContainText("Shift+Tab");
  });
});
