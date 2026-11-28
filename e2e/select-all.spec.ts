import { test, expect, type Page } from "@playwright/test";

/**
 * ⇧⌘A / Ctrl+Shift+A selects all the text of the current note, in Idle State.
 *
 * Plain ⌘A selects the whole page — list pane, mode line and all — so pasting or copying
 * the result is never just the note. This is the note-only version.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const app = (page: Page) => page.getByTestId("app");
const selection = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? "");

/** Composes a note with `content` and commits it, leaving it selected in idle. */
async function composeNote(page: Page, content: string) {
  await page.keyboard.press("c");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await page.getByTestId("content-pane").getByRole("textbox").fill(content);
  await page.keyboard.press("Escape");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
}

test.describe("select all text in the note", () => {
  for (const combo of ["Meta+Shift+A", "Control+Shift+A"]) {
    test(`${combo} selects the note's text and nothing else`, async ({ page }) => {
      await composeNote(page, "zebra stripes\nquagga spots");

      await page.keyboard.press(combo);

      const selected = await selection(page);
      expect(selected).toContain("zebra stripes");
      expect(selected).toContain("quagga spots");
      // Only the note: not the list pane's titles, not the mode line.
      const listText = await page.getByTestId("list-pane").innerText();
      const firstOtherTitle = listText.split("\n").find((l) => l.trim() && !/zebra|quagga/.test(l));
      if (firstOtherTitle) expect(selected).not.toContain(firstOtherTitle.trim());
      // Nothing else happened.
      await expect(app(page)).toHaveAttribute("data-state", "idle");
    });
  }

  test("the selection is the whole raw note when viewing Markdown source", async ({ page }) => {
    await composeNote(page, "# Title\n* item");
    await page.keyboard.press("m");
    await page.keyboard.press("Meta+Shift+A");

    const selected = await selection(page);
    expect(selected).toContain("# Title");
    expect(selected).toContain("* item");
  });

  test("does not change the selected note or leave idle", async ({ page }) => {
    await composeNote(page, "stay put");
    const before = await page.getByTestId("list-pane").getByTestId("note-item-title").count();

    await page.keyboard.press("Meta+Shift+A");

    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("list-pane").getByTestId("note-item-title")).toHaveCount(before);
  });

  test("while editing, it is left to the browser", async ({ page }) => {
    await page.keyboard.press("c");
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    const box = page.getByTestId("content-pane").getByRole("textbox");
    await box.fill("typed text");

    await page.keyboard.press("Meta+Shift+A");

    await expect(app(page)).toHaveAttribute("data-state", "editing");
    await expect(box).toHaveValue("typed text");
  });
});
