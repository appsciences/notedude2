import { test, expect, type Page } from "@playwright/test";

// Editing an existing note must never lose typing or move the caret behind the user's back
// (#169). Two races were found:
//
// 1. A Firestore snapshot overwrote the note under the editor. The merge keeps the local
//    copy only for the note it believes is being edited, and two routes into the editor —
//    ⌘[ / ⌘] history navigation and clicking another note in the list — never told it.
//    The echo of the user's own debounced save then landed after they had typed on, so the
//    newest characters vanished and the caret jumped to the end.
// 2. Rich-text paste replaced the textarea's whole value, which parks the caret at the end
//    of the note until a frame later; anything typed in that frame landed at the end.
//
// /test has no Firestore, so snapshots are delivered with __testRemoteSnapshot, which feeds
// the same merge the real subscription uses.

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

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
  // data-state is in the server-rendered markup; the hook only appears once the app's effects
  // — the keyboard handler among them — have run, so no keystroke below is lost to hydration.
  await page.waitForFunction(() => "__testRemoteSnapshot" in window);
  await app(page).focus();
});

/** Create the long note and return to idle with it selected. */
async function createLongNote(page: Page) {
  await page.keyboard.press("c");
  await expect(app(page)).toHaveAttribute("data-state", "editing");
  await editor(page).fill(LONG);
  await page.keyboard.press("Escape");
  await expect(app(page)).toHaveAttribute("data-state", "idle");
}

/**
 * Deliver a Firestore-style snapshot. A snapshot that omits a note leaves it alone (local-only
 * notes are kept), so listing just the note under test is enough.
 */
async function deliverSnapshot(page: Page, notes: RemoteNote[]) {
  await page.evaluate((n) => {
    const hook = (window as unknown as { __testRemoteSnapshot?: (notes: unknown[]) => void }).__testRemoteSnapshot;
    if (!hook) throw new Error("no __testRemoteSnapshot hook");
    hook(n);
  }, notes);
}

/**
 * Types in the middle of the note, then delivers the snapshot a debounced save would echo
 * back: the content as of part-way through the typing. The editor must keep everything.
 */
async function typeThenReceiveStaleEcho(page: Page, noteId: string) {
  const ed = editor(page);
  const pos = 200;
  await ed.evaluate((el: HTMLTextAreaElement, p) => el.setSelectionRange(p, p), pos);
  await page.keyboard.type("saved part ");
  const saved = await ed.inputValue();             // what the debounced save wrote
  await page.keyboard.type("typed after the save");  // typing while the write is in flight

  const expected = LONG.slice(0, pos) + "saved part typed after the save" + LONG.slice(pos);
  await expect(ed).toHaveValue(expected);

  await deliverSnapshot(page, [
    { id: noteId, content: saved, pinned: false, tagPinned: false, createdAt: 99, updatedAt: 99 },
  ]);

  await expect(ed).toHaveValue(expected);
  const caret = await ed.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]);
  const at = pos + "saved part typed after the save".length;
  expect(caret).toEqual([at, at]);
}

/** Id of the selected note. The list item carries it. */
async function selectedNoteId(page: Page): Promise<string> {
  const id = await page.getByTestId("list-pane").locator("[data-selected='true']").getAttribute("data-note-id");
  if (!id) throw new Error("selected note has no data-note-id");
  return id;
}

