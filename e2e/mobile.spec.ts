import { test, expect } from "@playwright/test";

// Replaces the old mobile-block.spec.ts. notedude used to refuse to run on any mobile
// user-agent; it now renders a single-pane layout on narrow viewports instead (#108).

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };

test.describe("Mobile Support", () => {
  test("mobile user-agent reaches the login page instead of a block message", async ({
    browser,
  }) => {
    const context = await browser.newContext({ userAgent: MOBILE_UA, viewport: NARROW });
    const page = await context.newPage();
    await page.goto("/");

    await expect(page.getByTestId("mobile-block")).toHaveCount(0);
    await expect(page.getByTestId("login-screen")).toBeVisible();
    await expect(page.getByText("sign in with google")).toBeVisible();

    await context.close();
  });

  test("narrow viewport opens on the list pane only", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await expect(page.getByTestId("list-pane")).toBeVisible();
    await expect(page.getByTestId("content-pane")).toBeHidden();
    // The vertical rule between panes is meaningless in single-pane mode.
    await expect(page.getByTestId("divider")).toBeHidden();
  });

  test("tapping a note opens the content pane, and back returns to the list", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await page.getByTestId("note-item").first().click();
    await expect(page.getByTestId("content-pane")).toBeVisible();
    await expect(page.getByTestId("list-pane")).toBeHidden();

    await page.getByTestId("mobile-back").click();
    await expect(page.getByTestId("list-pane")).toBeVisible();
    await expect(page.getByTestId("content-pane")).toBeHidden();
  });

  test("compose button creates a note and opens it for editing", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const before = await page.getByTestId("note-item").count();

    await page.getByTestId("mobile-compose").click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(page.getByTestId("content-pane")).toBeVisible();

    await page.getByRole("textbox").fill("written on a phone");
    await page.getByTestId("mobile-back").click();

    await expect(page.getByTestId("list-pane")).toBeVisible();
    expect(await page.getByTestId("note-item").count()).toBe(before + 1);
    // Not necessarily first in the list: pinned notes sort above it.
    await expect(
      page.getByTestId("note-item").filter({ hasText: "written on a phone" })
    ).toHaveCount(1);
  });

  test("desktop viewport is unchanged: both panes, no mobile toolbar", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await expect(page.getByTestId("list-pane")).toBeVisible();
    await expect(page.getByTestId("content-pane")).toBeVisible();
    await expect(page.getByTestId("divider")).toBeVisible();
    await expect(page.getByTestId("mobile-compose")).toHaveCount(0);
    await expect(page.getByTestId("mobile-back")).toHaveCount(0);
  });

  // The voice prompts (#144) are aimed at exactly this viewport, so their rows have to be
  // legible here: a phrase column beside a description left ~80px for the description at
  // 390px and wrapped it over four lines, so on narrow the two stack instead.
  test("voice prompt rows stack on a narrow viewport and sit side by side on desktop", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await page.getByTestId("app").focus();

    // ⌘/ is the only way in on a phone until #147 gives the toolbar a help affordance.
    await page.keyboard.press("ControlOrMeta+/");
    await expect(page.getByTestId("help-overlay")).toBeVisible();
    const stacked = page.getByTestId("help-voice-row");
    expect(await stacked.count()).toBeGreaterThan(0);
    // Stacked rows span the table, so a row is no narrower than the section holding it.
    const row = await stacked.first().boundingBox();
    const section = await page
      .locator('[data-section="voice-google-tasks"]')
      .boundingBox();
    expect(row!.width).toBeGreaterThan(section!.width * 0.8);

    await page.setViewportSize(WIDE);
    await expect(page.getByTestId("help-voice-row")).toHaveCount(0);
  });
});
