import { test, expect, Page } from "@playwright/test";
import { clearEmulatorData } from "./emulator-setup";

const AUTH_EMULATOR = "http://127.0.0.1:9099";
const TEST_EMAIL = "test@notedude.test";
const TEST_PASSWORD = "password123";

// The auth emulator's bulk account delete in clearEmulatorData() is not synchronous with
// respect to a following signUp, so the re-create can race it and come back EMAIL_EXISTS.
// That is a success for our purposes — same credentials, and the uid's Firestore data has
// already been cleared, so the test still starts from a clean slate (#103).
async function createTestUser(retries = 10) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(
      `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, returnSecureToken: true }),
      }
    );
    if (res.ok) return;
    const body = await res.json().catch(() => null);
    if (body?.error?.message === "EMAIL_EXISTS") return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Failed to create test user after ${retries} attempts`);
}

async function signInViaPage(page: Page) {
  await page.evaluate(
    async ([email, password]: [string, string]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window as any).__testSignIn(email, password);
    },
    [TEST_EMAIL, TEST_PASSWORD] as [string, string]
  );
}

async function loadAndSignIn(page: Page, baseURL: string) {
  await page.goto(baseURL);
  await signInViaPage(page);
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle", { timeout: 10000 });
  await page.getByTestId("app").focus();
}

test.beforeEach(async () => {
  await clearEmulatorData();
  await createTestUser();
});

test("note persists across page reload (Firebase roundtrip)", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);

  // Create a note
  await page.keyboard.press("c");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  const editor = page.getByTestId("content-pane").getByRole("textbox");
  await editor.fill("Roundtrip test note\nThis should persist after reload.");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

  // Wait for Firestore write to flush
  await page.waitForTimeout(500);

  // Reload and sign in again (memory cache doesn't persist auth across reloads)
  await page.reload();
  await signInViaPage(page);
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle", { timeout: 10000 });

  // Note should still be there
  await expect(page.getByTestId("content-pane")).toContainText("Roundtrip test note");
});

test("welcome note is created on first login", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  // A fresh account has no notes — welcome note should be seeded automatically
  const items = page.getByTestId("list-pane").getByTestId("note-item");
  await expect(items).toHaveCount(1, { timeout: 5000 });
  await expect(page.getByTestId("content-pane")).toContainText("Greetings");
  await expect(page.getByTestId("content-pane")).toContainText("Press ⌘/ (Ctrl+/) for keyboard shortcuts.");
});

test("welcome note opens in read mode, not edit mode (first login)", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1, { timeout: 5000 });
  // The seeded welcome note must NOT auto-open in edit mode — it stays in read (idle) mode.
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  // Read mode shows no editor textbox.
  await expect(page.getByTestId("content-pane").getByRole("textbox")).toHaveCount(0);
});

test("⌘/ surfaces shortcuts even after entering edit mode on the welcome note", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1, { timeout: 5000 });
  // Reproduce the reported flow: user reflexively presses Enter and lands in edit mode.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  // ? would just type a literal "?" here, but ⌘/ still opens the shortcuts overlay.
  await page.keyboard.press("ControlOrMeta+/");
  await expect(page.getByTestId("help-overlay")).toBeVisible();
});

test("welcome note is not re-created on subsequent login", async ({ page, baseURL }) => {
  // First login — seeds welcome note
  await loadAndSignIn(page, baseURL!);
  await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1, { timeout: 5000 });

  // Create a second note
  await page.keyboard.press("c");
  const editor = page.getByTestId("content-pane").getByRole("textbox");
  await editor.fill("My own note");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Reload and sign in again
  await page.reload();
  await signInViaPage(page);
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle", { timeout: 10000 });

  // Should have exactly 2 notes — welcome + own — no duplicate welcome
  await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(2, { timeout: 5000 });
});

test("ll shortcut logs out the user", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  await page.keyboard.press("l");
  await page.keyboard.press("l");
  // After logout the app div should disappear and sign-in screen should appear
  await expect(page.getByTestId("app")).not.toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

type WriteResult = { ok: boolean; code?: string };

async function rawWriteNote(page: Page, noteId: string, data: Record<string, unknown>): Promise<WriteResult> {
  return page.evaluate(
    ([id, payload]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__testWriteNote(id, payload) as Promise<WriteResult>,
    [noteId, data] as [string, Record<string, unknown>]
  );
}

test("security rules: a valid note write is accepted", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  const res = await rawWriteNote(page, "valid-note", {
    content: "hello",
    pinned: false,
    tagPinned: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  });
  expect(res.ok).toBe(true);
});

test("security rules: a write with an unknown field is rejected", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  const res = await rawWriteNote(page, "evil-field-note", {
    content: "hello",
    pinned: false,
    tagPinned: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    archived: true, // not in the field whitelist
  });
  expect(res.ok).toBe(false);
  expect(res.code).toContain("permission-denied");
});

