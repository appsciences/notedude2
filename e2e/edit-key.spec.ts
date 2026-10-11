import { test, expect, type Page } from "@playwright/test";

// `e` is the only key that opens the editor from idle. Enter used to do it too, which made
// it mean four different things across three states and put the most reflexive key on the
// screen in charge of a mode switch (#155).

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const state = (page: Page) => expect(page.getByTestId("app"));

test.describe("Opening the editor (#155)", () => {
  test("e enters editing", async ({ page }) => {
    await page.keyboard.press("e");
    await state(page).toHaveAttribute("data-state", "editing");
  });

  test("Enter does nothing in idle", async ({ page }) => {
    await page.keyboard.press("Enter");
    await state(page).toHaveAttribute("data-state", "idle");
  });

  test("Enter does not type into the note either", async ({ page }) => {
    const before = await page.getByTestId("content-pane").textContent();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await state(page).toHaveAttribute("data-state", "idle");
    expect(await page.getByTestId("content-pane").textContent()).toBe(before);
  });

  test("e opens the editor with the cursor at the end", async ({ page }) => {
    await page.keyboard.press("e");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    const [start, end, len] = await editor.evaluate((el) => {
      const ta = el as HTMLTextAreaElement;
      return [ta.selectionStart, ta.selectionEnd, ta.value.length];
    });
    expect(start).toBe(len);
    expect(end).toBe(len);
  });

  test("search still applies its filter with Enter, and stops there", async ({ page }) => {
    await page.keyboard.press("/");
    await state(page).toHaveAttribute("data-state", "search");
    await page.keyboard.type("#intro");
    await page.keyboard.press("Enter");
    // Enter applies the filter and returns to idle — it must not continue into the editor.
    await state(page).toHaveAttribute("data-state", "idle");
    await page.keyboard.press("Enter");
    await state(page).toHaveAttribute("data-state", "idle");
  });

  test("Enter still inserts a newline while editing", async ({ page }) => {
    await page.keyboard.press("e");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.press("Enter");
    await editor.type("a new line");
    expect(await editor.inputValue()).toContain("\na new line");
  });

  test("Cmd+Enter still saves and exits", async ({ page }) => {
    await page.keyboard.press("e");
    await state(page).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("ControlOrMeta+Enter");
    await state(page).toHaveAttribute("data-state", "idle");
  });

  test("the help overlay lists e, not Enter, for editing", async ({ page }) => {
    await page.keyboard.press("?");
    const overlay = page.getByTestId("help-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("edit selected note");
    await expect(overlay.getByText("⏎ / e")).toHaveCount(0);
  });
});
