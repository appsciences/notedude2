import { test, expect } from "@playwright/test";

// Editing ends by itself after a spell of inactivity, so an editor the user has forgotten
// about — window still focused — cannot swallow keystrokes meant as shortcuts (#160). Leaving
// the window ends editing at once and is covered in mode-and-blur.spec.ts (#187); this is the
// case that one cannot see. The threshold mirrors IDLE_EXIT_MS in App.tsx.
const IDLE_MS = 15 * 60_000;

// The clock has to be installed before the app loads, or the timers it arms on mount are
// the real ones and fastForward cannot reach them.
test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const app = (page: import("@playwright/test").Page) => page.getByTestId("app");

async function startEditing(page: import("@playwright/test").Page) {
  await page.keyboard.press("e");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
}

test.describe("Editing inactivity timeout (#160)", () => {
  test("exits editing after the idle threshold while focused", async ({ page }) => {
    await startEditing(page);
    await page.clock.fastForward(IDLE_MS);
    await expect(app(page)).toHaveAttribute("data-state", "idle");
  });

  test("stays in editing short of the threshold", async ({ page }) => {
    await startEditing(page);
    await page.clock.fastForward(IDLE_MS - 60_000);
    await expect(app(page)).toHaveAttribute("data-state", "editing");
  });

  test("typing restarts the idle countdown", async ({ page }) => {
    await startEditing(page);
    await page.clock.fastForward(IDLE_MS - 60_000);
    await page.keyboard.type("x");
    await page.clock.fastForward(IDLE_MS - 60_000);
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    await page.clock.fastForward(2 * 60_000);
    await expect(app(page)).toHaveAttribute("data-state", "idle");
  });

  test("a click restarts the idle countdown", async ({ page }) => {
    await startEditing(page);
    await page.clock.fastForward(IDLE_MS - 60_000);
    await page.getByTestId("content-pane").getByRole("textbox").click();
    await page.clock.fastForward(IDLE_MS - 60_000);
    await expect(app(page)).toHaveAttribute("data-state", "editing");
  });

  test("content typed before the timeout is saved, not discarded", async ({ page }) => {
    await startEditing(page);
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.pressSequentially(" survived-the-timeout");

    await page.clock.fastForward(IDLE_MS);
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("content-pane")).toContainText("survived-the-timeout");
  });

  test("an untouched new note is discarded on timeout, not persisted", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const before = await items.count();

    await page.keyboard.press("c");
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    await expect(items).toHaveCount(before + 1);

    await page.clock.fastForward(IDLE_MS);
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await expect(items).toHaveCount(before);
  });

  test("search state is left alone by the timer", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(app(page)).toHaveAttribute("data-state", "search");
    await page.clock.fastForward(2 * IDLE_MS);
    await expect(app(page)).toHaveAttribute("data-state", "search");
  });
});
