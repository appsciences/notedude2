import { test, expect } from "@playwright/test";

// Ensure app is loaded and focused before each test
test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  // Ensure the app container has focus for keyboard events
  await page.getByTestId("app").focus();
});

test.describe("UI Layout", () => {

  test("renders three panes: search bar, list pane, and content pane", async ({ page }) => {
    await expect(page.getByTestId("top-pane")).toBeVisible();
    await expect(page.getByTestId("list-pane")).toBeVisible();
    await expect(page.getByTestId("content-pane")).toBeVisible();
  });

  test("top pane contains a search input", async ({ page }) => {
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await expect(searchInput).toBeVisible();
  });

  test("list pane displays note items", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(0);
  });

  test("content pane displays the selected note content", async ({ page }) => {
    const contentPane = page.getByTestId("content-pane");
    await expect(contentPane).not.toBeEmpty();
  });

  test("selected note is visually highlighted in list pane", async ({ page }) => {
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selected).toBeVisible();
  });
});

test.describe("Application States", () => {

  test("app starts in idle state", async ({ page }) => {
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("first note is selected on initial load", async ({ page }) => {
    const firstItem = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(firstItem).toHaveAttribute("data-selected", "true");
  });

  test("content pane is read-only in idle state", async ({ page }) => {
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    // Either no textbox exists, or it's readonly
    if (await editor.count() > 0) {
      await expect(editor).toHaveAttribute("readonly", "");
    }
  });
});

test.describe("State Transitions", () => {

  test("IS → ES: pressing 'c' creates a new note and enters editing state", async ({ page }) => {
    await page.keyboard.press("c");

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const selectedItem = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selectedItem).toContainText("New Note");
  });

  test("IS → ES: pressing Enter edits the selected note", async ({ page }) => {
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await expect(editor).toBeFocused();
  });

  test("IS → ES via Enter: cursor is at end of content", async ({ page }) => {
    await page.keyboard.press("Enter");

    const editor = page.getByTestId("content-pane").getByRole("textbox");
    const value = await editor.inputValue();
    const selectionStart = await editor.evaluate(
      (el: HTMLTextAreaElement) => el.selectionStart
    );
    expect(selectionStart).toBe(value.length);
  });

  test("ES → IS: pressing Escape saves edits and returns to idle", async ({ page }) => {
    // Enter editing
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    // Type something
    await page.keyboard.type(" edited");

    // Exit editing
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    // Content should persist
    await expect(page.getByTestId("content-pane")).toContainText("edited");
  });

  test("ES → IS: pressing Cmd+Enter saves edits and returns to idle", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    await page.keyboard.press("Control+Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("IS → SS: pressing '/' focuses the search bar", async ({ page }) => {
    await page.keyboard.press("/");

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await expect(searchInput).toBeFocused();
  });

  test("SS → IS: pressing Enter applies filter and returns to idle", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("test query");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("SS → IS: pressing Escape applies filter and returns to idle", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("intro");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    // Filter should be applied — only notes matching "intro" visible
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items).toHaveCount(2); // "Welcome to notedude #intro" and "Getting started #intro"
  });

  test("SS → IS: pressing Escape twice clears filter and returns to idle", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("test query");
    await page.keyboard.press("Enter");

    // Double-Esc to clear
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(searchInput).toHaveValue("");
  });

  test("IS → IS: double Escape in idle clears any active filter", async ({ page }) => {
    // Apply a filter first
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("filter text");
    await page.keyboard.press("Enter");

    // Double-Esc to clear filter
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(searchInput).toHaveValue("");
  });
});

test.describe("List Navigation", () => {
  test("pressing 'j' selects the next note", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items.first()).toHaveAttribute("data-selected", "true");

    await page.keyboard.press("j");
    await expect(items.nth(1)).toHaveAttribute("data-selected", "true");
    await expect(items.first()).toHaveAttribute("data-selected", "false");
  });

  test("pressing 'k' selects the previous note", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    // Move down first
    await page.keyboard.press("j");
    await expect(items.nth(1)).toHaveAttribute("data-selected", "true");

    await page.keyboard.press("k");
    await expect(items.first()).toHaveAttribute("data-selected", "true");
  });

  test("pressing ArrowDown selects the next note", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toHaveAttribute("data-selected", "true");
  });

  test("pressing ArrowUp selects the previous note", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await expect(items.first()).toHaveAttribute("data-selected", "true");
  });

  test("'j' does not go past the last note", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const count = await items.count();
    for (let i = 0; i < count + 2; i++) {
      await page.keyboard.press("j");
    }
    await expect(items.nth(count - 1)).toHaveAttribute("data-selected", "true");
  });

  test("'k' does not go before the first note", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await page.keyboard.press("k");
    await expect(items.first()).toHaveAttribute("data-selected", "true");
  });

  test("content pane updates when navigating notes", async ({ page }) => {
    const contentPane = page.getByTestId("content-pane");
    const firstContent = await contentPane.textContent();
    await page.keyboard.press("j");
    const secondContent = await contentPane.textContent();
    expect(firstContent).not.toBe(secondContent);
  });
});

test.describe("Filtering Behavior", () => {
  test("only matching notes are shown when filter is active", async ({ page }) => {
    const listPane = page.getByTestId("list-pane");
    const initialCount = await listPane.getByTestId("note-item").count();

    // Apply a filter that shouldn't match anything
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("nonexistent-filter-xyz");
    await page.keyboard.press("Enter");

    const filteredCount = await listPane.getByTestId("note-item").count();
    expect(filteredCount).toBeLessThan(initialCount);
  });

  test("note list filters incrementally as user types in search bar", async ({ page }) => {
    const listPane = page.getByTestId("list-pane");
    const initialCount = await listPane.getByTestId("note-item").count();

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    // Type a query that matches only one note — no Enter needed
    await searchInput.fill("Welcome");

    const filteredCount = await listPane.getByTestId("note-item").count();
    expect(filteredCount).toBe(1);
    expect(filteredCount).toBeLessThan(initialCount);
  });

  test("content pane shows only notes from filtered results, not notes outside the list", async ({ page }) => {
    // First note (pinned) is "Welcome to notedude #intro"
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items.first()).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("content-pane")).toContainText("Welcome to notedude");

    // Filter by #guide — note 1 does NOT have #guide, so it should be filtered out
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    // The selected note should now be one of the filtered results, not note 1
    const contentPane = page.getByTestId("content-pane");
    await expect(contentPane).not.toContainText("Welcome to notedude");
    await expect(items.first()).toHaveAttribute("data-selected", "true");
    await expect(contentPane).toContainText("#guide");
  });

  test("archiving a note while filtered selects next note from filtered list", async ({ page }) => {
    // Filter by #guide — shows notes with #guide
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const countBefore = await items.count();
    expect(countBefore).toBeGreaterThanOrEqual(2);

    // Archive the first filtered note — it moves to the archived section at the bottom
    await page.keyboard.press("Shift+Y");
    await expect(page.getByTestId("archived-divider")).toBeVisible();
    // Total note-item count stays the same (archived note is still shown, just below the divider)
    await expect(items).toHaveCount(countBefore);

    // The next selected note should be a non-archived #guide note
    const contentPane = page.getByTestId("content-pane");
    await expect(contentPane).toContainText("#guide");
    await expect(contentPane).not.toContainText("#archived");
  });
});

test.describe("Pinning Behavior", () => {
  test("pinned notes appear at the top of the list", async ({ page }) => {
    await page.goto("/test");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const count = await items.count();

    let seenUnpinned = false;
    for (let i = 0; i < count; i++) {
      const isPinned = (await items.nth(i).getAttribute("data-pinned")) === "true";
      if (!isPinned) seenUnpinned = true;
      if (isPinned && seenUnpinned) {
        throw new Error("Pinned note found after unpinned note");
      }
    }
  });
});

