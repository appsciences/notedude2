import { test, expect } from "@playwright/test";

const DARK_BG = "rgb(26, 26, 26)"; // #1a1a1a
const LIGHT_BG = "rgb(255, 255, 255)"; // #ffffff

test.describe("Login screen theme", () => {
  test("login screen renders dark by default", async ({ page }) => {
    await page.goto("/");
    const login = page.getByTestId("login-screen");
    await expect(login).toBeVisible();
    const bg = await login.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(DARK_BG);
  });

  test("login screen respects an explicit light preference", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    await page.reload();
    const login = page.getByTestId("login-screen");
    await expect(login).toBeVisible();
    const bg = await login.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(LIGHT_BG);
  });
});
