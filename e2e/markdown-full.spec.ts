import { test, expect, type Page } from "@playwright/test";

/**
 * The premium Markdown tier and the raw-source toggle, end to end (#12).
 *
 * Parsing is pinned down in `packages/ui/src/markdown-full.test.ts`. This checks the wiring:
 * that the read view actually draws each construct, that `m` swaps to the exact source and
 * back, and that a hostile link target never reaches an `href`.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const pane = (page: Page) => page.getByTestId("content-pane");
const editor = (page: Page) => pane(page).getByRole("textbox");

/** Composes a note with `content` and commits it, leaving the rendered view on screen. */
async function showNote(page: Page, content: string) {
  await page.keyboard.press("c");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  await editor(page).fill(content);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
}

test.describe("inline marks", () => {
  test("bold, italic, strike and code render without their markers", async ({ page }) => {
    await showNote(page, "Plan **bold** *ital* ~~gone~~ `x = 1`");
    await expect(pane(page).locator("strong")).toHaveText("bold");
    await expect(pane(page).locator("em")).toHaveText("ital");
    await expect(pane(page).locator("s")).toHaveText("gone");
    await expect(pane(page).getByTestId("md-code")).toHaveText("x = 1");
    await expect(pane(page)).not.toContainText("**");
  });

  test("snake_case words stay as typed", async ({ page }) => {
    await showNote(page, "call get_user_name now");
    await expect(pane(page)).toContainText("get_user_name");
    await expect(pane(page).locator("em")).toHaveCount(0);
  });

  test("a Markdown link opens its target in a new tab", async ({ page }) => {
    await showNote(page, "Read [the docs](https://example.com/docs)");
    const link = pane(page).getByRole("link", { name: "the docs" });
    await expect(link).toHaveAttribute("href", "https://example.com/docs");
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("a javascript: link is left as text, never an href", async ({ page }) => {
    await showNote(page, "Click [me](javascript:alert(1))");
    await expect(pane(page).getByRole("link")).toHaveCount(0);
    await expect(pane(page)).toContainText("[me](javascript:alert(1))");
  });
});

test.describe("blocks", () => {
  test("a fenced code block is verbatim — nothing inside it is rendered", async ({ page }) => {
    await showNote(page, "Snippet\n```ts\n# not a heading\n* not a list\n```");
    const block = pane(page).getByTestId("md-code-block");
    await expect(block).toHaveText("# not a heading\n* not a list");
    await expect(block).toHaveAttribute("data-lang", "ts");
    await expect(pane(page).getByTestId("md-heading")).toHaveCount(0);
  });

  test("quotes and rules", async ({ page }) => {
    await showNote(page, "Notes\n> someone said this\n---\nafter");
    await expect(pane(page).getByTestId("md-quote")).toHaveText("someone said this");
    await expect(pane(page).getByTestId("md-rule")).toHaveCount(1);
  });

  test("task items show boxes, and done ones are marked", async ({ page }) => {
    await showNote(page, "Shopping\n- [ ] milk\n- [x] eggs");
    const items = pane(page).getByTestId("md-list-item");
    await expect(items.nth(0)).toHaveAttribute("data-task", "open");
    await expect(items.nth(0)).toContainText("☐");
    await expect(items.nth(1)).toHaveAttribute("data-task", "done");
    await expect(items.nth(1)).toContainText("☑");
    await expect(pane(page)).not.toContainText("[ ]");
  });

  test("a pipe table renders as a table, with tags intact in its cells", async ({ page }) => {
    await showNote(page, "Stock\n| item | qty |\n|---|--:|\n| milk | 2 |\n| eggs #tasks-today | 12 |");
    const table = pane(page).getByTestId("md-table");
    await expect(table.locator("th")).toHaveText(["item", "qty"]);
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(table.locator("td").nth(2)).toHaveText("eggs #tasks-today");
    await expect(table.locator("td").nth(1)).toHaveCSS("text-align", "right");
  });
});

test.describe("raw source view", () => {
  const SRC = "# Title\n**bold** and [a](https://a.dev)";

  test("m shows the exact Markdown, and m again renders it", async ({ page }) => {
    await showNote(page, SRC);
    await expect(pane(page).getByTestId("md-heading")).toHaveText("Title");

    await page.keyboard.press("m");
    await expect(pane(page).getByTestId("note-source")).toHaveText(SRC);
    await expect(pane(page).getByTestId("md-heading")).toHaveCount(0);
    // Still read-only: no editor appeared.
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(editor(page)).toHaveCount(0);

    await page.keyboard.press("m");
    await expect(pane(page).getByTestId("note-source")).toHaveCount(0);
    await expect(pane(page).getByTestId("md-heading")).toHaveText("Title");
  });

  test("⇧⌘M toggles it too", async ({ page }) => {
    await showNote(page, SRC);
    await page.keyboard.press("Meta+Shift+KeyM");
    await expect(pane(page).getByTestId("note-source")).toBeVisible();
  });

  test("moving to another note returns to the rendered view", async ({ page }) => {
    await showNote(page, SRC);
    await page.keyboard.press("m");
    await expect(pane(page).getByTestId("note-source")).toBeVisible();
    await page.keyboard.press("j");
    await page.keyboard.press("k");
    await expect(pane(page).getByTestId("note-source")).toHaveCount(0);
  });

  test("t → m still opens the task-move dialog rather than toggling source", async ({ page }) => {
    await showNote(page, SRC);
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    await expect(pane(page).getByTestId("note-source")).toHaveCount(0);
  });
});

test.describe("note list", () => {
  test("a row strips inline marks from the title", async ({ page }) => {
    await showNote(page, "**Groceries** for _this_ week\nbody");
    await expect(
      page.getByTestId("list-pane").locator("[data-selected='true']").getByTestId("note-item-title")
    ).toHaveText("Groceries for this week");
  });
});