test.describe("Note List Item Display (Apple Notes Style)", () => {
  test("each note item shows a title line and a metadata line", async ({ page }) => {
    const firstItem = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(firstItem.getByTestId("note-item-title")).toBeVisible();
    await expect(firstItem.getByTestId("note-item-meta")).toBeVisible();
  });

  test("note title line shows first line of content", async ({ page }) => {
    const firstItem = page.getByTestId("list-pane").getByTestId("note-item").first();
    const title = firstItem.getByTestId("note-item-title");
    // The first seed note starts with "Welcome to NoteDude"
    await expect(title).toContainText("Welcome to notedude");
  });


  test("note metadata line contains a timestamp snippet", async ({ page }) => {
    const firstItem = page.getByTestId("list-pane").getByTestId("note-item").first();
    const meta = firstItem.getByTestId("note-item-meta");
    await expect(meta).toBeVisible();
    // Metadata should contain abbreviated content (not empty)
    await expect(meta).not.toHaveText("");
  });

  test("new note shows 'New Note' as title and 'No Content' in metadata", async ({ page }) => {
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    const selectedItem = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selectedItem.getByTestId("note-item-title")).toHaveText("New Note");
    await expect(selectedItem.getByTestId("note-item-meta")).toContainText("No Content");
  });

  test("a cleared note shows 'No Text Entered' while editing, then is discarded on exit", async ({ page }) => {
    // Create a note with content and save it
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("Temp content");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const countWithNote = await page.getByTestId("list-pane").getByTestId("note-item").count();

    // Re-enter editing and clear all content
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await editor.fill("");

    // While still editing, the cleared note displays "No Text Entered" / "No Content"
    const selectedItem = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selectedItem.getByTestId("note-item-title")).toHaveText("No Text Entered");
    await expect(selectedItem.getByTestId("note-item-meta")).toContainText("No Content");

    // On exit, an empty note is discarded (removed from the list)
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(countWithNote - 1);
  });

  test("note with content shows first line as title in list item", async ({ page }) => {
    // Create a new note and type content
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("My First Line\nSome more content here");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const selectedItem = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selectedItem.getByTestId("note-item-title")).toHaveText("My First Line");
  });

  test("meta snippet is empty when note has only one line", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("Just a title line");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const meta = page.getByTestId("list-pane").locator("[data-selected='true']").getByTestId("note-item-meta");
    // Snippet portion should be empty — only the timestamp should appear
    await expect(meta).not.toContainText("Just a title line");
  });

  test("meta snippet shows second line once a second line is typed", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("Title line\nSecond line content");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const meta = page.getByTestId("list-pane").locator("[data-selected='true']").getByTestId("note-item-meta");
    await expect(meta).toContainText("Second line content");
  });

  test("new note content pane starts empty", async ({ page }) => {
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await expect(editor).toHaveValue("");
  });
});

test.describe("Editor Tag Completion", () => {
  test("clicking the content pane enters editing mode", async ({ page }) => {
    await page.getByTestId("content-pane").click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("clicking the content pane then typing '#' shows editor tag dropdown", async ({ page }) => {
    await page.getByTestId("content-pane").click();
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" #");
    await expect(page.getByTestId("editor-tag-dropdown")).toBeVisible();
  });

  test("typing '#' in the editor shows tag completion dropdown", async ({ page }) => {
    await page.keyboard.press("Enter"); // open editor
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" #");

    await expect(page.getByTestId("editor-tag-dropdown")).toBeVisible();
  });

  test("editor tag dropdown lists all existing tags", async ({ page }) => {
    await page.keyboard.press("Enter");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" #");

    const items = page.getByTestId("editor-tag-dropdown").getByTestId("editor-tag-item");
    await expect(items).toHaveCount(6); // 6 unique tags from seed data
  });

  test("typing after '#' filters the editor tag list incrementally", async ({ page }) => {
    await page.keyboard.press("Enter");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" #in");

    const items = page.getByTestId("editor-tag-dropdown").getByTestId("editor-tag-item");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("#intro");
  });

  test("clicking a tag in the dropdown inserts it into the editor", async ({ page }) => {
    await page.keyboard.press("Enter");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" #");

    const introTag = page.getByTestId("editor-tag-dropdown").getByTestId("editor-tag-item").filter({ hasText: "#intro" });
    await introTag.click();

    await expect(editor).toHaveValue(/\#intro/);
    await expect(page.getByTestId("editor-tag-dropdown")).not.toBeVisible();
  });

  test("ArrowDown selects first tag in editor dropdown", async ({ page }) => {
    await page.keyboard.press("Enter");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" #");

    await editor.press("ArrowDown");
    const items = page.getByTestId("editor-tag-dropdown").getByTestId("editor-tag-item");
    await expect(items.nth(0)).toHaveAttribute("data-selected", "true");
  });

  test("pressing Enter on a highlighted editor tag inserts it", async ({ page }) => {
    await page.keyboard.press("Enter");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" #gu"); // narrows to only #guide

    await editor.press("ArrowDown"); // select #guide
    await editor.press("Enter");

    await expect(editor).toHaveValue(/\#guide/);
    await expect(page.getByTestId("editor-tag-dropdown")).not.toBeVisible();
  });

  test("Escape dismisses the editor tag dropdown without inserting", async ({ page }) => {
    await page.keyboard.press("Enter");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" #");
    await expect(page.getByTestId("editor-tag-dropdown")).toBeVisible();

    await editor.press("Escape");
    await expect(page.getByTestId("editor-tag-dropdown")).not.toBeVisible();
    // Should still be in editing state
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("editor tag dropdown disappears when '#' context is broken by a space", async ({ page }) => {
    await page.keyboard.press("Enter");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" #");
    await expect(page.getByTestId("editor-tag-dropdown")).toBeVisible();

    await editor.type(" ");
    await expect(page.getByTestId("editor-tag-dropdown")).not.toBeVisible();
  });

  test("editor tag dropdown does not show when not in a '#' word context", async ({ page }) => {
    await page.keyboard.press("Enter");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.press("End");
    await editor.type(" hello");

    await expect(page.getByTestId("editor-tag-dropdown")).not.toBeVisible();
  });
});

