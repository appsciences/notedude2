import { test, expect } from "@playwright/test";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

test.describe("Mobile Browser Block", () => {
  test("mobile user-agent shows block message instead of login UI", async ({
    browser,
  }) => {
    const context = await browser.newContext({ userAgent: MOBILE_UA });
    const page = await context.newPage();
    await page.goto("/");

    await expect(page.getByTestId("mobile-block")).toBeVisible();
    await expect(page.getByTestId("mobile-block")).toContainText(
      "does not support mobile browsers"
    );

    // Login buttons should NOT be visible
    await expect(page.getByText("sign in with google")).not.toBeVisible();
    await expect(page.getByText("emo mode")).not.toBeVisible();

    await context.close();
  });

  test("desktop user-agent shows normal login page", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("mobile-block")).not.toBeVisible();
    await expect(page.getByText("sign in with google")).toBeVisible();
  });

  test("/test page is not affected by mobile block", async ({ browser }) => {
    const context = await browser.newContext({ userAgent: MOBILE_UA });
    const page = await context.newPage();
    await page.goto("/test");

    // The app should load normally
    await expect(page.getByTestId("app")).toBeVisible();
    await expect(page.getByTestId("mobile-block")).not.toBeVisible();

    await context.close();
  });
});
