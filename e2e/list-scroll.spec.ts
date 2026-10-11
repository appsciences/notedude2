import { test, expect, type Page } from "@playwright/test";

// The list pane must always keep the selected note on screen — after j/k, after a search
// filter changes the list, and after the filter is cancelled (#193).

// Short enough that the seven seed notes overflow the list pane.
test.use({ viewport: { width: 1100, height: 320 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

/** Asserts the selected row lies fully inside the list pane's visible area. */
async function expectSelectedVisible(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const pane = document.querySelector('[data-testid="list-pane"]') as HTMLElement;
        const sel = pane.querySelector('[data-selected="true"]') as HTMLElement | null;
        if (!sel) return "no selection";
        const p = pane.getBoundingClientRect();
        const s = sel.getBoundingClientRect();
        return s.top >= p.top - 1 && s.bottom <= p.bottom + 1 ? "visible" : `off (${s.top}-${s.bottom} vs ${p.top}-${p.bottom})`;
      }),
    )
    .toBe("visible");
}

test("the list pane actually overflows in this viewport", async ({ page }) => {
  const overflows = await page
    .getByTestId("list-pane")
    .evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(overflows).toBe(true);
});

test("j scrolls the list down to keep the selection visible", async ({ page }) => {
  for (let i = 0; i < 8; i++) await page.keyboard.press("j");
  await expectSelectedVisible(page);
});

test("k scrolls the list back up to keep the selection visible", async ({ page }) => {
  for (let i = 0; i < 8; i++) await page.keyboard.press("j");
  for (let i = 0; i < 8; i++) await page.keyboard.press("k");
  await expectSelectedVisible(page);
});

test("cancelling a search scrolls the selection back into view", async ({ page }) => {
  // Filter down to one note near the end of the full list, then clear the filter.
  await page.keyboard.press("/");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
  await page.getByTestId("top-pane").getByRole("searchbox").fill("ideas");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape"); // double Esc clears the filter
  await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(7);
  await expectSelectedVisible(page);
});

test("selecting a note by click leaves it visible", async ({ page }) => {
  for (let i = 0; i < 8; i++) await page.keyboard.press("j");
  await page.getByTestId("list-pane").getByTestId("note-item").first().scrollIntoViewIfNeeded();
  await page.getByTestId("list-pane").getByTestId("note-item").first().click();
  await expectSelectedVisible(page);
});