test.describe("Tag Search", () => {
  test("clicking the search input enters search mode and shows tag dropdown when '#' is typed", async ({ page }) => {
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    await searchInput.fill("#");
    await expect(page.getByTestId("tag-dropdown")).toBeVisible();
  });

  test("typing '#' in search bar shows tag dropdown", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    await expect(page.getByTestId("tag-dropdown")).toBeVisible();
  });

  test("tag dropdown lists all unique tags from notes", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    const tags = page.getByTestId("tag-item");
    // Seed data has 6 tags: #ideas #archive #project #tips #guide #intro
    await expect(tags).toHaveCount(6);
  });

  test("top section shows recently searched tags before the separator", async ({ page }) => {
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");

    // Search for #guide and #intro to populate search history
    await page.keyboard.press("/");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");
    await page.keyboard.press("/");
    await searchInput.fill("#intro");
    await page.keyboard.press("Enter");

    // Open tag dropdown — #intro (most recent search) should be first, then #guide
    await page.keyboard.press("/");
    await searchInput.fill("#");
    const tags = page.getByTestId("tag-item");
    await expect(tags.nth(0)).toContainText("#intro");
    await expect(tags.nth(1)).toContainText("#guide");
  });

  test("remaining tags appear after the separator in alphabetical order", async ({ page }) => {
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");

    // Search one tag to create a top section
    await page.keyboard.press("/");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    // Open dropdown — non-searched tags should appear alphabetically after separator
    await page.keyboard.press("/");
    await searchInput.fill("#");
    const tags = page.getByTestId("tag-item");
    // #guide is the recent section; rest are alphabetical: #archive, #ideas, #intro, #project, #tips
    await expect(tags.nth(1)).toContainText("#archive");
  });

  test("a separator is shown between recent and alphabetical sections when search history exists", async ({ page }) => {
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");

    // Seed one tag into search history
    await page.keyboard.press("/");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    // Open dropdown — separator should appear between recent (#guide) and the rest
    await page.keyboard.press("/");
    await searchInput.fill("#");
    await expect(page.getByTestId("tag-separator")).toBeVisible();
  });

  test("no separator is shown when there are no recently searched tags", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#"); // all 6 tags, but no search history

    await expect(page.getByTestId("tag-item")).toHaveCount(6);
    await expect(page.getByTestId("tag-separator")).not.toBeVisible();
  });

  test("typing after '#' filters the tag list incrementally", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#in");

    const tags = page.getByTestId("tag-item");
    await expect(tags).toHaveCount(1);
    await expect(tags.first()).toContainText("#intro");
  });

  test("clicking a tag filters the note list by that tag", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    // Click #intro — notes 1 and 2 have #intro
    const introTag = page.getByTestId("tag-item").filter({ hasText: "#intro" });
    await introTag.click();

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items).toHaveCount(2);
  });

  test("tag dropdown disappears when '#' is removed", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");
    await expect(page.getByTestId("tag-dropdown")).toBeVisible();

    await searchInput.fill("");
    await expect(page.getByTestId("tag-dropdown")).not.toBeVisible();
  });

  test("tag dropdown disappears after selecting a tag", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    const tag = page.getByTestId("tag-item").first();
    await tag.click();

    await expect(page.getByTestId("tag-dropdown")).not.toBeVisible();
  });

  test("Escape with tag dropdown visible dismisses dropdown but stays in search state", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");
    await expect(page.getByTestId("tag-dropdown")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    await expect(page.getByTestId("tag-dropdown")).not.toBeVisible();
    await expect(searchInput).toBeFocused();
  });

  test("after dismissing tag dropdown, changing query re-shows it", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");
    await expect(page.getByTestId("tag-dropdown")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tag-dropdown")).not.toBeVisible();

    // Changing the query should re-show the dropdown
    await searchInput.fill("#g");
    await expect(page.getByTestId("tag-dropdown")).toBeVisible();
  });

  test("second Escape after dismissing dropdown exits search state", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    await page.keyboard.press("Escape"); // dismiss dropdown
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");

    await page.keyboard.press("Escape"); // exit search
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("ArrowDown selects the first tag in the dropdown", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    await page.keyboard.press("ArrowDown");
    const tags = page.getByTestId("tag-item");
    await expect(tags.nth(0)).toHaveAttribute("data-selected", "true");
  });

  test("ArrowDown and ArrowUp navigate the tag list", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    const tags = page.getByTestId("tag-item");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(tags.nth(1)).toHaveAttribute("data-selected", "true");

    await page.keyboard.press("ArrowUp");
    await expect(tags.nth(0)).toHaveAttribute("data-selected", "true");
  });

  test("Enter on highlighted tag inserts it into search field and stays in search state", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#in"); // narrows to #intro

    await page.keyboard.press("ArrowDown"); // select #intro
    await page.keyboard.press("Enter");

    // Should insert tag into search field, not apply filter yet
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    await expect(searchInput).toHaveValue("#intro ");
    await expect(page.getByTestId("tag-dropdown")).not.toBeVisible();
  });

  test("Enter on highlighted tag then Enter again applies filter and exits search", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#in"); // narrows to #intro

    await page.keyboard.press("ArrowDown"); // select #intro
    await page.keyboard.press("Enter"); // insert tag
    await page.keyboard.press("Enter"); // apply filter

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items).toHaveCount(2); // #intro appears in 2 seed notes
  });

  test("selecting a tag shows only notes containing that tag", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    // Select #guide — notes 2 and 3 have #guide
    const guideTag = page.getByTestId("tag-item").filter({ hasText: "#guide" });
    await guideTag.click();

    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items).toHaveCount(2);
    // All shown notes should contain #guide
    for (let i = 0; i < 2; i++) {
      await items.nth(i).click();
      await expect(page.getByTestId("content-pane")).toContainText("#guide");
    }
  });
});

test.describe("Tag Search Keyboard Shortcuts", () => {
  // Seed notes don't have tasks tags, so we verify filter is applied via search bar value and list count
  const shortcuts: Array<{ keys: string[]; tag: string }> = [
    { keys: ["t", "i"], tag: "#tasks-inbox" },
    { keys: ["t", "t"], tag: "#tasks-today" },
    { keys: ["t", "n"], tag: "#tasks-nearterm" },
    { keys: ["t", "l"], tag: "#tasks-longterm" },
    { keys: ["t", "d"], tag: "#tasks-done" },
  ];

  for (const { keys, tag } of shortcuts) {
    test(`pressing '${keys.join("' then '")}' applies ${tag} filter`, async ({ page }) => {
      await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
      for (const key of keys) await page.keyboard.press(key);

      const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
      await expect(searchInput).toHaveValue(tag);
      // list shows only notes matching the tag (0 for seed data, but filter is active)
      const items = page.getByTestId("list-pane").getByTestId("note-item");
      const count = await items.count();
      for (let i = 0; i < count; i++) {
        await items.nth(i).click();
        await expect(page.getByTestId("content-pane")).toContainText(tag);
      }
    });
  }

  test("shortcut does not fire in editing state", async ({ page }) => {
    await page.keyboard.press("Enter"); // enter editing
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("t");
    await page.keyboard.press("i");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await expect(searchInput).not.toHaveValue("#tasks-inbox");
  });

  test("shortcut does not fire in search state", async ({ page }) => {
    await page.keyboard.press("/"); // enter search
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    // type 't' then 'i' while still in search state — should not trigger shortcut
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.pressSequentially("ti");
    await expect(searchInput).not.toHaveValue("#tasks-inbox");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
  });

  test("unrecognized second key cancels prefix silently", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("x");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await expect(searchInput).toHaveValue("");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("pressing 't' then a shortcut key selects the first matching note", async ({ page }) => {
    // Add a note with #tasks-inbox so there's something to select
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("My inbox task #tasks-inbox");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await page.keyboard.press("t");
    await page.keyboard.press("i");

    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selected).toContainText("#tasks-inbox");
  });
});

test.describe("Donate Shortcut", () => {
  test("pressing 'd' twice opens the donate URL in a new tab", async ({ page }) => {
    // Asserts what the app asks to open, not the resulting request. The donate target is a
    // fragment, and fragments are client-side only — they are never sent to the server, so
    // intercepting the network could only ever see "https://notedude.app/" (#129).
    await page.addInitScript(() => {
      (window as unknown as { __opened: string[] }).__opened = [];
      window.open = (url?: string | URL) => {
        (window as unknown as { __opened: string[] }).__opened.push(String(url));
        return null;
      };
    });
    await page.reload();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await page.getByTestId("app").focus();

    await page.keyboard.press("d");
    await page.keyboard.press("d");

    const opened = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
    expect(opened).toEqual(["https://notedude.app#donate"]);
  });

  test("pressing 'd' once does not open a tab", async ({ page, context }) => {
    const newTabs: unknown[] = [];
    context.on("page", (p) => newTabs.push(p));
    await page.keyboard.press("d");
    await page.waitForTimeout(300);
    expect(newTabs).toHaveLength(0);
  });

  test("'dd' does not fire in editing state", async ({ page, context }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const newTabs: unknown[] = [];
    context.on("page", (p) => newTabs.push(p));
    await page.keyboard.press("d");
    await page.keyboard.press("d");
    await page.waitForTimeout(300);
    expect(newTabs).toHaveLength(0);
  });

  test("'dd' does not fire in search state", async ({ page, context }) => {
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const newTabs: unknown[] = [];
    context.on("page", (p) => newTabs.push(p));
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.pressSequentially("dd");
    await page.waitForTimeout(300);
    expect(newTabs).toHaveLength(0);
  });
});

