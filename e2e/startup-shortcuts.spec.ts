import { test, expect } from "@playwright/test";

/**
 * Shortcuts pressed while the app is still starting up (#26).
 *
 * The page is server-rendered, so it is visible — `data-state="idle"` included — before the
 * bundle has loaded and attached the window keydown handler. A key pressed in that gap used to
 * vanish, which looked like "shortcuts don't work until I click something". The bundle is held
 * back here to make that window wide enough to hit every time.
 */

const HOLD_MS = 700;

test.beforeEach(async ({ page }) => {
  await page.route("**/_next/static/**/*.js", async (route) => {
    await new Promise((r) => setTimeout(r, HOLD_MS));
    await route.continue();
  });
});

test.describe("keys pressed before the app is ready (#26)", () => {
  test("a shortcut pressed before the handler attaches still takes effect", async ({ page }) => {
    await page.goto("/test", { waitUntil: "commit" });
    const app = page.getByTestId("app");
    await expect(app).toBeVisible();
    // The server-rendered page is up, the handler is not.
    await expect(app).not.toHaveAttribute("data-ready", "true");

    await page.keyboard.press("e");

    await expect(app).toHaveAttribute("data-ready", "true");
    await expect(app).toHaveAttribute("data-state", "editing");
  });

  test("keys are replayed in the order they were pressed", async ({ page }) => {
    await page.goto("/test", { waitUntil: "commit" });
    const app = page.getByTestId("app");
    await expect(app).toBeVisible();

    await page.keyboard.press("d");
    await page.keyboard.press("m");

    await expect(app).toHaveAttribute("data-ready", "true");
    await expect(app).toHaveAttribute("data-theme", "light");
  });

  test("modified keys are not replayed", async ({ page }) => {
    await page.goto("/test", { waitUntil: "commit" });
    const app = page.getByTestId("app");
    await expect(app).toBeVisible();

    await page.keyboard.press("Control+e");

    await expect(app).toHaveAttribute("data-ready", "true");
    await expect(app).toHaveAttribute("data-state", "idle");
  });

  test("a key pressed once the app is ready is handled exactly once", async ({ page }) => {
    await page.goto("/test", { waitUntil: "commit" });
    const app = page.getByTestId("app");
    await expect(app).toHaveAttribute("data-ready", "true");

    await page.keyboard.press("d");
    await page.keyboard.press("m");

    await expect(app).toHaveAttribute("data-theme", "light");
  });
});
