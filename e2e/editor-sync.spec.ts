import { test, expect, type Page } from "@playwright/test";

// More of #169's acceptance list, beyond the two races fixed in #205 (editor-caret.spec.ts):
// background work must not move the caret or drop text when it concerns a *different* note,
// when it re-sorts the list, or when the user switches notes before a save has gone out.
//
// /test has no Firestore, so snapshots are delivered with __testRemoteSnapshot.

const BODY = Array.from({ length: 40 }, (_, i) => `line ${i} lorem ipsum dolor sit amet`).join("\n");
const LONG = "Long note #long\n" + BODY;

interface RemoteNote {
  id: string;
  content: string;
  pinned: boolean;
  tagPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

const app = (page: Page) => page.getByTestId("app");
const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");
const items = (page: Page) => page.getByTestId("list-pane").getByTestId("note-item");

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(app(page)).toHaveAttribute("data-ready", "true");
  await page.waitForFunction(() => "__testRemoteSnapshot" in window);
  await app(page).focus();
});

async function createNote(page: Page, content: string) {
  await page.keyboard.press("c");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await editor(page).fill(content);
  await page.keyboard.press("Escape");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
}

async function deliverSnapshot(page: Page, notes: RemoteNote[]) {
  await page.evaluate((n) => {
    const hook = (window as unknown as { __testRemoteSnapshot?: (notes: unknown[]) => void }).__testRemoteSnapshot;
    if (!hook) throw new Error("no __testRemoteSnapshot hook");
    hook(n);
  }, notes);
}

async function selectedNoteId(page: Page): Promise<string> {
  const id = await page.getByTestId("list-pane").locator("[data-selected='true']").getAttribute("data-note-id");
  if (!id) throw new Error("selected note has no data-note-id");
  return id;
}

async function otherNoteId(page: Page, notThis: string): Promise<string> {
  const ids = await items(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-note-id") ?? ""));
  const other = ids.find((i) => i && i !== notThis);
  if (!other) throw new Error("no other note in the list");
  return other;
}

test.describe("Background work concerning other notes leaves the editor alone (#169)", () => {
  test("a snapshot that changes a different note keeps the text and caret", async ({ page }) => {
    await createNote(page, LONG);
    const id = await selectedNoteId(page);
    const other = await otherNoteId(page, id);
    await page.keyboard.press("e");
    const ed = editor(page);
    const pos = 200;
    await ed.evaluate((el: HTMLTextAreaElement, p) => el.setSelectionRange(p, p), pos);
    await page.keyboard.type("mid-edit ");
    const expected = LONG.slice(0, pos) + "mid-edit " + LONG.slice(pos);

    await deliverSnapshot(page, [
      { id: other, content: "Edited on another device", pinned: false, tagPinned: false, createdAt: 1, updatedAt: Date.now() + 10_000 },
    ]);

    await expect(ed).toHaveValue(expected);
    expect(await ed.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual([pos + 9, pos + 9]);
    expect(await selectedNoteId(page)).toBe(id);
  });

  test("a remote change that would re-sort the list does not swap the editor or move the caret", async ({ page }) => {
    await createNote(page, LONG);
    const id = await selectedNoteId(page);
    const other = await otherNoteId(page, id);
    await page.keyboard.press("e");
    const ed = editor(page);
    await ed.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(100, 100));
    await page.keyboard.type("typing ");
    const value = await ed.inputValue();

    // The other note becomes the most recently updated, so it sorts above this one.
    await deliverSnapshot(page, [
      { id: other, content: "Now newest", pinned: false, tagPinned: false, createdAt: 1, updatedAt: Date.now() + 60_000 },
    ]);
    await page.keyboard.type("more");

    await expect(ed).toHaveValue(value.slice(0, 107) + "more" + value.slice(107));
    expect(await selectedNoteId(page)).toBe(id);
    await expect(app(page)).toHaveAttribute("data-state", "editing");
  });
});

test.describe("Typing is never lost on the way out of the editor (#169)", () => {
  test("clicking another note straight after typing keeps what was typed", async ({ page }) => {
    await createNote(page, "First note body");
    await createNote(page, "Second note body");
    await page.getByTestId("note-item").filter({ hasText: "First note body" }).click();
    await page.keyboard.press("e");
    await page.keyboard.type(" plus typed");
    // No pause: the debounced save has not fired yet.
    await page.getByTestId("note-item").filter({ hasText: "Second note body" }).click();
    await page.getByTestId("note-item").filter({ hasText: "First note body" }).click();

    await expect(page.getByTestId("content-pane")).toContainText("First note body plus typed");
  });

  test("Esc straight after typing keeps what was typed", async ({ page }) => {
    await createNote(page, "Quick note");
    await page.keyboard.press("e");
    await page.keyboard.type(" quickly");
    await page.keyboard.press("Escape");
    await expect(app(page)).toHaveAttribute("data-state", "idle");

    await expect(page.getByTestId("content-pane")).toContainText("Quick note quickly");
  });
});
