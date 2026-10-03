import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Export / Import (#16). The user's only copy of their notes lives in the app; Shift+E
// downloads a versioned JSON backup and Shift+I reads one back in, merging without ever
// overwriting. The pure format/merge rules are unit-tested in src/lib/backup.test.ts —
// these tests cover the wiring: the keys, the download, the file picker, the summary,
// and the demo-mode persistence path.

const items = (page: Page) => page.getByTestId("list-pane").getByTestId("note-item");
const modeLine = (page: Page) => page.getByTestId("mode-line");

interface FileNote {
  id: string;
  content: string;
  pinned: boolean;
  tagPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

const backup = (notes: FileNote[], over: Record<string, unknown> = {}) =>
  Buffer.from(JSON.stringify({ format: "notedude-backup", version: 1, exportedAt: "2026-10-02T00:00:00.000Z", notes, ...over }));

const file = (buffer: Buffer, name = "notedude-2026-10-02.json") => ({ name, mimeType: "application/json", buffer });

async function openTestPage(page: Page) {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
}

async function exportViaKeyboard(page: Page) {
  const download = page.waitForEvent("download");
  await page.keyboard.press("Shift+E");
  const d = await download;
  const path = await d.path();
  return { name: d.suggestedFilename(), json: JSON.parse(await readFile(path!, "utf8")) };
}

async function importViaKeyboard(page: Page, buffer: Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Shift+I");
  await (await chooser).setFiles(file(buffer));
}

test.describe("Export (#16)", () => {
  test("Shift+E downloads every note as a versioned backup", async ({ page }) => {
    await openTestPage(page);
    // Archive one so the export demonstrably includes archived notes.
    await page.keyboard.press("Shift+Y");
    const { name, json } = await exportViaKeyboard(page);

    expect(name).toMatch(/^notedude-\d{4}-\d{2}-\d{2}\.json$/);
    expect(json.format).toBe("notedude-backup");
    expect(json.version).toBe(1);
    expect(typeof json.exportedAt).toBe("string");
    expect(json.notes).toHaveLength(7);
    expect(json.notes.some((n: FileNote) => /#archived/.test(n.content))).toBe(true);
    const welcome = json.notes.find((n: FileNote) => n.id === "1");
    expect(welcome).toEqual({ id: "1", content: expect.stringContaining("#intro"), pinned: true, tagPinned: false, createdAt: 1, updatedAt: expect.any(Number) });
    await expect(modeLine(page)).toHaveText("exported 7 notes");
  });

  test("the mode-line message clears on the next key press", async ({ page }) => {
    await openTestPage(page);
    await exportViaKeyboard(page);
    await expect(modeLine(page)).toHaveText("exported 7 notes");
    await page.keyboard.press("j");
    await expect(modeLine(page)).toHaveText("");
  });

  test("Shift+E types a capital E while editing instead of exporting", async ({ page }) => {
    await openTestPage(page);
    let downloaded = false;
    page.on("download", () => { downloaded = true; });
    await page.keyboard.press("e");
    await page.keyboard.press("Shift+E");
    await expect(page.getByTestId("content-pane").getByRole("textbox")).toHaveValue(/E$/);
    expect(downloaded).toBe(false);
  });

  test("export and import are listed in the help overlay", async ({ page }) => {
    await openTestPage(page);
    await page.keyboard.press("?");
    const overlay = page.getByTestId("help-overlay");
    await expect(overlay).toContainText("Shift+E");
    await expect(overlay).toContainText("export");
    await expect(overlay).toContainText("Shift+I");
    await expect(overlay).toContainText("import");
  });
});

test.describe("Import (#16)", () => {
  test("Shift+I opens the file picker and adds the notes, tags intact", async ({ page }) => {
    await openTestPage(page);
    await expect(items(page)).toHaveCount(7);
    await importViaKeyboard(page, backup([
      { id: "imp-1", content: "Imported one #restored #work\nbody", pinned: false, tagPinned: false, createdAt: 50, updatedAt: 60 },
      { id: "imp-2", content: "Imported two #restored", pinned: false, tagPinned: false, createdAt: 40, updatedAt: 41 },
    ]));
    await expect(modeLine(page)).toHaveText("imported 2 notes");
    await expect(items(page)).toHaveCount(9);

    // The tag survived: filtering by it finds both imported notes.
    await page.keyboard.press("/");
    await page.keyboard.type("#restored");
    await page.keyboard.press("Enter");
    await expect(items(page)).toHaveCount(2);
  });

  test("a round trip skips identical notes and keeps changed ones as new notes", async ({ page }) => {
    await openTestPage(page);
    const { json } = await exportViaKeyboard(page);
    // Edit one note in the file: same id, different content.
    json.notes[0].content = "Changed elsewhere #intro";
    await importViaKeyboard(page, Buffer.from(JSON.stringify(json)));

    await expect(modeLine(page)).toHaveText("imported 1, skipped 6 duplicates");
    await expect(items(page)).toHaveCount(8);
    // Nothing was overwritten: the original is still there beside the imported copy.
    await expect(page.getByTestId("list-pane")).toContainText("Changed elsewhere");
  });

  test("an unknown version is rejected with a clear message and writes nothing", async ({ page }) => {
    await openTestPage(page);
    await importViaKeyboard(page, backup([
      { id: "x", content: "should not appear", pinned: false, tagPinned: false, createdAt: 1, updatedAt: 1 },
    ], { version: 99 }));
    await expect(modeLine(page)).toHaveText("import failed: unsupported backup version 99");
    await expect(items(page)).toHaveCount(7);
  });

  test("one bad note aborts the whole import", async ({ page }) => {
    await openTestPage(page);
    await importViaKeyboard(page, backup([
      { id: "ok", content: "fine", pinned: false, tagPinned: false, createdAt: 1, updatedAt: 1 },
      { id: "big", content: "a".repeat(100_001), pinned: false, tagPinned: false, createdAt: 1, updatedAt: 1 },
    ]));
    await expect(modeLine(page)).toContainText("import failed");
    await expect(modeLine(page)).toContainText("note 2");
    await expect(items(page)).toHaveCount(7);
  });

  test("a file that is not a backup is rejected", async ({ page }) => {
    await openTestPage(page);
    await importViaKeyboard(page, Buffer.from("hello, world"));
    await expect(modeLine(page)).toHaveText("import failed: not a notedude backup file");
  });
});

test.describe("Export / import in demo mode (#16)", () => {
  async function openDemo(page: Page) {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("notedude_demo_notes"));
    await page.reload();
    await expect(page.getByTestId("login-screen")).toBeVisible();
    await page.keyboard.press("d");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await page.getByTestId("app").focus();
  }

  test("imported notes persist to localStorage and survive a reload", async ({ page }) => {
    await openDemo(page);
    await importViaKeyboard(page, backup([
      { id: "kept", content: "Kept across reloads #restored", pinned: true, tagPinned: false, createdAt: 5, updatedAt: 6 },
    ]));
    await expect(modeLine(page)).toHaveText("imported 1 note");

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("notedude_demo_notes") ?? "[]"));
    expect(stored.find((n: FileNote) => n.id === "kept")).toMatchObject({ content: "Kept across reloads #restored", pinned: true });

    await page.reload();
    await expect(page.getByTestId("login-screen")).toBeVisible();
    await page.keyboard.press("d");
    await expect(page.getByTestId("list-pane")).toContainText("Kept across reloads");
  });

  test("the header export and import links work without a keyboard", async ({ page }) => {
    await openDemo(page);
    const download = page.waitForEvent("download");
    await page.getByTestId("export-link").click();
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^notedude-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(await readFile((await d.path())!, "utf8"));
    expect(json.notes.map((n: FileNote) => n.id)).toEqual(["demo-welcome"]);

    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("import-link").click();
    await (await chooser).setFiles(file(backup([
      { id: "clicked", content: "Imported by click", pinned: false, tagPinned: false, createdAt: 9, updatedAt: 9 },
    ])));
    await expect(page.getByTestId("list-pane")).toContainText("Imported by click");
  });
});
