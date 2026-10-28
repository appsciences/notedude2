import { test, expect, type Page } from "@playwright/test";

// The gaps in text undo left after #159 (#212): every way of changing a note's text has to be
// undoable — rich paste and formatting shortcuts as well as typing — and recovery must not
// depend on the textarea that made the change still being mounted, or on the page not having
// been reloaded since.

const NOTE = "ALPHA bravo CHARLIE\nTAIL sentinel";

const app = (page: Page) => page.getByTestId("app");
const pane = (page: Page) => page.getByTestId("content-pane");
const editor = (page: Page) => pane(page).getByRole("textbox");

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function ready(page: Page) {
  await expect(app(page)).toHaveAttribute("data-state", "idle");
  await page.waitForFunction(() => "__testRemoteSnapshot" in window);
  await app(page).focus();
}

/** Create a note holding NOTE and leave the editor, so it is saved and its textarea gone. */
async function savedNote(page: Page) {
  await page.keyboard.press("c");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await editor(page).fill(NOTE);
  await page.keyboard.press("Escape");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
}

async function openEditor(page: Page) {
  await page.keyboard.press("e");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
}

async function select(page: Page, word: string) {
  await editor(page).evaluate((el: HTMLTextAreaElement, w) => {
    const at = el.value.indexOf(w);
    el.setSelectionRange(at, at + w.length);
  }, word);
}

async function richClipboard(page: Page, text: string, html: string) {
  await page.evaluate(async ([t, h]) => {
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": new Blob([t], { type: "text/plain" }),
      "text/html": new Blob([h], { type: "text/html" }),
    })]);
  }, [text, html]);
}

const undoKey = (page: Page) => page.keyboard.press("ControlOrMeta+z");

test.describe("in the /test harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test");
    await ready(page);
    await savedNote(page);
  });

  test("⌘Z right after a rich paste puts the selection back", async ({ page }) => {
    await openEditor(page);
    await richClipboard(page, "RICH replacement", "<b>RICH replacement</b>");
    await select(page, "bravo");
    await page.keyboard.press("ControlOrMeta+v");
    await expect(editor(page)).toHaveValue(NOTE.replace("bravo", "RICH replacement"));
    await undoKey(page);
    await expect(editor(page)).toHaveValue(NOTE);
  });

  test("⌘Z right after a heading shortcut restores the raw line", async ({ page }) => {
    await openEditor(page);
    await select(page, "TAIL");
    await page.keyboard.press("ControlOrMeta+Shift+h");
    await expect(editor(page)).toHaveValue(NOTE.replace("TAIL", "## TAIL"));
    await undoKey(page);
    await expect(editor(page)).toHaveValue(NOTE);
  });

  test("idle z reverses a heading shortcut, and the next z the edit before it", async ({ page }) => {
    // Reopen: the note's creation is an older history entry than the heading.
    await openEditor(page);
    await select(page, "TAIL");
    await page.keyboard.press("ControlOrMeta+Shift+h");
    await page.keyboard.press("Escape");
    await expect(app(page)).toHaveAttribute("data-state", "idle");

    await page.keyboard.press("z");
    await openEditor(page);
    await expect(editor(page)).toHaveValue(NOTE);
  });

  test("a list shortcut is undoable on its own, not merged into the typing before it", async ({ page }) => {
    await openEditor(page);
    await editor(page).press("ControlOrMeta+End");
    await page.keyboard.type(" typed");
    await page.keyboard.press("ControlOrMeta+Shift+8");
    await expect(editor(page)).toHaveValue("ALPHA bravo CHARLIE\n- TAIL sentinel typed");
    await undoKey(page);
    await expect(editor(page)).toHaveValue(NOTE + " typed");
  });

  test("⌘Z in a reopened editor still undoes the edit made before it was closed", async ({ page }) => {
    await openEditor(page);
    await select(page, "bravo");
    await page.keyboard.type("REPLACED");
    await page.keyboard.press("Escape");
    await expect(app(page)).toHaveAttribute("data-state", "idle");

    await openEditor(page);
    await undoKey(page);
    await expect(editor(page)).toHaveValue(NOTE);
    // ...and redo puts it back.
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(editor(page)).toHaveValue(NOTE.replace("bravo", "REPLACED"));
  });

  test("⌘Z in a reopened editor leaves other notes' history alone", async ({ page }) => {
    // The newest history entry belongs to a different note: ⌘Z here must not apply it.
    await page.keyboard.press("c");
    await editor(page).fill("Another note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p");                 // pin it: newest entry is a pin

    await page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "ALPHA" }).click();
    await app(page).focus();
    await openEditor(page);
    await undoKey(page);
    await expect(editor(page)).toHaveValue(NOTE);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "Another note" }))
      .toHaveAttribute("data-pinned", "true");
  });
});

test.describe("in demo mode", () => {
  test("idle z still restores a replaced note after a reload", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await expect(page.getByTestId("login-screen")).toBeVisible();
    await page.keyboard.press("d");
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await app(page).focus();
    await savedNote(page);

    await openEditor(page);
    await editor(page).press("ControlOrMeta+a");
    await page.keyboard.type("[PASTED]");
    await page.keyboard.press("Escape");
    await expect(pane(page)).toContainText("[PASTED]");

    await page.reload();
    await expect(page.getByTestId("login-screen")).toBeVisible();
    await page.keyboard.press("d");
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await app(page).focus();
    await page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "[PASTED]" }).click();
    await app(page).focus();

    await page.keyboard.press("z");
    await expect(pane(page)).toContainText("ALPHA bravo CHARLIE");
  });
});
