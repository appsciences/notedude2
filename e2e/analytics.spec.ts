import { test, expect } from "@playwright/test";

// Google Analytics is opt-in by NEXT_PUBLIC_GA_MEASUREMENT_ID. The suite runs without one,
// so no page may load gtag.js or talk to Google's collection endpoints (#207). What the
// bootstrap says when an ID *is* set is unit-tested in src/lib/analytics.test.ts.
test.describe("Analytics is off without a measurement ID", () => {
  for (const path of ["/", "/share"]) {
    test(`${path} makes no request to Google Analytics`, async ({ page }) => {
      const gaRequests: string[] = [];
      page.on("request", (req) => {
        const host = new URL(req.url()).hostname;
        if (/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/.test(host)) {
          gaRequests.push(req.url());
        }
      });

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      expect(gaRequests).toEqual([]);
      expect(await page.evaluate(() => "dataLayer" in window)).toBe(false);
    });
  }
});
