import { test, expect } from "@playwright/test";

/**
 * The `todude` build variant (#151).
 *
 * Both products come from one build here: `/test/todude` renders `App` with the todude
 * variant record, `/test` with the notedude one. That keeps a second product in the suite
 * without a second `next build` — the variant is a prop, and only `page.tsx` defaults it
 * to the build-time record.
 *
 * The seed data behind `/test/todude` deliberately contains plain, untagged notes as well
 * as tasks. That is the real shape of a shared account: both products read the same
 * `users/{uid}/notes` collection, so a todude user genuinely has notes todude must not show.
 */

const LISTS = ["#tasks-inbox", "#tasks-today", "#tasks-nearterm", "#tasks-longterm", "#tasks-done"];

// Seeded counts, from TODUDE_SEED in src/lib/variant.ts.
const COUNTS: Record<string, number> = {
  "#tasks-inbox": 1,
  "#tasks-today": 2,
  "#tasks-nearterm": 1,
  "#tasks-longterm": 1,
  "#tasks-done": 1,
};

const TOTAL_TASKS = Object.values(COUNTS).reduce((a, b) => a + b, 0);

test.beforeEach(async ({ page }) => {
  await page.goto("/test/todude");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

test.describe("List navigation", () => {
  test("renders a nav item for each of the five lists, in order", async ({ page }) => {
    const items = page.getByTestId("task-list-nav").getByTestId("task-list-nav-item");
    await expect(items).toHaveCount(5);
    for (let i = 0; i < LISTS.length; i++) {
      await expect(items.nth(i)).toHaveAttribute("data-tag", LISTS[i]);
    }
  });

  test("each list shows how many tasks it holds", async ({ page }) => {
    for (const tag of LISTS) {
      const item = page.getByTestId("task-list-nav").locator(`[data-tag="${tag}"]`);
      await expect(item).toHaveAttribute("data-count", String(COUNTS[tag]));
    }
  });

  test("the list matching the active filter is marked active", async ({ page }) => {
    const nav = page.getByTestId("task-list-nav");
    await expect(nav.locator('[data-tag="#tasks-today"]')).toHaveAttribute("data-active", "true");
    await expect(nav.locator('[data-tag="#tasks-inbox"]')).toHaveAttribute("data-active", "false");
  });

  test("clicking a list applies its filter", async ({ page }) => {
    await page.getByTestId("task-list-nav").locator('[data-tag="#tasks-longterm"]').click();

    const searchInput = page.getByTestId("top-pane").getByRole("searchbox");
    await expect(searchInput).toHaveValue("#tasks-longterm");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(
      COUNTS["#tasks-longterm"]
    );
  });

  test("the 't' chords drive the same nav state as a click", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("l");

    const nav = page.getByTestId("task-list-nav");
    await expect(nav.locator('[data-tag="#tasks-longterm"]')).toHaveAttribute("data-active", "true");
    await expect(nav.locator('[data-tag="#tasks-today"]')).toHaveAttribute("data-active", "false");
    await expect(page.getByTestId("top-pane").getByRole("searchbox")).toHaveValue("#tasks-longterm");
  });

  test("no list is active once the filter is cleared", async ({ page }) => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    const active = page.getByTestId("task-list-nav").locator('[data-active="true"]');
    await expect(active).toHaveCount(0);
  });
});

test.describe("Task scope", () => {
  test("opens filtered to the today list", async ({ page }) => {
    await expect(page.getByTestId("top-pane").getByRole("searchbox")).toHaveValue("#tasks-today");
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(
      COUNTS["#tasks-today"]
    );
  });

  test("notes carrying no task tag stay hidden even with no filter", async ({ page }) => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("top-pane").getByRole("searchbox")).toHaveValue("");

    const listPane = page.getByTestId("list-pane");
    await expect(listPane.getByTestId("note-item")).toHaveCount(TOTAL_TASKS);
    await expect(listPane).not.toContainText("Grocery list");
    await expect(listPane).not.toContainText("Meeting notes");
  });

  test("a task stays visible while its tag is being edited away, and goes once editing ends", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");

    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.fill("no longer a task at all");
    // Exempt while the editor is open — a task must never vanish out from under the cursor.
    await expect(page.getByTestId("list-pane")).toContainText("no longer a task");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("list-pane")).not.toContainText("no longer a task");
  });
});

test.describe("Creating tasks", () => {
  test("'c' creates a task in the active list", async ({ page }) => {
    await page.keyboard.press("t");
    await page.keyboard.press("n");

    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.pressSequentially("write the docs");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("list-pane")).toContainText("write the docs");
    await expect(page.getByTestId("task-list-nav").locator('[data-tag="#tasks-nearterm"]'))
      .toHaveAttribute("data-count", String(COUNTS["#tasks-nearterm"] + 1));
  });

  test("Shift+C clears the filter but still lands the task in a list", async ({ page }) => {
    // Shift+C deliberately drops the active filter, so without a fallback the new task
    // would carry no #tasks-* tag and be invisible the instant it was created.
    await page.keyboard.press("Shift+C");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.pressSequentially("caught by the fallback");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("content-pane")).toContainText("#tasks-inbox");
    await expect(page.getByTestId("task-list-nav").locator('[data-tag="#tasks-inbox"]'))
      .toHaveAttribute("data-count", String(COUNTS["#tasks-inbox"] + 1));
  });
});

test.describe("Branding", () => {
  test("shows the todude credit line", async ({ page }) => {
    await expect(page.getByTestId("app")).toContainText("todude");
  });
});

test.describe("The notedude variant is unaffected", () => {
  test("has no task list nav", async ({ page }) => {
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("task-list-nav")).toHaveCount(0);
  });

  test("opens unfiltered and shows untagged notes", async ({ page }) => {
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("top-pane").getByRole("searchbox")).toHaveValue("");
    await expect(page.getByTestId("list-pane")).toContainText("Welcome to notedude");
  });

  test("'c' does not force a task tag", async ({ page }) => {
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await page.getByTestId("app").focus();

    await page.keyboard.press("c");
    const editor = page.getByTestId("content-pane").getByRole("textbox");
    await editor.pressSequentially("a plain note");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("content-pane")).not.toContainText("#tasks-");
  });
});
