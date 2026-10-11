import { test, expect, type Page } from "@playwright/test";

// Emptying a note the user had written into removes it from the list — a deliberate
// gesture (spec: Discard empty note), but until #159 an irrecoverable one: the note was
// gone and `z` did not bring it back. The discard is now undoable.

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const items = (page: Page) => page.getByTestId("list-pane").getByTestId("note-item");
const selected = (page: Page) =>
  page.locator("[data-testid='note-item'][data-selected='true']");

/** Empty the selected note and leave editing, which discards it. */
async function emptyAndExit(page: Page) {
  await page.keyboard.press("e");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  await page.getByTestId("content-pane").getByRole("textbox").fill("");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
}

test.describe("Undoing the discard of an emptied note (#159)", () => {
  test("z puts back a note that was emptied and discarded", async ({ page }) => {
    const before = await items(page).count();
    await emptyAndExit(page);
    await expect(items(page)).toHaveCount(before - 1);

    await page.keyboard.press("z");
    await expect(items(page)).toHaveCount(before);
  });

  test("the restored note carries the content it had, not an empty shell", async ({ page }) => {
    await expect(page.getByTestId("content-pane")).toContainText("Welcome to notedude");
    await emptyAndExit(page);
    await page.keyboard.press("z");

    await expect(page.getByTestId("content-pane")).toContainText("Welcome to notedude");
    await expect(items(page).first().getByTestId("note-item-title")).not.toHaveText("No Text Entered");
  });

  test("undo selects the restored note", async ({ page }) => {
    const title = await items(page).first().getByTestId("note-item-title").textContent();
    await emptyAndExit(page);
    await page.keyboard.press("z");
    await expect(selected(page).getByTestId("note-item-title")).toContainText(title!.trim());
  });

  test("Shift+Z discards it again", async ({ page }) => {
    const before = await items(page).count();
    await emptyAndExit(page);
    await page.keyboard.press("z");
    await expect(items(page)).toHaveCount(before);

    await page.keyboard.press("Shift+Z");
    await expect(items(page)).toHaveCount(before - 1);
  });

  test("the restored note can be edited again like any other", async ({ page }) => {
    await emptyAndExit(page);
    await page.keyboard.press("z");

    await page.keyboard.press("e");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" and back");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("content-pane")).toContainText("and back");
  });

  test("an untouched new note is discarded without becoming undoable", async ({ page }) => {
    const before = await items(page).count();
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("Escape");
    await expect(items(page)).toHaveCount(before);

    // z must not resurrect a note that never held anything the user wrote.
    await page.keyboard.press("z");
    await expect(items(page)).toHaveCount(before);
  });

  test("a note typed into then emptied in the same session is still undoable", async ({ page }) => {
    const before = await items(page).count();
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("Worth keeping");
    await editor.fill("");
    await page.keyboard.press("Escape");
    await expect(items(page)).toHaveCount(before);

    await page.keyboard.press("z");
    await expect(items(page)).toHaveCount(before + 1);
    await expect(page.getByTestId("content-pane")).toContainText("Worth keeping");
  });
});
