import { test, expect, type Page } from "@playwright/test";

// Three-state checklists (#263): `- [ ]` todo, `- [/]` in progress, `- [x]` done.

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");
const pane = (page: Page) => page.getByTestId("content-pane");

async function composeNote(page: Page, content: string) {
  // The first keypress can land before hydration has bound the key handler, so retry it.
  await expect(async () => {
    if ((await page.getByTestId("app").getAttribute("data-state")) !== "editing") {
      await page.keyboard.press("c");
    }
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing", { timeout: 1000 });
  }).toPass();
  await editor(page).fill(content);
}

test.describe("checklist shortcuts", () => {
  test("⇧⌘L adds an unchecked box, and again removes the checklist", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+KeyL");
    await expect(editor(page)).toHaveValue("- [ ] milk");
    await page.keyboard.press("Meta+Shift+KeyL");
    await expect(editor(page)).toHaveValue("milk");
  });

  test("Ctrl works as well as Cmd", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Control+Shift+KeyL");
    await expect(editor(page)).toHaveValue("- [ ] milk");
  });

  test("⇧⌘T is the same action where the browser lets the page have it", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+KeyT");
    await expect(editor(page)).toHaveValue("- [ ] milk");
  });

  test("⇧⌘D marks done, and again unticks", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+KeyD");
    await expect(editor(page)).toHaveValue("- [x] milk");
    await page.keyboard.press("Meta+Shift+KeyD");
    await expect(editor(page)).toHaveValue("- [ ] milk");
  });

  test("⇧⌘I marks in progress, and again unticks", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+KeyI");
    await expect(editor(page)).toHaveValue("- [/] milk");
    await page.keyboard.press("Meta+Shift+KeyI");
    await expect(editor(page)).toHaveValue("- [ ] milk");
  });

  test("states move between each other directly", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+KeyI");
    await page.keyboard.press("Meta+Shift+KeyD");
    await expect(editor(page)).toHaveValue("- [x] milk");
    await page.keyboard.press("Meta+Shift+KeyI");
    await expect(editor(page)).toHaveValue("- [/] milk");
  });

  test("a selection across lines sets them all", async ({ page }) => {
    await composeNote(page, "a\nb\nc");
    await editor(page).press("Control+a");
    await page.keyboard.press("Meta+Shift+KeyD");
    await expect(editor(page)).toHaveValue("- [x] a\n- [x] b\n- [x] c");
  });

  test("Enter on a checklist item opens a fresh unchecked one", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+KeyD");
    await editor(page).press("End");
    await page.keyboard.press("Enter");
    await expect(editor(page)).toHaveValue("- [x] milk\n- [ ] ");
    await page.keyboard.press("Enter"); // empty item ends the list
    await expect(editor(page)).toHaveValue("- [x] milk\n");
  });

  test("the caret stays after the text, so typing goes on where it left off", async ({ page }) => {
    await composeNote(page, "milk");
    await page.keyboard.press("Meta+Shift+KeyL");
    await page.keyboard.type(" and eggs");
    await expect(editor(page)).toHaveValue("- [ ] milk and eggs");
  });
});

test.describe("checklist rendering", () => {
  test("all three states draw their own box, and none shows its source", async ({ page }) => {
    await composeNote(page, "Today\n- [ ] one\n- [/] two\n- [x] three");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const items = pane(page).getByTestId("md-list-item");
    await expect(items.nth(0)).toHaveAttribute("data-task", "open");
    await expect(items.nth(0)).toContainText("☐");
    await expect(items.nth(1)).toHaveAttribute("data-task", "progress");
    await expect(items.nth(1)).toContainText("◐");
    await expect(items.nth(2)).toHaveAttribute("data-task", "done");
    await expect(items.nth(2)).toContainText("☑");
    await expect(pane(page)).not.toContainText("[/]");
  });

  test("only done items are struck through; in progress reads as live work", async ({ page }) => {
    await composeNote(page, "- [/] two\n- [x] three");
    await page.keyboard.press("Escape");
    const items = pane(page).getByTestId("md-list-item");
    const strike = (n: number) => items.nth(n).evaluate((el) =>
      Array.from(el.querySelectorAll("span")).some((s) => getComputedStyle(s).textDecorationLine.includes("line-through")));
    expect(await strike(0)).toBe(false);
    expect(await strike(1)).toBe(true);
  });
});

test.describe("help", () => {
  test("the todude section lists the checklist keys", async ({ page }) => {
    await page.keyboard.press("Control+/");
    await expect(page.getByText(/mark it ◐ in progress/)).toBeVisible();
    await expect(page.getByText(/mark it ☑ done/)).toBeVisible();
  });
});
