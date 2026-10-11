import { test, expect } from "@playwright/test";

// Sentry is opt-in by NEXT_PUBLIC_SENTRY_DSN. The suite runs without one, so the app must
// neither initialise Sentry nor talk to it (#206). The scrubbing rules themselves are
// unit-tested in src/lib/monitoring.test.ts.
test.describe("Monitoring is off without a DSN", () => {
  test("loading the app and throwing an uncaught error sends nothing to Sentry", async ({ page }) => {
    const sentryRequests: string[] = [];
    page.on("request", (req) => {
      if (/sentry\.io|ingest\./.test(new URL(req.url()).hostname)) sentryRequests.push(req.url());
    });

    await page.goto("/");
    await expect(page.getByTestId("login-screen")).toBeVisible();

    // An uncaught error is exactly what Sentry would capture if it were on.
    await page.evaluate(() => setTimeout(() => { throw new Error("monitoring-e2e"); }, 0));
    await page.waitForTimeout(500);

    expect(sentryRequests).toEqual([]);
  });
});
