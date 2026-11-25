import { test, expect, type Page } from "@playwright/test";

// Attachments (#259): paste a file or press Shift+Cmd/Ctrl+A in the editor. The /test harness
// has no account, so it runs against the in-memory store — the same code path as Firebase.

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");
const pane = (page: Page) => page.getByTestId("content-pane");

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

async function startNote(page: Page, text = "Holder") {
  // The first keypress can land before hydration has bound the key handler, so retry it.
  await expect(async () => {
    if ((await page.getByTestId("app").getAttribute("data-state")) !== "editing") {
      await page.keyboard.press("c");
    }
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing", { timeout: 1000 });
  }).toPass();
  await editor(page).fill(text);
}

/** Pastes a clipboard carrying `files` (and optionally text) into the editor. */
async function pasteFiles(
  page: Page,
  files: { name: string; type: string; base64: string }[],
  text?: string,
) {
  await editor(page).evaluate((ta, { files, text }) => {
    const dt = new DataTransfer();
    for (const f of files) {
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], f.name, { type: f.type }));
    }
    if (text) dt.setData("text/plain", text);
    ta.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { files, text });
}

const png = (name: string) => ({ name, type: "image/png", base64: PNG.toString("base64") });
const pdf = (name: string) => ({ name, type: "application/pdf", base64: Buffer.from("%PDF-1.4").toString("base64") });

test.describe("Attaching", () => {
  test("pasting an image inserts an image reference at the caret", async ({ page }) => {
    await startNote(page, "before after");
    await editor(page).evaluate((ta: HTMLTextAreaElement) => ta.setSelectionRange(7, 7));
    await pasteFiles(page, [png("shot.png")]);
    await expect(editor(page)).toHaveValue(/^before !\[shot\.png\]\(attach:[A-Za-z0-9]{16}\)after$/);
  });

  test("pasting a non-image inserts a plain reference", async ({ page }) => {
    await startNote(page);
    await pasteFiles(page, [pdf("Q3 report.pdf")]);
    await expect(editor(page)).toHaveValue(/\[Q3 report\.pdf\]\(attach:[A-Za-z0-9]{16}\)/);
    await expect(editor(page)).not.toHaveValue(/!\[Q3/);
  });

  test("several pasted files each get a reference", async ({ page }) => {
    await startNote(page, "");
    await pasteFiles(page, [png("a.png"), pdf("b.pdf")]);
    await expect(editor(page)).toHaveValue(/a\.png[\s\S]*b\.pdf/);
  });

  test("a clipboard with text pastes as text, never as an attachment", async ({ page }) => {
    await startNote(page, "");
    await pasteFiles(page, [png("cell.png")], "col1\tcol2");
    await expect(editor(page)).not.toHaveValue(/attach:/);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("Shift+Ctrl+A opens the file picker and references the chosen file", async ({ page }) => {
    await startNote(page, "");
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Control+Shift+A");
    const fc = await chooser;
    expect(fc.isMultiple()).toBe(true);
    await fc.setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(editor(page)).toHaveValue(/\[notes\.txt\]\(attach:[A-Za-z0-9]{16}\)/);
  });

  test("Shift+Cmd+A does the same", async ({ page }) => {
    await startNote(page, "");
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Meta+Shift+A");
    await chooser;
  });

  test("the shortcut does nothing outside editing", async ({ page }) => {
    let opened = false;
    page.on("filechooser", () => { opened = true; });
    await page.keyboard.press("Control+Shift+A");
    await page.waitForTimeout(200);
    expect(opened).toBe(false);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("a file over 20 MB is refused and nothing is inserted", async ({ page }) => {
    test.setTimeout(45_000); // hands a 20 MB buffer to the browser
    await startNote(page, "keep");
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Control+Shift+A");
    await (await chooser).setFiles({
      name: "huge.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
    });
    await expect(page.getByTestId("mode-line")).toContainText(/too large|20 MB/i);
    await expect(editor(page)).toHaveValue("keep");
  });
});

test.describe("Rendering and opening", () => {
  async function withAttachments(page: Page) {
    await startNote(page, "Report");
    await editor(page).press("End");
    await pasteFiles(page, [png("shot.png")]);
    await expect(editor(page)).toHaveValue(/attach:/);
    await pasteFiles(page, [pdf("plan.pdf")]);
    await expect(editor(page)).toHaveValue(/plan\.pdf/);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  }

  test("an image renders inline and a file renders as a chip", async ({ page }) => {
    await withAttachments(page);
    await expect(pane(page).locator("img")).toHaveCount(1);
    await expect(pane(page).getByTestId("attachment-chip")).toContainText("plan.pdf");
    // The reference text itself is not shown in the read view.
    await expect(pane(page)).not.toContainText("attach:");
  });

  test("clicking an attachment opens it in a new tab", async ({ page }) => {
    await withAttachments(page);
    const popup = page.waitForEvent("popup");
    await pane(page).getByTestId("attachment-chip").click();
    await popup;
  });

  test("clicking a rendered image does not enter editing", async ({ page }) => {
    await withAttachments(page);
    const popup = page.waitForEvent("popup");
    await pane(page).locator("img").click();
    await popup;
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("o with one attachment opens it directly", async ({ page }) => {
    await startNote(page, "One");
    await pasteFiles(page, [pdf("only.pdf")]);
    await expect(editor(page)).toHaveValue(/only\.pdf/);
    await page.keyboard.press("Escape");
    const popup = page.waitForEvent("popup");
    await page.keyboard.press("o");
    await popup;
    await expect(page.getByTestId("attachment-overlay")).toHaveCount(0);
  });

  test("o with several attachments lists them; j and Enter open the second", async ({ page }) => {
    await withAttachments(page);
    await page.keyboard.press("o");
    const items = page.getByTestId("attachment-item");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("j");
    await expect(items.nth(1)).toHaveAttribute("data-selected", "true");
    const popup = page.waitForEvent("popup");
    await page.keyboard.press("Enter");
    await popup;
    await expect(page.getByTestId("attachment-overlay")).toHaveCount(0);
  });

  test("Esc closes the attachment list", async ({ page }) => {
    await withAttachments(page);
    await page.keyboard.press("o");
    await expect(page.getByTestId("attachment-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("attachment-overlay")).toHaveCount(0);
  });

  test("o on a note with no attachments says so", async ({ page }) => {
    await page.keyboard.press("o");
    await expect(page.getByTestId("mode-line")).toContainText(/no attachments/i);
  });
});

test.describe("Removing", () => {
  test("deleting a reference warns that the file goes in 30 days, and flags it", async ({ page }) => {
    await startNote(page, "");
    await pasteFiles(page, [pdf("gone.pdf")]);
    await expect(editor(page)).toHaveValue(/gone\.pdf/);
    await editor(page).fill("nothing here");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mode-line")).toContainText(/30 days/);
    const removed = await page.evaluate(
      () => (window as unknown as { __testAttachments: { removed: Set<string> } }).__testAttachments.removed.size,
    );
    expect(removed).toBe(1);
  });

  test("keeping the reference shows no warning", async ({ page }) => {
    await startNote(page, "");
    await pasteFiles(page, [pdf("stay.pdf")]);
    await expect(editor(page)).toHaveValue(/stay\.pdf/);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("mode-line")).not.toContainText(/30 days/);
  });
});
