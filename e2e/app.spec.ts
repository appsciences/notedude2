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
    await expect(title).toContainText("Welcome to NoteDude");
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
