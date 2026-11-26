import { test, expect } from "@playwright/test";

// #171: staging and development builds carry an unmistakable label; production carries none.
// The suite builds with no NEXT_PUBLIC_APP_ENV, which is production, so it pins the side that
// ships. The labelled side is covered by src/lib/firebaseConfig.test.ts (nonProductionLabel).
test("a production build shows no environment badge and an unprefixed title", async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toBeVisible();
  await expect(page.getByTestId("env-badge")).toHaveCount(0);
  await expect(page).toHaveTitle("notedude");
});
