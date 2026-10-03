import { test, expect, type Page } from "@playwright/test";

// Two halves of one problem: coming back to an app still in Editing State is disconcerting
// because the mode is easy to miss (#188) and nothing ends it when you leave (#187).

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const app = (page: Page) => page.getByTestId("app");
const modeLine = (page: Page) => page.getByTestId("mode-line");
const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");

const windowBlur = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("blur")));
const hideTab = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

test.describe("Mode line (#188)", () => {
  test("is blank in idle, like Vim's normal mode", async ({ page }) => {
    await expect(modeLine(page)).toBeVisible();
    await expect(modeLine(page)).toHaveText("");
  });

  test("shows -- INSERT -- while editing", async ({ page }) => {
    await page.keyboard.press("e");
    await expect(modeLine(page)).toHaveText("-- INSERT --");
  });

  test("clears again on Esc", async ({ page }) => {
    await page.keyboard.press("e");
    await expect(modeLine(page)).toHaveText("-- INSERT --");
    await page.keyboard.press("Escape");
    await expect(modeLine(page)).toHaveText("");
  });

  test("entering and leaving editing moves nothing", async ({ page }) => {
    const box = () => page.getByTestId("content-pane").boundingBox();
    const before = await box();
    const lineBefore = await modeLine(page).boundingBox();
    await page.keyboard.press("e");
    await expect(modeLine(page)).toHaveText("-- INSERT --");
    expect(await box()).toEqual(before);
    expect(await modeLine(page).boundingBox()).toEqual(lineBefore);
  });
});

test.describe("Leaving the app ends editing (#187)", () => {
  test("window blur saves and returns to idle", async ({ page }) => {
    await page.keyboard.press("e");
    await page.keyboard.type(" blur-saved");
    await windowBlur(page);
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("content-pane")).toContainText("blur-saved");
    await expect(modeLine(page)).toHaveText("");
  });

  test("the tab becoming hidden saves and returns to idle", async ({ page }) => {
    await page.keyboard.press("e");
    await page.keyboard.type(" hidden-saved");
    await hideTab(page);
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("content-pane")).toContainText("hidden-saved");
  });

  test("blur in idle does nothing", async ({ page }) => {
    await windowBlur(page);
    await expect(app(page)).toHaveAttribute("data-state", "idle");
  });

  test("blur in search state keeps the search open", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(app(page)).toHaveAttribute("data-state", "search");
    await windowBlur(page);
    await expect(app(page)).toHaveAttribute("data-state", "search");
  });

  test("the editor losing focus inside the app does not end editing", async ({ page }) => {
    await page.keyboard.press("e");
    await editor(page).blur();
    await expect(app(page)).toHaveAttribute("data-state", "editing");
  });
});
