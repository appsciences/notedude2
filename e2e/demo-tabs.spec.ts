import { test, expect, type Page, type BrowserContext } from "@playwright/test";

// Two demo tabs share one localStorage array (#216). Each tab used to write its whole array
// on every change, so a stale tab saving note B put back its old copy of note A, and two tabs
// saving the same note silently kept only the last one. Both tabs here are fully in demo
// before either edits — a tab still on the sign-in screen holds no stale state.

const KEY = "notedude_demo_notes";

const seed = [
  { id: "qa-a", content: "QA tab A\nA base", pinned: false, tagPinned: false, createdAt: 10, updatedAt: 10 },
  { id: "qa-b", content: "QA tab B\nB base", pinned: false, tagPinned: false, createdAt: 11, updatedAt: 11 },
];

const app = (page: Page) => page.getByTestId("app");
const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");

async function enterDemo(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("login-screen")).toBeVisible();
  await page.keyboard.press("d");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
  await app(page).focus();
}

async function twoDemoTabs(context: BrowserContext) {
  const one = await context.newPage();
  await one.goto("/");
  await one.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(seed)]);
  await enterDemo(one);
  const two = await context.newPage();
  await enterDemo(two);
  for (const p of [one, two]) await expect(p.getByTestId("list-pane")).toContainText("QA tab B");
  return [one, two] as const;
}

/** Select the note titled `title`, append `text` in the editor and save with Escape. */
async function append(page: Page, title: string, text: string) {
  await page.bringToFront();
  await page.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: title }).click();
  await app(page).focus();
  await page.keyboard.press("e");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await editor(page).press("ControlOrMeta+End");
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
}

const stored = (page: Page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "[]") as { id: string; content: string }[], KEY);

test("a stale tab saving one note keeps another tab's saved edit to a different note", async ({ context }) => {
  const [one, two] = await twoDemoTabs(context);
  await append(one, "QA tab A", " A update");
  await append(two, "QA tab B", " B update");

  const notes = await stored(one);
  expect(notes.find((n) => n.id === "qa-a")?.content).toBe("QA tab A\nA base A update");
  expect(notes.find((n) => n.id === "qa-b")?.content).toBe("QA tab B\nB base B update");

  const fresh = await context.newPage();
  await enterDemo(fresh);
  await expect(fresh.getByTestId("list-pane")).toContainText("A update");
  await expect(fresh.getByTestId("list-pane")).toContainText("B update");
});

test("an edit saved in one tab shows up in the other without a reload", async ({ context }) => {
  const [one, two] = await twoDemoTabs(context);
  await append(one, "QA tab A", " A update");
  await two.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "QA tab A" }).click();
  await expect(two.getByTestId("content-pane")).toContainText("A base A update");
});

test("a note created in one tab is not removed by the other tab's next save", async ({ context }) => {
  const [one, two] = await twoDemoTabs(context);
  await one.bringToFront();
  await one.keyboard.press("c");
  await expect(app(one)).toHaveAttribute("data-state", "editing");
  await one.keyboard.type("Made in tab one");
  await one.keyboard.press("Escape");
  await append(two, "QA tab B", " B update");
  expect((await stored(one)).map((n) => n.content)).toContain("Made in tab one");
});

test("saving the same note in both tabs keeps both versions", async ({ context }) => {
  const [one, two] = await twoDemoTabs(context);
  // Open the note in tab two first, so it is stale when tab one saves under it.
  await two.bringToFront();
  await two.getByTestId("list-pane").getByTestId("note-item").filter({ hasText: "QA tab A" }).click();
  await app(two).focus();
  await two.keyboard.press("e");
  await expect(app(two)).toHaveAttribute("data-state", "editing");

  await append(one, "QA tab A", " FIRST_TAB");

  await two.bringToFront();
  await editor(two).press("ControlOrMeta+End");
  await two.keyboard.type(" SECOND_TAB");
  await two.keyboard.press("Escape");
  await expect(app(two)).toHaveAttribute("data-state", "idle");

  const contents = (await stored(two)).map((n) => n.content);
  expect(contents).toContain("QA tab A\nA base SECOND_TAB");
  expect(contents).toContain("QA tab A\nA base FIRST_TAB");
  await expect(two.getByTestId("mode-line")).toContainText("another tab");
});
