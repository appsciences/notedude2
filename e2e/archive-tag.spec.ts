import { test, expect, type Page } from "@playwright/test";

// Archive is the `#archived` tag in a note's content, by design (#75). These tests pin
// down the guarantees that design makes: whole-tag matching, idempotent archive, an
// explicit unarchive that does not depend on the undo stack, and a clean removal.

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const app = (page: Page) => page.getByTestId("app");
const items = (page: Page) => page.getByTestId("list-pane").getByTestId("note-item");
const selected = (page: Page) => page.locator("[data-testid='note-item'][data-selected='true']");
const archived = (page: Page) => page.locator("[data-testid='note-item'][data-archived='true']");
const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");

/** Create a note whose whole content is `text`, and return to idle with it selected. */
async function createNote(page: Page, text: string) {
  await page.keyboard.press("c");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await editor(page).fill(text);
  await page.keyboard.press("Escape");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
}

/** The selected note's raw content, read from the editor's value. */
async function rawContent(page: Page): Promise<string> {
  await page.keyboard.press("e");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  const value = await editor(page).inputValue();
  await page.keyboard.press("Escape");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
  return value;
}

/** Select the first archived note in the list. */
async function selectArchived(page: Page) {
  await archived(page).first().click();
  await app(page).focus();
  await expect(selected(page)).toHaveAttribute("data-archived", "true");
}

test.describe("Unarchive with Shift+Y (#75)", () => {
  test("Shift+Y on an archived note unarchives it, restoring the exact content", async ({ page }) => {
    const original = await rawContent(page);
    await page.keyboard.press("Shift+Y");
    await expect(archived(page)).toHaveCount(1);
    await selectArchived(page);

    await page.keyboard.press("Shift+Y");
    await expect(archived(page)).toHaveCount(0);
    await expect(page.getByTestId("archived-divider")).toHaveCount(0);
    // The unarchived note stays selected, now in the active section
    await expect(selected(page)).toHaveAttribute("data-archived", "false");
    expect(await rawContent(page)).toBe(original);
  });

  test("unarchive does not depend on the undo stack", async ({ page }) => {
    // Archived by typing, so no archive entry was ever pushed onto the undo stack
    await createNote(page, "Typed into the archive #archived");
    await expect(selected(page)).toHaveAttribute("data-archived", "true");

    await page.keyboard.press("Shift+Y");
    await expect(selected(page)).toHaveAttribute("data-archived", "false");
    expect(await rawContent(page)).toBe("Typed into the archive");
  });

  test("unarchive removes every #archived tag and leaves no stray whitespace", async ({ page }) => {
    await createNote(page, "Many tags #archived here #archived\n#archived next line\nkeep  two  spaces");
    await expect(selected(page)).toHaveAttribute("data-archived", "true");

    await page.keyboard.press("Shift+Y");
    await expect(selected(page)).toHaveAttribute("data-archived", "false");
    expect(await rawContent(page)).toBe("Many tags here\nnext line\nkeep  two  spaces");
  });

  test("archive → unarchive → archive leaves exactly one tag", async ({ page }) => {
    await page.keyboard.press("Shift+Y");
    await selectArchived(page);
    await page.keyboard.press("Shift+Y"); // unarchive, stays selected
    await expect(selected(page)).toHaveAttribute("data-archived", "false");
    const title = (await selected(page).getByTestId("note-item-title").textContent())!.trim();
    await page.keyboard.press("Shift+Y"); // archive again
    await expect(archived(page)).toHaveCount(1);
    await selectArchived(page);
    await expect(selected(page).getByTestId("note-item-title")).toContainText(title);
    const content = await rawContent(page);
    expect(content.match(/#archived/g) ?? []).toHaveLength(1);
  });

  test("z undoes an unarchive", async ({ page }) => {
    await page.keyboard.press("Shift+Y");
    await selectArchived(page);
    await page.keyboard.press("Shift+Y");
    await expect(archived(page)).toHaveCount(0);
    await page.keyboard.press("z");
    await expect(archived(page)).toHaveCount(1);
    await expect(selected(page)).toHaveAttribute("data-archived", "true");
  });

  test("help overlay documents unarchive", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toContainText(/unarchive/i);
  });
});

test.describe("#archived matches only as a whole tag (#75)", () => {
  for (const text of [
    "Release notes #archived-2024",
    "Odd tag #archivedstuff",
    "Link example.com/#archived",
    "Glued foo#archived",
    "Folder #archive",
  ]) {
    test(`not archived: ${JSON.stringify(text)}`, async ({ page }) => {
      await createNote(page, text);
      await expect(selected(page)).toHaveAttribute("data-archived", "false");
      await expect(archived(page)).toHaveCount(0);
    });
  }

  for (const text of ["Done #archived", "Done #archived.", "#archived first", "Two lines\n#archived"]) {
    test(`archived: ${JSON.stringify(text)}`, async ({ page }) => {
      await createNote(page, text);
      await expect(selected(page)).toHaveAttribute("data-archived", "true");
    });
  }

  test("Shift+Y on a note with a URL fragment archives it with a real tag", async ({ page }) => {
    await createNote(page, "Link example.com/#archived");
    await page.keyboard.press("Shift+Y");
    await expect(archived(page)).toHaveCount(1);
    await selectArchived(page);
    await page.keyboard.press("Shift+Y");
    // Unarchive removes the tag it added and leaves the URL alone
    expect(await rawContent(page)).toBe("Link example.com/#archived");
  });
});

test.describe("Archiving by typing the tag (#75)", () => {
  test("the note does not jump sections mid-edit, and a notice explains it afterwards", async ({ page }) => {
    const before = await items(page).count();
    const title = (await selected(page).getByTestId("note-item-title").textContent())!.trim();
    await page.keyboard.press("e");
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    await editor(page).press("End");
    await editor(page).press("ControlOrMeta+End");
    await editor(page).type(" #archived");

    // Still editing: list frozen, note still first and still in the active section
    await expect(items(page).first()).toHaveAttribute("data-selected", "true");
    await expect(items(page).first()).toHaveAttribute("data-archived", "false");
    await expect(archived(page)).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    // Moved below the divider, still listed, still selected
    await expect(items(page)).toHaveCount(before);
    await expect(selected(page)).toHaveAttribute("data-archived", "true");
    await expect(selected(page).getByTestId("note-item-title")).toContainText(title);
    await expect(page.getByTestId("mode-line")).toContainText("archived — Shift+Y to restore");

    // The notice is non-modal and clears on the next key
    await page.keyboard.press("j");
    await expect(page.getByTestId("mode-line")).not.toContainText("archived");
  });

  test("no notice when the note was already archived before editing", async ({ page }) => {
    await page.keyboard.press("Shift+Y");
    await selectArchived(page);
    await page.keyboard.press("e");
    await editor(page).press("ControlOrMeta+End");
    await editor(page).type(" more");
    await page.keyboard.press("Escape");
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("mode-line")).not.toContainText("archived");
  });
});
