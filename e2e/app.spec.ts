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

  test("SS → IS: pressing Escape returns to idle but keeps filter", async ({ page }) => {
    await page.keyboard.press("/");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("test query");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
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

  test("blank note shows 'No Text Entered' as title and 'No Content' in metadata", async ({ page }) => {
    // Create a new note and clear all content
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("");

    // Exit editing
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const selectedItem = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selectedItem.getByTestId("note-item-title")).toHaveText("No Text Entered");
    await expect(selectedItem.getByTestId("note-item-meta")).toContainText("No Content");
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

  test("top 5 most recent tags appear before the separator", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    const tags = page.getByTestId("tag-item");
    // Seed order by recency: #ideas(7) #archive(6) #project(5) #tips(4) #guide(3)
    await expect(tags.nth(0)).toContainText("#ideas");
    await expect(tags.nth(1)).toContainText("#archive");
    await expect(tags.nth(2)).toContainText("#project");
    await expect(tags.nth(3)).toContainText("#tips");
    await expect(tags.nth(4)).toContainText("#guide");
  });

  test("remaining tags appear after the separator in alphabetical order", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    const tags = page.getByTestId("tag-item");
    // #intro is the 6th tag, alphabetically after the separator
    await expect(tags.nth(5)).toContainText("#intro");
  });

  test("a separator is shown between recent and alphabetical sections when there are more than 5 tags", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    await expect(page.getByTestId("tag-separator")).toBeVisible();
  });

  test("no separator is shown when there are 5 or fewer tags", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    // Filter to only 3 tags (those starting with 'a', 'g', 'i' won't all be 5+)
    await searchInput.fill("#i"); // matches #ideas and #intro = 2 tags

    await expect(page.getByTestId("tag-item")).toHaveCount(2);
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

  test("Enter on highlighted tag inserts it into search box with trailing space", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    await page.keyboard.press("ArrowDown"); // select first tag (#ideas)
    await page.keyboard.press("Enter");

    // Tag should be inserted into search box, not applied as filter
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
    await expect(searchInput).toHaveValue("#ideas ");
    // Dropdown should be hidden (query no longer starts with just #)
    await expect(page.getByTestId("tag-dropdown")).not.toBeVisible();
  });

  test("after inserting a tag, user can type additional terms and apply filter", async ({ page }) => {
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#");

    await page.keyboard.press("ArrowDown"); // select #ideas (first recent tag)
    await page.keyboard.press("Enter"); // inserts "#ideas "

    // Type additional search term
    await page.keyboard.type("Capture");
    await expect(searchInput).toHaveValue("#ideas Capture");

    // Apply the filter
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    // Should filter notes containing both #ideas and "Capture"
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await expect(items).toHaveCount(1);
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

    const selected = page.getByTestId("note-item").filter({ hasAttribute: ["data-selected", "true"] });
    await expect(selected).toContainText("#tasks-inbox");
  });
});

test.describe("Donate Shortcut", () => {
  test("pressing 'd' twice opens donate URL in a new tab", async ({ page, context }) => {
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    let openedUrl = "";
    await context.route("**/*", (route) => {
      if (route.request().url() === "https://notedude.app/donate") {
        openedUrl = route.request().url();
        route.abort();
      } else {
        route.continue();
      }
    });
    const newTabPromise = context.waitForEvent("page");
    await page.keyboard.press("d");
    await page.keyboard.press("d");
    await newTabPromise;
    await page.waitForTimeout(500);
    expect(openedUrl).toBe("https://notedude.app/donate");
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
  test("app starts in light mode by default", async ({ page }) => {
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "light");
  });

  test("pressing 'd' then 'm' switches to dark mode", async ({ page }) => {
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "dark");
  });

  test("pressing 'd' then 'm' again toggles back to light mode", async ({ page }) => {
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "dark");
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "light");
  });

  test("dark mode persists across page reloads via localStorage", async ({ page }) => {
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await page.getByTestId("app").focus();
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "dark");
  });

  test("'dm' does not toggle in editing state", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "light");
  });

  test("dark mode applies a dark background to the app", async ({ page }) => {
    await page.keyboard.press("d");
    await page.keyboard.press("m");
    const bg = await page.getByTestId("app").evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(bg).not.toBe("rgb(255, 255, 255)");
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
    await expect(page.getByTestId("app")).toHaveAttribute("data-theme", "light");
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

  test("'p' does not toggle pin in search state", async ({ page }) => {
    await page.keyboard.press("j");
    const selected = page.getByTestId("list-pane").locator("[data-selected='true']");
    await expect(selected).toHaveAttribute("data-pinned", "false");
    await page.keyboard.press("/");
    await page.keyboard.press("p");
    await page.keyboard.press("Escape");
    await expect(selected).toHaveAttribute("data-pinned", "false");
  });
});

