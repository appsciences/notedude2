import { test, expect, Page } from "@playwright/test";

// #124: searching and browsing results used to scroll the whole document, taking the
// account header off screen and drifting the panes up and down. The app owns exactly the
// viewport; scrolling belongs to the list and content panes, never to the page.

// Enough notes to overflow the viewport several times over, one of them far taller than
// the screen on its own — the condition under which the layout used to give way.
function seedNotes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `seed-${i}`,
    content:
      i === 0
        ? `Long note #guide\n${Array.from({ length: 80 }, (_, l) => `line ${l}`).join("\n")}`
        : `Note ${i} #guide\nbody of note ${i}`,
    pinned: false,
    tagPinned: false,
    createdAt: 1000 + i,
    updatedAt: 1000 + i,
  }));
}

// Demo mode renders the same shell as the signed-in page — header row above <App> — but
// needs no emulator, and its notes come from localStorage so the list can be seeded.
async function openDemoWithNotes(page: Page, count = 15) {
  await page.goto("/");
  await page.evaluate(
    (notes) => localStorage.setItem("notedude_demo_notes", JSON.stringify(notes)),
    seedNotes(count)
  );
  await page.reload();
  await expect(page.getByTestId("login-screen")).toBeVisible();
  await page.keyboard.press("d");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
}

async function pageScroll(page: Page) {
  return page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
    scrollY: window.scrollY,
  }));
}

async function expectNoPageScroll(page: Page, label: string) {
  const s = await pageScroll(page);
  expect(s.scrollH, `document must not exceed the viewport (${label})`).toBeLessThanOrEqual(s.innerH);
  expect(s.scrollY, `page must not be scrolled (${label})`).toBe(0);
}

test.describe("Layout stability: the page never scrolls (#124)", () => {
  test("document fits the viewport with far more notes than fit on screen", async ({ page }) => {
    await openDemoWithNotes(page);
    await expectNoPageScroll(page, "idle, many notes");
  });

  test("document still fits while searching and browsing results", async ({ page }) => {
    await openDemoWithNotes(page);
    await expectNoPageScroll(page, "idle");

    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").pressSequentially("#guide");
    await expectNoPageScroll(page, "search, tag dropdown open");

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expectNoPageScroll(page, "filter applied");

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("j");
      await expectNoPageScroll(page, `browsing, after ${i + 1}x j`);
    }
  });

  test("selecting a note far longer than the viewport does not grow the page", async ({ page }) => {
    await openDemoWithNotes(page);
    // The 80-line note is the oldest, so it sorts last
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await items.last().click();
    await expect(page.getByTestId("content-pane")).toContainText("Long note");
    await expectNoPageScroll(page, "long note selected");
  });

  test("the list pane still scrolls internally when the list is long", async ({ page }) => {
    await openDemoWithNotes(page);
    const overflow = await page.getByTestId("list-pane").evaluate((el) => ({
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
    }));
    // Containment must not have been achieved by clipping the list away
    expect(overflow.scrollH).toBeGreaterThan(overflow.clientH);
  });
});

test.describe("Layout stability: the account header never moves (#124)", () => {
  test("header stays fully visible and fixed across search and browsing", async ({ page }) => {
    await openDemoWithNotes(page);
    const header = page.getByTestId("account-header");
    await expect(header).toBeVisible();

    const idleBox = await header.boundingBox();
    expect(idleBox).not.toBeNull();
    // Fully inside the viewport, not clipped at the top edge
    expect(idleBox!.y).toBeGreaterThanOrEqual(0);
    expect(idleBox!.height).toBeGreaterThan(0);

    const sameAsIdle = async (label: string) => {
      await expect(header).toBeVisible();
      const box = await header.boundingBox();
      expect(box, `header must still be laid out (${label})`).not.toBeNull();
      expect(box!.y, `header must not move (${label})`).toBeCloseTo(idleBox!.y, 1);
      expect(box!.height, `header must not resize (${label})`).toBeCloseTo(idleBox!.height, 1);
    };

    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").pressSequentially("#guide");
    await sameAsIdle("tag dropdown open");

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await sameAsIdle("filter applied");

    await page.keyboard.press("j");
    await sameAsIdle("after j");
    await page.keyboard.press("j");
    await sameAsIdle("after j j");

    // And back out of the filter
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await sameAsIdle("filter cleared");
  });

  test("header is still visible after the whole list is filtered away", async ({ page }) => {
    await openDemoWithNotes(page);
    const header = page.getByTestId("account-header");
    const before = await header.boundingBox();

    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").pressSequentially("#nothingmatchesthis");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(0);

    await expect(header).toBeVisible();
    const after = await header.boundingBox();
    expect(after!.y).toBeCloseTo(before!.y, 1);
    await expectNoPageScroll(page, "zero results");
  });
});

test.describe("Layout stability: the tag dropdown overlays rather than reflows (#124)", () => {
  test("opening the tag dropdown does not move the list pane", async ({ page }) => {
    await openDemoWithNotes(page);
    const listPane = page.getByTestId("list-pane");
    const before = await listPane.boundingBox();

    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").pressSequentially("#gu");
    await expect(page.getByTestId("tag-dropdown")).toBeVisible();

    const during = await listPane.boundingBox();
    expect(during!.y, "list pane must not be pushed down by the dropdown").toBeCloseTo(before!.y, 1);
  });

  test("closing the tag dropdown does not move the list pane back", async ({ page }) => {
    await openDemoWithNotes(page);
    await page.keyboard.press("/");
    const search = page.getByTestId("top-pane").getByRole("searchbox");
    await search.pressSequentially("#gu");
    await expect(page.getByTestId("tag-dropdown")).toBeVisible();

    const listPane = page.getByTestId("list-pane");
    const withDropdown = await listPane.boundingBox();

    await search.fill("");
    await expect(page.getByTestId("tag-dropdown")).not.toBeVisible();
    const withoutDropdown = await listPane.boundingBox();
    expect(withoutDropdown!.y).toBeCloseTo(withDropdown!.y, 1);
  });

  test("the dropdown is still readable on top of the content below it", async ({ page }) => {
    await openDemoWithNotes(page);
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").pressSequentially("#gu");
    const dropdown = page.getByTestId("tag-dropdown");
    await expect(dropdown).toBeVisible();
    // An overlay with a transparent background would render the list through it
    const bg = await dropdown.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    await expect(page.getByTestId("tag-item").first()).toBeVisible();
  });
});