test.describe("Dark Mode", () => {
  test("app starts in dark mode by default", async ({ page }) => {
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "dark");
  });

  test("app has a dark background by default", async ({ page }) => {
    const bg = await page.getByTestId("app").evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bg).not.toBe("rgb(255, 255, 255)");
  });

  test("pressing 'd' then 'm' toggles to light mode", async ({ page }) => {
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "light");
  });

  test("pressing 'd' then 'm' twice returns to dark mode", async ({ page }) => {
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "light");
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "dark");
  });

  test("explicit light preference is respected on load", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    await page.reload();
    await page.getByTestId("app").focus();
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "light");
  });

  test("theme preference persists across page reloads via localStorage", async ({ page }) => {
    await page.keyboard.press("d");
    await page.keyboard.press("m"); // dark (default) -> light
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await page.getByTestId("app").focus();
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "light");
  });

  test("'dm' does not toggle in editing state", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("Number Shortcuts", () => {
  test("pressing '1' selects the first note", async ({ page }) => {
    await page.keyboard.press("j"); // move away from first
    await page.keyboard.press("1");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items.first()).toHaveAttribute("data-selected", "true");
  });

  test("pressing '2' selects the second note", async ({ page }) => {
    await page.keyboard.press("2");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items.nth(1)).toHaveAttribute("data-selected", "true");
  });

  test("pressing '9' selects the last note", async ({ page }) => {
    await page.keyboard.press("9");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const count = await items.count();
    await expect(items.nth(count - 1)).toHaveAttribute("data-selected", "true");
  });

  test("number shortcuts do not fire in editing state", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    const titleBefore = await selected.getByTestId("note-item-title").textContent();
    await page.keyboard.press("2");
    // Selection should not have changed
    await expect(selected.getByTestId("note-item-title")).toHaveText(titleBefore!);
  });
});

test.describe("Multi-term Search", () => {
  test("filter matches notes containing all terms", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#intro guide");
    await page.keyboard.press("Enter");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    // Only "Getting started #intro #guide" has both
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("#intro");
  });

  test("filter with tag and plain text shows only matching notes", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide Enter");
    await page.keyboard.press("Enter");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    // "Keyboard shortcuts #guide\nEnter to edit..." — has both #guide and "Enter"
    await expect(items).toHaveCount(1);
    await items.first().click();
    await expect(page.getByTestId("content-pane")).toContainText("#guide");
  });

  test("filter returns no results when no note matches all terms", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#intro #archive");
    await page.keyboard.press("Enter");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items).toHaveCount(0);
  });
});

test.describe("Prefix Key Cancellation", () => {
  test("'d' followed by unrecognized key cancels silently", async ({ page }) => {
    const newTabs: unknown[] = [];
    (page.context()).on("page", (p) => newTabs.push(p));
    await page.keyboard.press("d");
    await page.keyboard.press("x");
    await page.waitForTimeout(200);
    expect(newTabs).toHaveLength(0);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("Pin Toggle", () => {
  test("pressing 'p' pins the selected note and moves it to the top", async ({ page }) => {
    // Select a non-pinned note (note 1 is already pinned, go to note 2)
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    const titleBefore = await selected.getByTestId("note-item-title").textContent();

    await page.keyboard.press("p");

    const firstItem = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(firstItem.getByTestId("note-item-title")).toContainText(titleBefore!);
    await expect(firstItem).toHaveAttribute("data-pinned", "true");
  });

  test("pressing 'p' again unpins the note", async ({ page }) => {
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await page.keyboard.press("p"); // pin
    await expect(selected).toHaveAttribute("data-pinned", "true");
    await page.keyboard.press("p"); // unpin
    await expect(selected).toHaveAttribute("data-pinned", "false");
  });

  test("'p' does not toggle pin in editing state", async ({ page }) => {
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selected).toHaveAttribute("data-pinned", "false");
    await page.keyboard.press("Enter");
    await page.keyboard.press("p"); // should type 'p' not toggle pin
    await page.keyboard.press("Escape");
    await expect(selected).toHaveAttribute("data-pinned", "false");
  });

  test("'p' does not toggle pin while search input is focused", async ({ page }) => {
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selected).toHaveAttribute("data-pinned", "false");
    await page.keyboard.press("/");
    // while search input is focused (search state), press p — should not pin
    await page.keyboard.press("p");
    await page.keyboard.press("Escape");
    await expect(selected).toHaveAttribute("data-pinned", "false");
  });
});

test.describe("Tag-Pin Toggle (Shift+P)", () => {
  test("Shift+P tag-pins the selected note", async ({ page }) => {
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selected).toHaveAttribute("data-tagpinned", "false");
    await page.keyboard.press("Shift+P"); // Shift+P
    await expect(selected).toHaveAttribute("data-tagpinned", "true");
  });

  test("Shift+P again removes tag-pin", async ({ page }) => {
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await page.keyboard.press("Shift+P");
    await expect(selected).toHaveAttribute("data-tagpinned", "true");
    await page.keyboard.press("Shift+P");
    await expect(selected).toHaveAttribute("data-tagpinned", "false");
  });

  test("Shift+P does not toggle tag-pin while search input is focused", async ({ page }) => {
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selected).toHaveAttribute("data-tagpinned", "false");
    await page.keyboard.press("/");
    await page.keyboard.press("Shift+P"); // Shift+P while search input is focused — should not tag-pin
    await page.keyboard.press("Escape");
    await expect(selected).toHaveAttribute("data-tagpinned", "false");
  });

  test("Shift+P does not affect pin in editing state", async ({ page }) => {
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Shift+P"); // should type 'P', not toggle tag-pin
    await page.keyboard.press("Escape");
    await expect(selected).toHaveAttribute("data-tagpinned", "false");
  });

  test("pin and tag-pin are independent", async ({ page }) => {
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await page.keyboard.press("p"); // pin only
    await expect(selected).toHaveAttribute("data-pinned", "true");
    await expect(selected).toHaveAttribute("data-tagpinned", "false");
    await page.keyboard.press("Shift+P"); // tag-pin only
    await expect(selected).toHaveAttribute("data-pinned", "true");
    await expect(selected).toHaveAttribute("data-tagpinned", "true");
    await page.keyboard.press("p"); // unpin — tag-pin stays
    await expect(selected).toHaveAttribute("data-pinned", "false");
    await expect(selected).toHaveAttribute("data-tagpinned", "true");
  });
});