test.describe("Tag-Pinning", () => {
  test("pinned note appears first when its first tag is the active filter", async ({ page }) => {
    // Create a note whose first tag is #guide and pin it
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide Pinned client note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p"); // pin it

    // Filter by #guide
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    // Tag-pinned note should be first
    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(first.getByTestId("note-item-title")).toContainText("#guide Pinned client note");
  });

  test("pinned note does NOT sort first when filter is a non-primary tag", async ({ page }) => {
    // Create a note tag-pinned for #guide (first tag = #guide, pinned)
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide Primary guide note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p"); // tag-pinned for #guide

    // Create a newer note pinned but with #guide as a secondary tag
    await page.keyboard.press("c");
    const editor2 = page.getByTestId("content-pane").getByRole("textbox");
    await editor2.fill("#client-acme overview #guide");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p"); // pinned but NOT tag-pinned for #guide

    // Filter by #guide
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    // #guide Primary guide note must be first despite the newer #client-acme note also being pinned
    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(first.getByTestId("note-item-title")).toContainText("#guide Primary guide note");
  });

  test("unpinned note with matching first tag does not get tag-pin boost", async ({ page }) => {
    // Create two notes with #guide as first tag; pin neither
    await page.keyboard.press("c");
    let editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide Note A");
    await page.keyboard.press("Escape");

    await page.keyboard.press("c");
    editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide Note B");
    await page.keyboard.press("Escape");

    // Filter by #guide
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    // Neither should be forced first by tag-pinning; both appear but order is by recency
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2);
    // Verify no item has data-pinned="true" among those two
    const titleA = items.filter({ hasText: "Note A" });
    const titleB = items.filter({ hasText: "Note B" });
    await expect(titleA).toHaveAttribute("data-pinned", "false");
    await expect(titleB).toHaveAttribute("data-pinned", "false");
  });

  test("tag-pinned note is still first after other notes are added", async ({ page }) => {
    // Create and pin a note for #ideas
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#ideas Master ideas note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p");

    // Add another #ideas note (newer, would normally sort first)
    await page.keyboard.press("c");
    const editor2 = page.getByTestId("content-pane").getByRole("textbox");
    await editor2.fill("#ideas Newer ideas note");
    await page.keyboard.press("Escape");

    // Filter by #ideas
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#ideas");
    await page.keyboard.press("Enter");

    // Tag-pinned note must still be first despite newer note existing
    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    await expect(first.getByTestId("note-item-title")).toContainText("#ideas Master ideas note");
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
    // Note 1 is pinned with first tag #intro; filter by #guide (different tag)
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    // Note 1 (#intro, pinned) may or may not appear — check any pinned non-tag-pinned note
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#guide new note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p"); // pin with first tag #guide

    // Now create another pinned note whose first tag is NOT #guide
    await page.keyboard.press("c");
    const editor2 = page.getByTestId("content-pane").getByRole("textbox");
    await editor2.fill("#other has #guide too");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p");

    await page.keyboard.press("/");
    await searchInput.fill("#guide");
    await page.keyboard.press("Enter");

    // #other note is pinned but not tag-pinned for #guide → ○
    const otherNote = page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "#other has #guide too" });
    const otherTitle = await otherNote.getByTestId("note-item-title").textContent();
    expect(otherTitle).toMatch(/^○/);
  });

  test("tag-pinned note shows # when its first tag matches the active filter", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#ideas Master ideas note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p"); // pin — first tag is #ideas

    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#ideas");
    await page.keyboard.press("Enter");

    const first = page.getByTestId("list-pane").getByTestId("note-item").first();
    const title = await first.getByTestId("note-item-title").textContent();
    expect(title).toMatch(/^#/);
  });

  test("tag-pinned note switches from # back to ○ when filter is cleared", async ({ page }) => {
    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("#ideas Master ideas note");
    await page.keyboard.press("Escape");
    await page.keyboard.press("p");

    // Apply filter
    await page.keyboard.press("/");
    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await searchInput.fill("#ideas");
    await page.keyboard.press("Enter");

    const noteItem = page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "Master ideas note" });
    const titleWithFilter = await noteItem.getByTestId("note-item-title").textContent();
    expect(titleWithFilter).toMatch(/^#/);

    // Clear filter
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    const titleNoFilter = await noteItem.getByTestId("note-item-title").textContent();
    expect(titleNoFilter).toMatch(/^○/);
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

test.describe("Delete note (Shift+D)", () => {
  test("Shift+D deletes the selected note", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const initialCount = await items.count();
    await page.keyboard.press("Shift+D");
    await expect(items).toHaveCount(initialCount - 1);
  });

  test("after deletion the next note is selected", async ({ page }) => {
    // Select first note, delete it — second note should become selected
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    await items.first().click();
    const secondTitle = await items.nth(1).getByTestId("note-item-title").textContent();
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+D");
    await expect(items.first().getByTestId("note-item-title")).toContainText(secondTitle!);
  });

  test("after deleting the last note the list is empty", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      await page.keyboard.press("Shift+D");
    }
    await expect(items).toHaveCount(0);
  });

  test("Shift+D does not fire in editing state", async ({ page }) => {
    const items = page.getByTestId("list-pane").getByTestId("note-item");
    const initialCount = await items.count();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.press("Shift+D");
    await page.keyboard.press("Escape");
    await expect(items).toHaveCount(initialCount);
  });

  test("Shift+D is listed in help overlay", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-overlay")).toContainText("Shift+D");
  });
});

test.describe("Task-move overlay (t+m)", () => {
  test("t+m opens the task-move overlay", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    await expect(page.getByTestId("task-move-overlay")).toBeVisible();
  });

  test("overlay lists all four task tags", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    const overlay = page.getByTestId("task-move-overlay");
    await expect(overlay).toContainText("#tasks-inbox");
    await expect(overlay).toContainText("#tasks-today");
    await expect(overlay).toContainText("#tasks-nearterm");
    await expect(overlay).toContainText("#tasks-longterm");
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
