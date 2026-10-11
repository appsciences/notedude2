import { test, expect, type Page } from "@playwright/test";

/**
 * ⌘C copies the selected note (#231, #211) and the Caps Lock indicator (#232).
 *
 * The clipboard is replaced with a recorder rather than read back: headless clipboard
 * permissions vary by browser build, and what matters here is what the app asked to write —
 * and, with a selection, that it asked for nothing and left the copy to the browser.
 */

declare global {
  interface Window {
    __copied: string[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { window.__copied.push(text); } },
    });
  });
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const app = (page: Page) => page.getByTestId("app");
const modeLine = (page: Page) => page.getByTestId("mode-line");
const rows = (page: Page) => page.getByTestId("list-pane").getByTestId("note-item-title");
const copied = (page: Page) => page.evaluate(() => window.__copied);

/** Composes a note with `content` and commits it, leaving it selected in idle. */
async function composeNote(page: Page, content: string) {
  await page.keyboard.press("c");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await page.getByTestId("content-pane").getByRole("textbox").fill(content);
  await page.keyboard.press("Escape");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
}

test.describe("copying a note", () => {
  const NOTE = "# Groceries\n* milk\n**eggs** #tasks-today";

  for (const combo of ["Meta+c", "Control+c"]) {
    test(`${combo} copies the whole note, exactly as stored`, async ({ page }) => {
      await composeNote(page, NOTE);
      const count = await rows(page).count();

      await page.keyboard.press(combo);

      await expect.poll(() => copied(page)).toEqual([NOTE]);
      await expect(modeLine(page)).toContainText("copied note");
      // Nothing else happened: no new note, same mode (#211).
      await expect(app(page)).toHaveAttribute("data-state", "idle");
      await expect(rows(page)).toHaveCount(count);
    });
  }

  test("with text selected, the browser's own copy runs and the app stays out of it", async ({ page }) => {
    await composeNote(page, NOTE);
    const count = await rows(page).count();
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("[data-testid='content-pane']")!);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
    });

    await page.keyboard.press("Meta+c");

    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await expect(rows(page)).toHaveCount(count);
    await expect(modeLine(page)).not.toContainText("copied note");
    expect(await copied(page)).toEqual([]);
  });

  test("a failed clipboard write says so", async ({ page }) => {
    await composeNote(page, NOTE);
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => { throw new Error("denied"); } },
      });
    });
    await page.keyboard.press("Meta+c");
    await expect(modeLine(page)).toContainText("couldn't copy");
  });

  test("bare-key shortcuts do not fire under ⌘ or Ctrl", async ({ page }) => {
    const count = await rows(page).count();
    for (const combo of ["Meta+p", "Control+p", "Meta+e", "Control+e"]) {
      await page.keyboard.press(combo);
    }
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await expect(rows(page)).toHaveCount(count);
  });

  test("plain c still composes", async ({ page }) => {
    await page.keyboard.press("c");
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    expect(await copied(page)).toEqual([]);
  });
});

test.describe("caps lock indicator", () => {
  const indicator = (page: Page) => page.getByTestId("caps-lock");

  /** Playwright does not model the Caps Lock state, so the event carries it explicitly. */
  const setCapsLock = (page: Page, on: boolean) =>
    page.evaluate((on) => {
      window.dispatchEvent(
        new KeyboardEvent(on ? "keydown" : "keyup", {
          key: "CapsLock",
          code: "CapsLock",
          modifierCapsLock: on,
          bubbles: true,
        })
      );
    }, on);

  test("is absent until Caps Lock is on, and goes away when it is off", async ({ page }) => {
    await expect(indicator(page)).toHaveCount(0);
    await setCapsLock(page, true);
    await expect(indicator(page)).toHaveText("CAPS LOCK");
    await setCapsLock(page, false);
    await expect(indicator(page)).toHaveCount(0);
  });

  test("shows alongside the mode text while editing", async ({ page }) => {
    await page.keyboard.press("e");
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    await setCapsLock(page, true);
    await expect(modeLine(page)).toContainText("-- INSERT --");
    await expect(indicator(page)).toBeVisible();
  });

  test("does not change the mode line's height", async ({ page }) => {
    const before = await modeLine(page).boundingBox();
    await setCapsLock(page, true);
    await expect(indicator(page)).toBeVisible();
    const after = await modeLine(page).boundingBox();
    expect(after!.height).toBe(before!.height);
    expect(after!.y).toBe(before!.y);
  });
});
