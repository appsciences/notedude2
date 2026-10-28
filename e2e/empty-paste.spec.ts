import { test, expect, type Page } from "@playwright/test";

// A paste with no usable text must not erase the selection (#213). The browser's own paste
// replaces the selection with whatever text the clipboard has — for an image-only or empty
// clipboard that is nothing, so Select All + ⌘V emptied the note and Esc then discarded it.
//
// These go through the real clipboard and a real Ctrl+V: a synthetic ClipboardEvent never
// runs the browser's default action, so it cannot show the deletion.

const NOTE = "ALPHA bravo CHARLIE\nsecond line";

const app = (page: Page) => page.getByTestId("app");
const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
  await page.waitForFunction(() => "__testRemoteSnapshot" in window);
  await app(page).focus();
  await page.keyboard.press("c");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await editor(page).fill(NOTE);
});

/** A 1×1 transparent PNG, with no text flavour at all. */
async function clipboardImageOnly(page: Page) {
  await page.evaluate(async () => {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
  });
}

async function clipboardEmptyText(page: Page) {
  await page.evaluate(() => navigator.clipboard.writeText(""));
}

/** What copying an image out of a web page gives: HTML that is only an <img>, no plain text. */
async function clipboardImageHtml(page: Page) {
  await page.evaluate(async () => {
    const html = new Blob(['<img src="https://example.com/cat.png">'], { type: "text/html" });
    await navigator.clipboard.write([new ClipboardItem({ "text/html": html })]);
  });
}

async function clipboardText(page: Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
}

async function select(page: Page, from: number, to: number) {
  await editor(page).evaluate((el: HTMLTextAreaElement, [a, b]) => el.setSelectionRange(a, b), [from, to]);
}

const paste = (page: Page) => page.keyboard.press("ControlOrMeta+v");
const BRAVO = [NOTE.indexOf("bravo"), NOTE.indexOf("bravo") + 5] as const;

for (const [name, fill] of [
  ["image-only", clipboardImageOnly],
  ["empty-text", clipboardEmptyText],
  ["image-HTML", clipboardImageHtml],
] as const) {
  test.describe(`${name} clipboard`, () => {
    test("pasting over a selected word leaves it in place", async ({ page }) => {
      await fill(page);
      await select(page, ...BRAVO);
      await paste(page);
      await expect(editor(page)).toHaveValue(NOTE);
      // The selection survives too, so a retry with real text still replaces it.
      expect(await editor(page).evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([...BRAVO]);
    });

    test("pasting over a multi-line selection leaves it in place", async ({ page }) => {
      await fill(page);
      await select(page, 6, NOTE.length - 4);
      await paste(page);
      await expect(editor(page)).toHaveValue(NOTE);
    });

    test("pasting over the whole note does not empty it, and it survives Esc", async ({ page }) => {
      await fill(page);
      await page.keyboard.press("ControlOrMeta+a");
      await paste(page);
      await expect(editor(page)).toHaveValue(NOTE);
      await page.keyboard.press("Escape");
      await expect(app(page)).toHaveAttribute("data-state", "idle");
      await expect(page.getByTestId("content-pane")).toContainText("ALPHA bravo CHARLIE");
      await page.keyboard.press("e");
      await expect(editor(page)).toHaveValue(NOTE);
    });

    test("says there was no text to paste", async ({ page }) => {
      await fill(page);
      await select(page, ...BRAVO);
      await paste(page);
      await expect(page.getByTestId("mode-line")).toContainText("nothing to paste");
    });
  });
}

test.describe("text clipboards still paste", () => {
  test("plain text replaces the selection", async ({ page }) => {
    await clipboardText(page, "DELTA");
    await select(page, ...BRAVO);
    await paste(page);
    await expect(editor(page)).toHaveValue(NOTE.replace("bravo", "DELTA"));
  });

  test("whitespace-only text is a real paste, not an empty one", async ({ page }) => {
    await clipboardText(page, " \n ");
    await select(page, ...BRAVO);
    await paste(page);
    await expect(editor(page)).toHaveValue(NOTE.replace("bravo", " \n "));
  });

  test("Cut still removes the selection on purpose", async ({ page }) => {
    await select(page, ...BRAVO);
    await page.keyboard.press("ControlOrMeta+x");
    await expect(editor(page)).toHaveValue(NOTE.replace("bravo", ""));
  });
});