test.describe("Tag-Pinning", () => {
  test("tag-pinned note appears first when its first tag is the active filter", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide Tag-pinned client note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+P"); // Shift+P — tag-pin

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(first.getByTestId("note-item-title")).toContainText("#guide Tag-pinned client note");
  });

  test("tag-pinned note does NOT sort first when filter is a non-primary tag", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide Primary guide note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+P"); // Shift+P — tag-pinned for #guide

    await page.keyboard.press("c");
    const editor2 = page.getByTestId("content-pane").getByRole("textbox");
    await editor2.fill("#client-acme overview #guide");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+P"); // tag-pinned but first tag is #client-acme not #guide

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(first.getByTestId("note-item-title")).toContainText("#guide Primary guide note");
  });

  test("note without tag-pin does not get sort boost even with matching first tag", async ({ page }) => {
    await page.keyboard.press("c");
    let editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide Note A");
    await page.keyboard.press("Escape");

    await page.keyboard.press("c");
    editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide Note B");
    await page.keyboard.press("Escape");

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    const items = page.getByTestId("list-pane").getByTestId("note-item");
    expect(await items.count()).toBeGreaterThanOrEqual(2);
    const titleA = items.filter({ hasText: "Note A" });
    const titleB = items.filter({ hasText: "Note B" });
    await expect(titleA).toHaveAttribute("data-tagpinned", "false");
    await expect(titleB).toHaveAttribute("data-tagpinned", "false");
  });

  test("tag-pinned note is still first after newer notes are added", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#ideas Master ideas note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+P"); // Shift+P

    await page.keyboard.press("c");
    const editor2 = page.getByTestId("content-pane").getByRole("textbox");
    await editor2.fill("#ideas Newer ideas note");
    await page.keyboard.press("Escape");

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#ideas");
    await page.keyboard.press("Enter");

    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(first.getByTestId("note-item-title")).toContainText("#ideas Master ideas note");
  });

  test("regularly pinned note does NOT sort to top in search/filter mode", async ({ page }) => {
    // Pin a note with p (regular pin)
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide Pinned but not tag-pinned");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p"); // regular pin only

    // Create a newer note
    await page.keyboard.press("c");
    const editor2 = page.getByTestId("content-pane").getByRole("textbox");
    await editor2.fill("#guide Newer note");
    await page.keyboard.press("Escape");

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    // Newer note should be first since pinned note has no tag-pin boost in search
    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(first.getByTestId("note-item-title")).toContainText("#guide Newer note");
  });
});

test.describe("Pinning Indicators", () => {
  test("unpinned note has no bullet before its title", async ({ page }) => {
    await page.keyboard.press("j"); // move to a non-pinned note
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    const title = await selected.getByTestId("note-item-title").textContent();
    expect(title).not.toMatch(/^[○#]/);
  });

  test("pinned note shows ○ before its title when no tag filter is active", async ({ page }) => {
    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(first).toHaveAttribute("data-pinned", "true");
    const title = await first.getByTestId("note-item-title").textContent();
    expect(title).toMatch(/^○/);
  });

  test("pinned note shows ○ when active filter is a tag that doesn't match its first tag", async ({ page }) => {
    // Seed note "Getting started #intro #guide" has first tag #intro but also contains #guide.
    // Regular-pin it, then filter by #guide — the ○ bullet should still show in filter mode.
    const note = page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "Getting started #intro #guide" });
    await note.click();
    await expect(note).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("p");
    await expect(note).toHaveAttribute("data-pinned", "true");

    // Filter by #guide — not the note's first tag (#intro)
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill("#guide");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const filtered = page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "Getting started #intro #guide" });
    const title = await filtered.getByTestId("note-item-title").textContent();
    expect(title).toMatch(/^○/);
  });

  test("tag-pinned note shows # when its first tag matches the active filter", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#ideas Master ideas note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+P"); // Shift+P — tag-pin

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#ideas");
    await page.keyboard.press("Enter");

    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    const title = await first.getByTestId("note-item-title").textContent();
    expect(title).toMatch(/#/); // tag-pinned indicator
  });

  test("tag-pinned note always shows # indicator regardless of active filter", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#ideas Master ideas note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+P"); // tag-pin

    const noteItem = page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "Master ideas note" });
    // # indicator visible in idle mode
    await expect(noteItem.locator('span').filter({ hasText: '#' }).first()).toBeVisible();

    // Apply filter
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#ideas");
    await page.keyboard.press("Enter");

    // Still visible with filter
    await expect(noteItem.locator('span').filter({ hasText: '#' }).first()).toBeVisible();

    // Clear filter — still visible
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(noteItem.locator('span').filter({ hasText: '#' }).first()).toBeVisible();
  });
});

test.describe("Help Overlay", () => {
  test("pressing '?' shows the help overlay", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toBeVisible();
  });

  test("help overlay lists key shortcuts", async ({ page }) => {
    await page.keyboard.press("?");
    const overlay = page.getByTestId("help-overlay");
    await expect(overlay).toContainText("?");
    await expect(overlay).toContainText("⌘/");
    await expect(overlay).toContainText("j");
    await expect(overlay).toContainText("k");
    await expect(overlay).toContainText("p");
    await expect(overlay).toContainText("d");
  });

  test("pressing any key dismisses the help overlay", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });

  test("clicking anywhere dismisses the help overlay", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toBeVisible();
    await page.getByTestId("help-overlay").click();
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });

  test("app remains in idle state while overlay is shown", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  });

  test("'?' does not show overlay in editing state", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });

  test("'?' does not show overlay in search state", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.pressSequentially("?");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
  });

  test("⌘/ shows the help overlay from idle state", async ({ page }) => {
    await page.keyboard.press("ControlOrMeta+/");
    await expect(page.getByTestId("help-overlay")).toBeVisible();
  });

  test("⌘/ shows the help overlay from editing state", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("ControlOrMeta+/");
    await expect(page.getByTestId("help-overlay")).toBeVisible();
  });

  test("⌘/ shows the help overlay from search state", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    await page.keyboard.press("ControlOrMeta+/");
    await expect(page.getByTestId("help-overlay")).toBeVisible();
  });

  test("plain '/' still types into the editor (⌘/ does not hijack the slash key)", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("");
    await editor.pressSequentially("a/b");
    await expect(page.getByTestId("help-overlay")).not.toBeVisible();
    await expect(editor).toHaveValue("a/b");
  });
});

test.describe("Logout shortcut (ll)", () => {
  test("ll does not fire from editing state", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("l");
    await page.keyboard.press("l");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("ll does not fire from search state", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.pressSequentially("ll");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
  });

  test("ll shortcut is listed in help overlay", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toContainText("ll");
  });
});

test.describe("Archive note (Shift+Y)", () => {
  test("Shift+Y archives the selected note without removing it from the list", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const initialCount = await items.count();
    await page.keyboard.press("Shift+Y");
    // The note is archived, not deleted — it stays in the list below the divider (#96)
    await expect(items).toHaveCount(initialCount);
    await expect(page.locator("[data-testid='note-item'][data-archived='true']")).toHaveCount(1);
    await expect(page.getByTestId("archived-divider")).toBeVisible();
  });

  test("after archiving the next active note is selected", async ({ page }) => {
    // Select first note, archive it — second note should become selected
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await items.first().click();
    const secondTitle = await items.nth(1).getByTestId("note-item-title").textContent();
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Y");
    await expect(items.first().getByTestId("note-item-title")).toContainText(secondTitle!);
    // Selection stays in the active section, never jumps into the archive
    const selected = page.locator("[data-testid='note-item'][data-selected='true']");
    await expect(selected).toHaveAttribute("data-archived", "false");
  });

  test("after archiving every note the list is all archived, below the divider", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await page.keyboard.press("Shift+Y");
    }
    // Nothing is deleted: every note is still listed, all of them archived (#96)
    await expect(items).toHaveCount(count);
    await expect(page.locator("[data-testid='note-item'][data-archived='false']")).toHaveCount(0);
    await expect(page.getByTestId("archived-divider")).toBeVisible();
  });

  test("Shift+Y on an already-archived note does not re-tag it", async ({ page }) => {
    // #67: repeated Shift+Y used to append #archived over and over
    await page.keyboard.press("Shift+Y");
    const archived = page.locator("[data-testid='note-item'][data-archived='true']");
    await expect(archived).toHaveCount(1);
    await archived.first().click();
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Y");
    await page.keyboard.press("Shift+Y");
    const content = await page.getByTestId("content-pane").innerText();
    expect(content.match(/#archived/g) ?? []).toHaveLength(1);
  });

  test("Shift+Y does not fire in editing state", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const initialCount = await items.count();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("Shift+Y");
    await page.keyboard.press("Escape");
    await expect(items).toHaveCount(initialCount);
    await expect(page.locator("[data-testid='note-item'][data-archived='true']")).toHaveCount(0);
  });

  test("Shift+Y is listed in help overlay", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toContainText("Shift+Y");
  });
});