test.describe("Background snapshots never touch the note under the editor (#169)", () => {
  test("entered with e: a stale echo of the save keeps the typing and the caret", async ({ page }) => {
    await createLongNote(page);
    const id = await selectedNoteId(page);
    await page.keyboard.press("e");
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    await typeThenReceiveStaleEcho(page, id);
  });

  test("entered with ⌘[: a stale echo of the save keeps the typing and the caret", async ({ page }) => {
    await createLongNote(page);
    const id = await selectedNoteId(page);
    await page.keyboard.press("j");                 // move off it, so history has it behind us
    await page.keyboard.press("Meta+[");            // back into it — opens the editor
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    expect(await selectedNoteId(page)).toBe(id);
    await typeThenReceiveStaleEcho(page, id);
  });

  test("switched to by clicking the list mid-edit: a stale echo keeps the typing and the caret", async ({ page }) => {
    await createLongNote(page);
    const id = await selectedNoteId(page);
    await page.keyboard.press("j");
    await page.keyboard.press("e");                 // editing some other note
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    await page.getByTestId("note-item").filter({ hasText: "Long note" }).click();
    await expect(app(page)).toHaveAttribute("data-state", "editing");
    expect(await selectedNoteId(page)).toBe(id);
    await typeThenReceiveStaleEcho(page, id);
  });

  test("once editing ends, a snapshot is applied again", async ({ page }) => {
    await createLongNote(page);
    const id = await selectedNoteId(page);
    await deliverSnapshot(page, [
      { id, content: "Changed elsewhere", pinned: false, tagPinned: false, createdAt: 99, updatedAt: 99 },
    ]);
    await expect(page.getByTestId("content-pane")).toContainText("Changed elsewhere");
  });
});

test.describe("Rich-text paste keeps the caret where the paste ended (#169)", () => {
  test("the caret sits after the pasted text at once, so the next keystroke lands there", async ({ page }) => {
    await createLongNote(page);
    await page.keyboard.press("e");
    const ed = editor(page);
    const pos = 200;
    const result = await ed.evaluate((el: HTMLTextAreaElement, p) => {
      el.setSelectionRange(p, p);
      const dt = new DataTransfer();
      dt.setData("text/html", "<p>PASTED</p>");
      dt.setData("text/plain", "PASTED");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      // Synchronously, before any frame: this is where a keystroke typed right after ⌘V goes.
      return { caret: [el.selectionStart, el.selectionEnd] };
    }, pos);
    expect(result.caret).toEqual([pos + 6, pos + 6]);

    await page.keyboard.type("!");
    await expect(ed).toHaveValue(LONG.slice(0, pos) + "PASTED!" + LONG.slice(pos));
  });

  test("a rich-text paste replaces the selection", async ({ page }) => {
    await createLongNote(page);
    await page.keyboard.press("e");
    const ed = editor(page);
    await ed.evaluate((el: HTMLTextAreaElement) => {
      el.setSelectionRange(0, 9);                    // "Long note"
      const dt = new DataTransfer();
      dt.setData("text/html", "<b>Short</b>");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(ed).toHaveValue("Short" + LONG.slice(9));
  });
});

test.describe("Typing in the middle of a long note (#169)", () => {
  test("fast typing, a Markdown shortcut and Tab keep text and caret intact", async ({ page }) => {
    await createLongNote(page);
    await page.keyboard.press("e");
    const ed = editor(page);
    const lineStart = LONG.indexOf("line 5 ");
    const pos = lineStart + 4;                       // inside "line 5"
    await ed.evaluate((el: HTMLTextAreaElement, p) => el.setSelectionRange(p, p), pos);
    await page.keyboard.type("ABC", { delay: 0 });
    await page.keyboard.press("ControlOrMeta+Shift+Digit7"); // bulleted list: "* " prefix
    await page.keyboard.type("DEF", { delay: 0 });
    await page.keyboard.press("Tab");                // indents the list item
    await page.keyboard.type("GHI", { delay: 0 });

    const value = await ed.inputValue();
    const caret = await ed.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
    // Only the edited line changed, and every typed character survived in order.
    const before = LONG.slice(0, lineStart);
    expect(value.startsWith(before)).toBe(true);
    const line = value.slice(lineStart).split("\n")[0];
    expect(line.replace(/^\s*\* /, "")).toBe("lineABCDEFGHI 5 lorem ipsum dolor sit amet");
    expect(value.slice(lineStart + line.length)).toBe(LONG.slice(LONG.indexOf("\n", lineStart)));
    expect(value.slice(caret - 9, caret)).toBe("ABCDEFGHI");
  });
});