test("security rules: oversized content is rejected", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  const res = await rawWriteNote(page, "huge-note", {
    content: "x".repeat(100_001), // exceeds the 100k cap
    pinned: false,
    tagPinned: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  });
  expect(res.ok).toBe(false);
  expect(res.code).toContain("permission-denied");
});

test("security rules: a wrong-typed field is rejected", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  const res = await rawWriteNote(page, "bad-type-note", {
    content: "hello",
    pinned: "yes", // should be a boolean
    tagPinned: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  });
  expect(res.ok).toBe(false);
  expect(res.code).toContain("permission-denied");
});

test("note is visible in a new browser session (cross-session sync)", async ({ page, browser, baseURL }) => {
  // Session 1: create a note
  await loadAndSignIn(page, baseURL!);
  await page.keyboard.press("c");
  const editor = page.getByTestId("content-pane").getByRole("textbox");
  await editor.fill("Cross-session note\nShould appear in session 2.");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Session 2: new browser context (fresh state, no shared IndexedDB)
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await loadAndSignIn(page2, baseURL!);
  await expect(page2.getByTestId("content-pane")).toContainText("Cross-session note");
  await ctx2.close();
});

test("pinning does not clobber a concurrent content edit (lost-update regression, #74)", async ({
  browser,
  baseURL,
}) => {
  // Two tabs on the same account, both showing the seeded welcome note (one note,
  // always selected). Tab A edits the note's content; Tab B — with a stale snapshot —
  // toggles the pin. A pin toggle must be a field-level update that leaves `content`
  // untouched, so A's edit survives. Before the fix, B's pin wrote the whole document
  // from its stale snapshot and reverted A's edit.

  // Tab A — seeds and owns the welcome note.
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await loadAndSignIn(pageA, baseURL!);
  await expect(pageA.getByTestId("content-pane")).toContainText("Greetings");

  // Tab B — sees the same welcome note.
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await loadAndSignIn(pageB, baseURL!);
  await expect(pageB.getByTestId("content-pane")).toContainText("Greetings");

  // Take B offline so it stays stale (won't receive A's edit) and queues its own write.
  await ctxB.setOffline(true);

  // A edits the note's content and saves it to the server.
  await pageA.getByTestId("app").focus();
  await pageA.keyboard.press("j"); // ensure the (only) note is selected
  await pageA.keyboard.press("Enter"); // enter editing
  await expect(pageA.getByTestId("app")).toHaveAttribute("data-state", "editing");
  const editorA = pageA.getByTestId("content-pane").getByRole("textbox");
  await editorA.fill("EDITED BY A");
  await pageA.keyboard.press("Escape");
  await expect(pageA.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await pageA.waitForTimeout(900); // let the debounced write flush to the server

  // B (offline, still showing "Greetings") toggles the pin on the same note.
  await pageB.getByTestId("app").focus();
  await pageB.keyboard.press("j"); // ensure the note is selected
  await pageB.keyboard.press("p"); // pin -> queued offline write
  await pageB.waitForTimeout(300);

  // B reconnects; its queued pin write replays last.
  await ctxB.setOffline(false);
  await pageB.waitForTimeout(2000); // allow the queued write to sync

  // Authoritative check: reload A from the server. The content edit must have survived,
  // and the note must now be pinned (B's toggle applied).
  await pageA.reload();
  await signInViaPage(pageA);
  await expect(pageA.getByTestId("app")).toHaveAttribute("data-state", "idle", { timeout: 10000 });
  await expect(pageA.getByTestId("content-pane")).toContainText("EDITED BY A");
  await expect(pageA.getByTestId("content-pane")).not.toContainText("Greetings");
  await expect(pageA.getByTestId("list-pane").getByTestId("note-item").first()).toHaveAttribute(
    "data-pinned",
    "true"
  );

  await ctxA.close();
  await ctxB.close();
});

test("an untouched new note is never written to Firestore (#77)", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  // Wait for the seeded welcome note before touching anything
  await expect(page.getByTestId("note-item-title").filter({ hasText: "Greetings" }).first()).toBeVisible();

  // Create a note and leave it immediately, without typing anything
  await page.keyboard.press("c");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("note-item-title").filter({ hasText: "New Note" })).toHaveCount(0);

  // Give any (incorrectly) queued debounced write time to land, then reload.
  // Before the fix, `c` wrote an empty document straight away and it came back here.
  await page.waitForTimeout(900);
  await page.reload();
  await signInViaPage(page);
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle", { timeout: 10000 });
  // Wait for sync to actually land (a positive signal) before asserting the absence of a ghost
  await expect(page.getByTestId("note-item-title").filter({ hasText: "Greetings" }).first())
    .toBeVisible({ timeout: 15000 });
  // A persisted empty note comes back as "No Text Entered" (isNew is not persisted).
  // Asserted by title rather than by total count, which is hostage to the unrelated
  // welcome-note seeding race (#78).
  await expect(page.getByTestId("note-item-title").filter({ hasText: "No Text Entered" })).toHaveCount(0);
  await expect(page.getByTestId("note-item-title").filter({ hasText: "New Note" })).toHaveCount(0);
});