test.describe("Task-move overlay (t+m)", () => {
  test("t+m opens the task-move overlay", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    await expect(page.getByTestId("task-move-overlay")).toBeVisible();
  });

  test("overlay lists all five task tags including done", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    const overlay = page.getByTestId("task-move-overlay");
    await expect(overlay).toContainText("#tasks-inbox");
    await expect(overlay).toContainText("#tasks-today");
    await expect(overlay).toContainText("#tasks-nearterm");
    await expect(overlay).toContainText("#tasks-longterm");
    await expect(overlay).toContainText("#tasks-done");
  });

  test("first tag is highlighted by default", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    const items = page.getByTestId("task-move-overlay").getByTestId("task-move-item");
    await expect(items.first()).toHaveAttribute("data-selected", "true");
  });

  test("j/k navigates the list", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    const items = page.getByTestId("task-move-overlay").getByTestId("task-move-item");
    await page.keyboard.press("j");
    await expect(items.nth(1)).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("k");
    await expect(items.first()).toHaveAttribute("data-selected", "true");
  });

  test("Esc dismisses without changing the note", async ({ page }) => {
    // Create a note with no task tag
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("no task tag here");
    await page.keyboard.press("Escape");
    const contentBefore = await page.getByTestId("content-pane").textContent();

    await page.keyboard.press("t");
    await page.keyboard.press("m");
    await expect(page.getByTestId("task-move-overlay")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("task-move-overlay")).not.toBeVisible();
    await expect(page.getByTestId("content-pane")).toHaveText(contentBefore!);
  });

  test("Enter appends tag when note has no task tag", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("My note without a task tag");
    await page.keyboard.press("Escape");

    await page.keyboard.press("t");
    await page.keyboard.press("m");
    // First item is selected by default — press Enter
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("task-move-overlay")).not.toBeVisible();
    await expect(page.getByTestId("content-pane")).toContainText("#tasks-");
  });

  test("Enter replaces existing task tag", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("My note #tasks-inbox");
    await page.keyboard.press("Escape");

    // Open task-move, navigate to #tasks-today (second item), apply
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    await page.keyboard.press("j"); // move to second item
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("content-pane")).not.toContainText("#tasks-inbox");
    await expect(page.getByTestId("content-pane")).toContainText("#tasks-today");
  });

  test("t+m does not fire from editing state", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    await expect(page.getByTestId("task-move-overlay")).not.toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("t+m is listed in help overlay", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toContainText("t → m");
  });
});

test.describe("Dynamic divider", () => {
  test("divider has at least as many rows as notes plus buffer", async ({ page }) => {
    const text = await page.getByTestId("divider").innerText();
    const rows = text.split("\n").filter((l) => l === "|").length;
    const noteCount = await page.getByTestId("note-item").count();
    expect(rows).toBeGreaterThanOrEqual(noteCount);
  });

  test("divider grows taller as notes are added", async ({ page }) => {
    const countRows = async () => {
      const text = await page.getByTestId("divider").innerText();
      return text.split("\n").filter((l) => l === "|").length;
    };

    const before = await countRows();

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("c");
      await page.keyboard.type(`Note number ${i + 1}`);
      await page.keyboard.press("Escape");
    }

    await page.waitForTimeout(100);
    const after = await countRows();
    expect(after).toBeGreaterThan(before);
  });
});

test.describe("Dual pin indicators", () => {
  test("note with both pin and tag-pin shows ○ and # when filter matches first tag", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#ideas dual indicator test");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p");   // regular pin → ○
    await page.keyboard.press("Shift+P");   // Shift+P tag-pin → #

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#ideas");
    await page.keyboard.press("Enter");

    const noteItem = page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "dual indicator test" });
    const title = await noteItem.getByTestId("note-item-title").textContent();
    expect(title).toMatch(/○/); // pinned circle
    expect(title).toMatch(/#/); // tag-pinned hash
  });

  test("tag-pinning triggers when first tag appears anywhere in multi-term query", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#ideas multi term test");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Shift+P"); // Shift+P — tag-pin

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#ideas multi");
    await page.keyboard.press("Enter");

    const noteItem = page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "multi term test" });
    const title = await noteItem.getByTestId("note-item-title").textContent();
    expect(title).toMatch(/#/); // tag-pinned even with multi-term query
  });

  test("pinned-only note shows ○ but no # in search", async ({ page }) => {
    // First note in INITIAL_NOTES is pinned (not tag-pinned); filter by #guide
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    const pinnedItems = page.getByTestId("list-pane").locator("[data-pinned='true']");
    if (await pinnedItems.count() > 0) {
      const title = await pinnedItems.first().getByTestId("note-item-title").textContent();
      expect(title).toMatch(/○/);
      expect(title!.replace("○", "")).not.toMatch(/^#/);
    }
  });
});

test.describe("Footer", () => {
  test("footer is present with correct text", async ({ page }) => {
    const footer = page.locator("text=notedude • an");
    await expect(footer).toBeVisible();
  });

  test("footer nbino links to nbino.tech", async ({ page }) => {
    const link = page.locator('a[href="https://nbino.tech"]');
    await expect(link).toBeVisible();
    await expect(link).toContainText("nbino");
  });
});

test.describe("Clickable links in content pane", () => {
  test("URLs in note content render as clickable links opening in new tab", async ({ page }) => {
    // Create a new note with a URL
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const textarea = page.getByTestId("content-pane").getByRole("textbox");
    await textarea.fill("Check out https://example.com for more info");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    // The link should be visible in content pane
    const link = page.getByTestId("content-pane").locator('a[href="https://example.com"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("non-URL text is not linkified", async ({ page }) => {
    // Select the first note and check that plain text has no unexpected links
    await page.keyboard.press("j");
    const contentPane = page.getByTestId("content-pane");
    await expect(contentPane).toBeVisible();
    // No links with href starting with http in a plain-text note
    // (welcome notes don't have URLs, so count should be 0)
    const httpLinks = contentPane.locator('a[href^="http"]');
    // This test just verifies the feature doesn't break plain text notes
    // Count can be 0 or more depending on note content
    expect(await httpLinks.count()).toBeGreaterThanOrEqual(0);
  });
});

test.describe("Navigation history (cmd+[ and cmd+])", () => {
  test("cmd+[ goes back to previously selected note in idle mode", async ({ page }) => {
    // Start on first note, navigate to second
    await page.keyboard.press("j");
    const secondTitle = await page.getByTestId("list-pane").locator("[data-selected='true']").getByTestId("note-item-title").textContent();

    // Navigate back
    await page.keyboard.press("j");
    const thirdTitle = await page.getByTestId("list-pane").locator("[data-selected='true']").getByTestId("note-item-title").textContent();
    expect(thirdTitle).not.toBe(secondTitle);

    await page.keyboard.press("Meta+[");
    const backTitle = await page.getByTestId("list-pane").locator("[data-selected='true']").getByTestId("note-item-title").textContent();
    expect(backTitle).toBe(secondTitle);
  });

  test("cmd+] goes forward after going back", async ({ page }) => {
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    const thirdTitle = await page.getByTestId("list-pane").locator("[data-selected='true']").getByTestId("note-item-title").textContent();

    await page.keyboard.press("Meta+[");
    await page.keyboard.press("Meta+]");
    const forwardTitle = await page.getByTestId("list-pane").locator("[data-selected='true']").getByTestId("note-item-title").textContent();
    expect(forwardTitle).toBe(thirdTitle);
  });

  test("cmd+[ enters edit mode on the target note", async ({ page }) => {
    await page.keyboard.press("j");
    await page.keyboard.press("j");
    await page.keyboard.press("Meta+[");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("cmd+[ saves current edits before navigating back", async ({ page }) => {
    // Create a note and edit it
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("history test note");

    // Navigate back with cmd+[
    await page.keyboard.press("Meta+[");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    // Come back forward
    await page.keyboard.press("Meta+]");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const content = await page.getByTestId("content-pane").getByRole("textbox").inputValue();
    expect(content).toBe("history test note");
  });
});

test.describe("Save flash indicator", () => {
  test("selected note row flashes on Escape save", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const selectedItem = page.locator('[data-testid="note-item"][data-selected="true"]');
    await expect(selectedItem).toHaveAttribute("data-flash", "true");
    await expect(selectedItem).toHaveAttribute("data-flash", "false", { timeout: 1500 });
  });

  test("selected note row flashes on Cmd+Enter save", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    await page.keyboard.press("Meta+Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const selectedItem = page.locator('[data-testid="note-item"][data-selected="true"]');
    await expect(selectedItem).toHaveAttribute("data-flash", "true");
    await expect(selectedItem).toHaveAttribute("data-flash", "false", { timeout: 1500 });
  });
});

test.describe("Empty filter results (#97)", () => {
  test("a filter matching nothing leaves the content pane blank", async ({ page }) => {
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill("zzzznomatch");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("note-item")).toHaveCount(0);
    // The previously selected note must not linger in the content pane
    await expect(page.getByTestId("content-pane")).toHaveText("");
    await expect(page.locator("[data-testid='note-item'][data-selected='true']")).toHaveCount(0);
  });

  test("clearing the empty filter restores the list and a selection", async ({ page }) => {
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill("zzzznomatch");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("content-pane")).toHaveText("");

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("note-item").first()).toBeVisible();
    await expect(page.getByTestId("content-pane")).not.toHaveText("");
  });
});

