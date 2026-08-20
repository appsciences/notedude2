import { test, expect, type Page } from "@playwright/test";

// Editing ends by itself after a spell of inactivity, so an editor the user has forgotten
// about cannot swallow keystrokes meant as shortcuts (#160). Thresholds mirror
// AWAY_EXIT_MS / IDLE_EXIT_MS in App.tsx.
const AWAY_MS = 2 * 60_000;
const IDLE_MS = 15 * 60_000;

// The clock has to be installed before the app loads, or the timers it arms on mount are
// the real ones and fastForward cannot reach them.
test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

/** Leave the window, as alt-tabbing to another app does. */
async function blur(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
}

async function refocus(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

/** Background the tab. visibilityState is read-only, so it is stubbed for the event. */
async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (h ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function startEditing(page: Page) {
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
}

test.describe("Editing inactivity timeout", () => {
  test("exits editing after the away threshold with the window blurred", async ({ page }) => {
    await startEditing(page);
    await blur(page);
    await page.clock.fastForward(AWAY_MS);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("exits editing after the away threshold with the tab hidden", async ({ page }) => {
    await startEditing(page);
    await setHidden(page, true);
    await page.clock.fastForward(AWAY_MS);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("a short absence leaves editing intact, so copy-paste round trips still work", async ({ page }) => {
    await startEditing(page);
    await blur(page);
    await page.clock.fastForward(15_000);
    await refocus(page);
    await page.clock.fastForward(15_000);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("returning to focus restarts the countdown rather than continuing it", async ({ page }) => {
    await startEditing(page);
    await blur(page);
    await page.clock.fastForward(AWAY_MS - 10_000);
    await refocus(page);
    // Past the away threshold in absolute terms, but focused and well inside the idle one.
    await page.clock.fastForward(60_000);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("exits editing after the idle threshold while focused", async ({ page }) => {
    await startEditing(page);
    await page.clock.fastForward(IDLE_MS);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("typing restarts the idle countdown", async ({ page }) => {
    await startEditing(page);
    await page.clock.fastForward(IDLE_MS - 60_000);
    await page.keyboard.type("x");
    await page.clock.fastForward(IDLE_MS - 60_000);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.clock.fastForward(2 * 60_000);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("content typed before the timeout is saved, not discarded", async ({ page }) => {
    await startEditing(page);
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" survived-the-timeout");

    await blur(page);
    await page.clock.fastForward(AWAY_MS);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("content-pane")).toContainText("survived-the-timeout");
  });

  test("an untouched new note is discarded on timeout, not persisted", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const before = await items.count();

    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(items).toHaveCount(before + 1);

    await blur(page);
    await page.clock.fastForward(AWAY_MS);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(items).toHaveCount(before);
  });

  test("search state is left alone by the timers", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    await blur(page);
    await page.clock.fastForward(IDLE_MS + AWAY_MS);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
  });
});
