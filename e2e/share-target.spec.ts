import { test, expect } from "@playwright/test";

// Web Share Target: Android hands shared text to /share as query params. That route
// parks the payload in localStorage and bounces to the app, which turns it into a
// new note on mount. See #110.

const PENDING_KEY = "notedude:pendingShare";

test.describe("Web Share Target", () => {
  // Read localStorage only after the bounce has landed: evaluating mid-redirect tears
  // down the execution context.
  const leftShareRoute = (page: import("@playwright/test").Page) =>
    page.waitForURL((url) => new URL(url).pathname !== "/share");

  test("/share parks the shared text and leaves the route", async ({ page }) => {
    await page.goto("/share?title=Groceries&text=milk%20and%20eggs");
    await leftShareRoute(page);

    expect(await page.evaluate((k) => localStorage.getItem(k), PENDING_KEY))
      .toBe("Groceries\nmilk and eggs");
  });

  test("/share appends the shared url when one is present", async ({ page }) => {
    await page.goto("/share?text=worth%20reading&url=https%3A%2F%2Fexample.com");
    await leftShareRoute(page);

    expect(await page.evaluate((k) => localStorage.getItem(k), PENDING_KEY))
      .toBe("worth reading\nhttps://example.com");
  });

  test("a parked share becomes a new note in editing state", async ({ page }) => {
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const before = await page.getByTestId("note-item").count();

    await page.evaluate(
      ([k, v]) => localStorage.setItem(k, v),
      [PENDING_KEY, "shared from android"]
    );
    await page.reload();

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(page.getByRole("textbox")).toHaveValue("shared from android");
    expect(await page.getByTestId("note-item").count()).toBe(before + 1);

    // Consumed exactly once — a reload must not resurrect it.
    expect(await page.evaluate((k) => localStorage.getItem(k), PENDING_KEY)).toBeNull();
  });
});