test("an untouched tag-seeded note is never written to Firestore (#99)", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  // Wait for the welcome note to settle before adding to it
  await expect(page.getByTestId("note-item-title").filter({ hasText: "Greetings" }).first()).toBeVisible();

  // Give ourselves a tag to filter by
  await page.keyboard.press("c");
  await page.getByTestId("content-pane").getByRole("textbox").fill("Alpha #work");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("note-item-title").filter({ hasText: "Alpha #work" }).first()).toBeVisible();

  // Filter by it, compose (inheriting #work), then bail out without typing
  await page.keyboard.press("/");
  await page.getByTestId("top-pane").getByRole("searchbox").fill("#work");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.keyboard.press("c");
  await expect(page.getByTestId("content-pane").getByRole("textbox")).toHaveValue(" #work");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

  await page.waitForTimeout(900);
  await page.reload();
  await signInViaPage(page);
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle", { timeout: 10000 });
  // Wait for sync to actually land (a positive signal) before asserting the absence of a ghost
  await expect(page.getByTestId("note-item-title").filter({ hasText: "Alpha #work" }).first())
    .toBeVisible({ timeout: 15000 });
  // A persisted tag-only note would come back titled exactly "#work". Asserted by title
  // rather than by total count, which is hostage to the welcome-note seeding race (#78).
  await expect(page.getByTestId("note-item-title").filter({ hasText: /^\s*#work\s*$/ })).toHaveCount(0);
  await expect(page.getByTestId("note-item-title").filter({ hasText: "New Note" })).toHaveCount(0);
});

test.describe("Signed-in layout stays put while searching (#124)", () => {
  test("the username + logout header never moves and the page never scrolls", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1, { timeout: 10000 });

    // Enough notes to overflow the viewport, one of them taller than the screen by itself
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("c");
      await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
      const body = i === 0 ? "\n" + Array.from({ length: 60 }, (_, l) => `line ${l}`).join("\n") : "";
      await page.getByTestId("content-pane").getByRole("textbox").fill(`Note ${i} #guide${body}`);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    }
    await page.waitForTimeout(500);

    const header = page.getByTestId("account-header");
    await expect(header).toContainText("logout");
    const idleBox = await header.boundingBox();
    expect(idleBox!.y).toBeGreaterThanOrEqual(0);

    const stillPut = async (label: string) => {
      const geom = await page.evaluate(() => ({
        scrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
        scrollY: window.scrollY,
      }));
      expect(geom.scrollH, `page must not overflow (${label})`).toBeLessThanOrEqual(geom.innerH);
      expect(geom.scrollY, `page must not be scrolled (${label})`).toBe(0);
      await expect(header).toBeVisible();
      const box = await header.boundingBox();
      expect(box!.y, `header must not move (${label})`).toBeCloseTo(idleBox!.y, 1);
    };

    await stillPut("idle with many notes");
    await page.keyboard.press("/");
    await page.getByTestId("top-pane").getByRole("searchbox").pressSequentially("#guide");
    await stillPut("tag dropdown open");
    await page.keyboard.press("Enter");
    await stillPut("filter applied");
    await page.keyboard.press("j");
    await stillPut("browsing after j");
    await page.keyboard.press("j");
    await stillPut("browsing after j j");
  });
});