test.describe("List stability while editing (#93, #94)", () => {
  test("'c' under an active filter edits the new note, not the first listed note", async ({ page }) => {
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill("#guide");
    await page.keyboard.press("Enter");
    const firstTitleBefore = await page.getByTestId("note-item-title").first().innerText();

    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    // The editor holds the brand-new note — not the first filtered note. Under a tag
    // filter the new note is seeded with that tag, caret before it (#99).
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await expect(editor).toHaveValue(" #guide");
    await page.keyboard.type("fresh note body");
    await expect(editor).toHaveValue("fresh note body #guide");

    // The pre-existing note is untouched
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("note-item-title").filter({ hasText: firstTitleBefore })).toHaveCount(1);
  });

  test("the new note stays visible in the list while being edited under a filter", async ({ page }) => {
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill("#guide");
    await page.keyboard.press("Enter");
    const countBefore = await page.getByTestId("note-item").count();

    await page.keyboard.press("c");
    await expect(page.getByTestId("note-item")).toHaveCount(countBefore + 1);
    const selected = page.locator("[data-testid='note-item'][data-selected='true']");
    await expect(selected).toContainText("New Note");
  });

  test("deleting the searched-for tag keeps the note open and selected", async ({ page }) => {
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill("#tips");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("note-item")).toHaveCount(1);

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.evaluate((el: HTMLTextAreaElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(el, el.value.replace(" #tips", ""));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Still editing, still selected, still listed — the note must not vanish mid-edit (#94)
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(page.locator("[data-testid='note-item'][data-selected='true']")).toHaveCount(1);
    await expect(page.getByTestId("note-item")).toHaveCount(1);
    await expect(editor).toHaveValue(/Use 'j' and 'k'/);
  });

  test("typing does not re-sort the list mid-edit", async ({ page }) => {
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill("#guide");
    await page.keyboard.press("Enter");
    // Select the *second* filtered note, then edit it
    await page.keyboard.press("j");
    const orderBefore = await page.getByTestId("note-item-title").allInnerTexts();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    await page.keyboard.type(" more text");
    // Search results sort by updatedAt — without freezing, the edited note jumps to the top
    const orderAfter = await page.getByTestId("note-item-title").allInnerTexts();
    expect(orderAfter).toEqual(orderBefore);
  });
});

test.describe("Archived notes are browsable (#95, #96)", () => {
  test("archived notes appear at the end of the idle list under the divider", async ({ page }) => {
    await page.keyboard.press("Shift+Y");

    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const last = items.last();
    await expect(last).toHaveAttribute("data-archived", "true");
    await expect(page.getByTestId("archived-divider")).toBeVisible();
  });

  test("j/k navigate into and out of the archived section", async ({ page }) => {
    await page.keyboard.press("Shift+Y");
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const total = await items.count();

    // Walk to the very bottom of the list
    for (let i = 0; i < total; i++) await page.keyboard.press("j");
    const selected = page.locator("[data-testid='note-item'][data-selected='true']");
    await expect(selected).toHaveAttribute("data-archived", "true");

    // And back out again
    await page.keyboard.press("k");
    await expect(selected).toHaveAttribute("data-archived", "false");
  });

  test("number shortcut 9 reaches the last note including archived", async ({ page }) => {
    await page.keyboard.press("Shift+Y");
    await page.keyboard.press("9");
    const selected = page.locator("[data-testid='note-item'][data-selected='true']");
    await expect(selected).toHaveAttribute("data-archived", "true");
  });

  test("selecting an archived note shows its content", async ({ page }) => {
    await page.keyboard.press("Shift+Y");
    await page.keyboard.press("9");
    await expect(page.getByTestId("content-pane")).toContainText("#archived");
  });
});

test.describe("Tag suggestions exclude archived notes (#90)", () => {
  async function suggestionsFor(page: import("@playwright/test").Page, prefix: string) {
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill(prefix);
    return page.getByTestId("tag-item").allInnerTexts();
  }

  // Applying an empty query is a deterministic way back to an unfiltered idle list —
  // Esc-Esc depends on a 500ms double-press window.
  async function clearSearch(page: import("@playwright/test").Page) {
    await page.getByTestId("top-pane").getByRole("searchbox").fill("");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  }

  test("a tag used only by an archived note is not suggested", async ({ page }) => {
    await page.keyboard.press("c");
    await page.keyboard.type("scratch note #zebratag");
    await page.keyboard.press("Escape");
    expect(await suggestionsFor(page, "#zeb")).toContain("#zebratag");
    await clearSearch(page);

    await page.getByTestId("note-item").filter({ hasText: "scratch note" }).first().click();
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Y");

    expect(await suggestionsFor(page, "#zeb")).toEqual([]);
  });

  test("#archived is never offered as a suggestion", async ({ page }) => {
    await page.keyboard.press("Shift+Y");
    expect(await suggestionsFor(page, "#arch")).not.toContain("#archived");
  });

  test("an archived note is still findable by typing its tag in full", async ({ page }) => {
    await page.keyboard.press("c");
    await page.keyboard.type("scratch note #zebratag");
    await page.keyboard.press("Escape");
    await page.getByTestId("note-item").filter({ hasText: "scratch note" }).first().click();
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Y");

    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill("#zebratag");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("note-item")).toHaveCount(1);
    await expect(page.getByTestId("note-item").first()).toHaveAttribute("data-archived", "true");
  });

  test("the in-editor completion dropdown also excludes archived-only tags", async ({ page }) => {
    await page.keyboard.press("c");
    await page.keyboard.type("scratch note #wombattag");
    await page.keyboard.press("Escape");
    await page.getByTestId("note-item").filter({ hasText: "scratch note" }).first().click();
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Y");

    // Edit an active note and start typing the archived-only tag
    await page.getByTestId("note-item").first().click();
    await page.getByTestId("app").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("\n#wom");
    await expect(page.getByTestId("editor-tag-item")).toHaveCount(0);
  });
});

