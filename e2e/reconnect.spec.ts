import { test, expect, type Page } from "@playwright/test";

// Coming back online must not reload the page (#137). next-pwa's `reloadOnOnline` reloaded on
// the `online` event — exactly when someone who has been typing offline gets their connection
// back — and threw away the open editor and anything not yet handed to Firestore. It is off
// (next.config.ts); this pins that against the production build, where next-pwa is active.

const app = (page: Page) => page.getByTestId("app");
const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");

test("reconnecting while editing keeps the page, the editor and the text", async ({ page, context }) => {
  await page.goto("/test");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
  await page.waitForFunction(() => "__testRemoteSnapshot" in window);
  await app(page).focus();
  // Survives only as long as this document does: a reload clears it.
  await page.evaluate(() => { (window as unknown as { __sameDocument: boolean }).__sameDocument = true; });

  await page.keyboard.press("c");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await context.setOffline(true);
  await page.keyboard.type("typed while offline");
  await context.setOffline(false);

  // Give a reload-on-online handler time to fire before checking it did not.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await expect(editor(page)).toHaveValue("typed while offline");
});
