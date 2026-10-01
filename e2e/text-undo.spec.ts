import { test, expect, type Page } from "@playwright/test";

// Text edits are recoverable from idle with `z` (#159). Native ⌘Z already covers
// fine-grained undo inside a live textarea; what the app stack adds is surviving the
// textarea's lifetime — leaving the editor, a remount, the inactivity timeout.

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const pane = (page: Page) => page.getByTestId("content-pane");
const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");

/** Enter the editor, run `fn`, then save and leave. */
async function edit(page: Page, fn: (ed: ReturnType<typeof editor>) => Promise<void>) {
  await page.keyboard.press("e");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  await fn(editor(page));
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
}

test.describe("Undoing text edits (#159)", () => {
  test("z restores text destroyed by Enter on a selection — the reported case", async ({ page }) => {
    await expect(pane(page)).toContainText("Welcome to notedude");

    await page.keyboard.press("e");
    const ed = editor(page);
    await ed.press("ControlOrMeta+a");
    await ed.press("Enter");                       // replaces the whole note with a newline
    await page.keyboard.press("Escape");

    await page.keyboard.press("z");
    await expect(pane(page)).toContainText("Welcome to notedude");
  });

  test("z rewinds a spell of typing", async ({ page }) => {
    await edit(page, async (ed) => {
      await ed.press("End");
      await ed.type(" extra words");
    });
    await expect(pane(page)).toContainText("extra words");

    await page.keyboard.press("z");
    await expect(pane(page)).not.toContainText("extra words");
    await expect(pane(page)).toContainText("Welcome to notedude");
  });

  test("Shift+Z puts the typing back", async ({ page }) => {
    await edit(page, async (ed) => {
      await ed.press("End");
      await ed.type(" extra words");
    });
    await page.keyboard.press("z");
    await expect(pane(page)).not.toContainText("extra words");

    await page.keyboard.press("Shift+Z");
    await expect(pane(page)).toContainText("extra words");
  });

  test("recovery survives leaving and re-entering the editor", async ({ page }) => {
    await edit(page, async (ed) => {
      await ed.press("ControlOrMeta+a");
      await ed.type("replaced entirely");
    });
    // Re-enter and leave again: the textarea native undo would be gone by now.
    await page.keyboard.press("e");
    await page.keyboard.press("Escape");

    await page.keyboard.press("z");
    await expect(pane(page)).toContainText("Welcome to notedude");
  });

  test("a pause splits typing into two undo steps", async ({ page }) => {
    await page.keyboard.press("e");
    const ed = editor(page);
    await ed.press("End");
    await ed.type(" first");
    await page.waitForTimeout(1200);               // longer than the burst gap
    await ed.type(" second");
    await page.keyboard.press("Escape");

    await page.keyboard.press("z");
    await expect(pane(page)).not.toContainText("second");
    await expect(pane(page)).toContainText("first");

    await page.keyboard.press("z");
    await expect(pane(page)).not.toContainText("first");
  });

  test("undo selects the note it changed", async ({ page }) => {
    await page.keyboard.press("j");                // move off the first note
    const title = await page.locator("[data-testid='note-item'][data-selected='true']")
      .getByTestId("note-item-title").textContent();
    await edit(page, async (ed) => {
      await ed.press("End");
      await ed.type(" touched");
    });
    await page.keyboard.press("k");                // select a different note
    await page.keyboard.press("z");
    await expect(page.locator("[data-testid='note-item'][data-selected='true']")
      .getByTestId("note-item-title")).toContainText(title!.trim());
  });

  test("z in the editor still types a literal z rather than undoing", async ({ page }) => {
    await page.keyboard.press("e");
    const ed = editor(page);
    await ed.press("End");
    await ed.type(" zzz");
    expect(await ed.inputValue()).toContain(" zzz");
  });

  test("text undo interleaves with the other actions in one stack", async ({ page }) => {
    await page.keyboard.press("j");                // the first note ships pinned; move off it
    await edit(page, async (ed) => {
      await ed.press("End");
      await ed.type(" edited");
    });
    await page.keyboard.press("p");                // pin, a separate undoable action
    const selected = page.locator("[data-testid='note-item'][data-selected='true']");
    await expect(selected).toHaveAttribute("data-pinned", "true");

    await page.keyboard.press("z");                // undoes the pin first
    await expect(selected).toHaveAttribute("data-pinned", "false");
    await expect(pane(page)).toContainText("edited");

    await page.keyboard.press("z");                // then the text edit
    await expect(pane(page)).not.toContainText("edited");
  });
});