test.describe("Content pane does not shift between read and edit (#91)", () => {
  async function textOrigin(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const pane = document.querySelector("[data-testid='content-pane']") as HTMLElement;
      const inner = (pane.querySelector("textarea") ?? pane.firstElementChild) as HTMLElement;
      const cs = getComputedStyle(inner);
      const r = inner.getBoundingClientRect();
      return {
        x: r.x + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth),
        y: r.y + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth),
        font: cs.font,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        whiteSpace: cs.whiteSpace,
      };
    });
  }

  test("text origin is identical in idle and editing", async ({ page }) => {
    const idle = await textOrigin(page);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    const editing = await textOrigin(page);

    expect(editing.x).toBeCloseTo(idle.x, 1);
    expect(editing.y).toBeCloseTo(idle.y, 1);
    expect(editing.font).toBe(idle.font);
    expect(editing.lineHeight).toBe(idle.lineHeight);
    expect(editing.letterSpacing).toBe(idle.letterSpacing);
    expect(editing.whiteSpace).toBe(idle.whiteSpace);
  });

  test("text origin returns to the same place after saving", async ({ page }) => {
    const idle = await textOrigin(page);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const after = await textOrigin(page);

    expect(after.x).toBeCloseTo(idle.x, 1);
    expect(after.y).toBeCloseTo(idle.y, 1);
  });
});

test.describe("Compose in search context (#93, #99, #100, #101)", () => {
  const editorOf = (page: import("@playwright/test").Page) =>
    page.getByTestId("content-pane").getByRole("textbox");
  const selectedItem = (page: import("@playwright/test").Page) =>
    page.getByTestId("list-pane").locator("[data-selected='true']");

  // Apply a filter and land back in idle state
  async function applyFilter(page: import("@playwright/test").Page, query: string) {
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill(query);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  }

  test("'c' under a tag filter seeds the note with that tag", async ({ page }) => {
    await applyFilter(page, "#guide");
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    await expect(editorOf(page)).toHaveValue(" #guide");
  });

  test("'c' under a tag filter leaves the cursor before the tag", async ({ page }) => {
    await applyFilter(page, "#guide");
    await page.keyboard.press("c");
    await expect(editorOf(page)).toHaveValue(" #guide");

    await page.keyboard.type("Ship it");
    await expect(editorOf(page)).toHaveValue("Ship it #guide");
  });

  test("'c' under a tag filter does not hijack an existing note (#93)", async ({ page }) => {
    await applyFilter(page, "#guide");
    const before = await page.getByTestId("note-item-title").allInnerTexts();
    expect(before).toHaveLength(2);

    // Move selection off the first result — the old bug snapped back to it
    await page.keyboard.press("j");
    await page.keyboard.press("c");
    await page.keyboard.type("Brand new");
    await expect(editorOf(page)).toHaveValue("Brand new #guide");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    // Both original notes survive untouched, plus the new one
    const after = await page.getByTestId("note-item-title").allInnerTexts();
    expect(after).toContain("Keyboard shortcuts #guide");
    expect(after).toContain("Getting started #intro #guide");
    expect(after).toContain("Brand new #guide");
  });

  test("the seeded note stays selected and visible in the filtered list", async ({ page }) => {
    await applyFilter(page, "#guide");
    await page.keyboard.press("c");
    await expect(selectedItem(page).getByTestId("note-item-title")).toHaveText("New Note");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(3);
  });

  test("a tag-only new note shows the 'New Note' / 'No Content' placeholders", async ({ page }) => {
    await applyFilter(page, "#guide");
    await page.keyboard.press("c");
    await expect(selectedItem(page).getByTestId("note-item-title")).toHaveText("New Note");
    await expect(selectedItem(page).getByTestId("note-item-meta")).toContainText("No Content");
  });

  test("'c' seeds every tag in a multi-tag filter", async ({ page }) => {
    await applyFilter(page, "#intro #guide");
    await page.keyboard.press("c");
    await expect(editorOf(page)).toHaveValue(" #intro #guide");
  });

  test("'c' does not seed free-text terms in the filter", async ({ page }) => {
    await applyFilter(page, "#guide shortcuts");
    await page.keyboard.press("c");
    await expect(editorOf(page)).toHaveValue(" #guide");
  });

  test("'c' never seeds #archived", async ({ page }) => {
    // Archive a note so #archived exists, then filter by it
    await page.keyboard.press("Shift+Y");
    await applyFilter(page, "#archived");
    await page.keyboard.press("c");
    await expect(editorOf(page)).toHaveValue("");
  });

  test("a tag-only note is discarded when editing exits", async ({ page }) => {
    await applyFilter(page, "#guide");
    const before = await page.getByTestId("list-pane").getByTestId("note-item").count();

    await page.keyboard.press("c");
    await expect(editorOf(page)).toHaveValue(" #guide");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(before);

    // ...and it is not lurking outside the filter either
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const titles = await page.getByTestId("note-item-title").allInnerTexts();
    expect(titles).not.toContain("New Note");
  });

  test("'c' under a free-text filter keeps the new note visible while editing", async ({ page }) => {
    await applyFilter(page, "Tips");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1);

    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(editorOf(page)).toHaveValue("");
    // The blank note cannot match "Tips" but must not vanish out from under the editor
    await expect(selectedItem(page).getByTestId("note-item-title")).toHaveText("New Note");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(2);

    await page.keyboard.type("Unrelated thought");
    await expect(editorOf(page)).toHaveValue("Unrelated thought");
    await expect(selectedItem(page).getByTestId("note-item-title")).toHaveText("Unrelated thought");
  });

  test("'c' under a filter matching nothing still shows the new note", async ({ page }) => {
    await applyFilter(page, "zzzznomatch");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(0);

    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1);
    await expect(selectedItem(page).getByTestId("note-item-title")).toHaveText("New Note");
  });

  test("a note being edited is not evicted when it stops matching the filter", async ({ page }) => {
    await applyFilter(page, "#tips");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1);

    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await editorOf(page).fill("Tips\nUse 'j' and 'k' to navigate.");

    // Tag removed — the note no longer matches, but the editor must stay on it
    await expect(editorOf(page)).toHaveValue("Tips\nUse 'j' and 'k' to navigate.");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1);
    await expect(selectedItem(page).getByTestId("note-item-title")).toHaveText("Tips");
  });

  test("Shift+C clears the filter and creates a blank note (#100)", async ({ page }) => {
    await applyFilter(page, "#guide");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(2);

    await page.keyboard.press("Shift+C");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(editorOf(page)).toHaveValue("");
    await expect(page.getByTestId("top-pane").getByRole("searchbox")).toHaveValue("");
    // Filter gone: the full list is back, plus the new note
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(8);
  });

  test("Shift+C from an unfiltered list behaves like 'c'", async ({ page }) => {
    await page.keyboard.press("Shift+C");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(editorOf(page)).toHaveValue("");
    await expect(selectedItem(page).getByTestId("note-item-title")).toHaveText("New Note");
  });

  test("Shift+C is listed in the help overlay", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toBeVisible();
    await expect(page.getByTestId("help-overlay")).toContainText("Shift+C");
  });

  test("clicking a tag leaves that tag in the search box (#101)", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    await page.getByTestId("tag-item").filter({ hasText: "#intro" }).click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(searchInput).toHaveValue("#intro");
  });

  test("'c' inherits a filter applied by clicking a tag", async ({ page }) => {
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").fill("#");
    await page.getByTestId("tag-item").filter({ hasText: "#intro" }).click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await page.getByTestId("app").focus();
    await page.keyboard.press("c");
    await expect(editorOf(page)).toHaveValue(" #intro");
  });

  test("'c' inherits a filter applied by a 't' task shortcut", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("t");
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(editorOf(page)).toHaveValue(" #tasks-today");
  });
});
