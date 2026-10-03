import { test, expect, Page } from "@playwright/test";
import { clearEmulatorData } from "./emulator-setup";
import { readFileSync } from "fs";
import { join } from "path";

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
  await page.keyboard.press("e");
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

async function rawUserPath(
  page: Page,
  segments: string[],
  data?: Record<string, unknown>
): Promise<WriteResult> {
  return page.evaluate(
    ([segs, payload]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__testUserPath(segs, payload) as Promise<WriteResult>,
    [segments, data] as [string[], Record<string, unknown> | undefined]
  );
}

test.describe("security rules: keepSync mappings are server-only (#142)", () => {
  // Keep-sync state at users/{uid}/keepSync/{noteId} is written solely by the Admin
  // SDK in mcp/, which bypasses rules. No rule grants the browser access, so
  // Firestore's default deny applies. These tests pin that down: forged mapping
  // state would let a client point a mapping at someone else's Keep note, and the
  // sync's replace path deletes whatever the mapping names — permanently.

  test("a client cannot write its own keepSync mapping", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    const res = await rawUserPath(page, ["keepSync", "n1"], {
      keepName: "notes/forged",
      baseHash: "deadbeef",
      lastSyncedAt: 1700000000000,
    });
    expect(res.ok).toBe(false);
    expect(res.code).toContain("permission-denied");
  });

  test("a client cannot read its own keepSync mapping", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    const res = await rawUserPath(page, ["keepSync", "n1"]);
    expect(res.ok).toBe(false);
    expect(res.code).toContain("permission-denied");
  });

  test("the notes collection still works, so the denials above mean something", async ({ page, baseURL }) => {
    // Control. Without it a broken rules file would make every assertion above pass.
    await loadAndSignIn(page, baseURL!);
    const res = await rawUserPath(page, ["notes", "control-note"], {
      content: "hello",
      pinned: false,
      tagPinned: false,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    });
    expect(res.ok).toBe(true);
  });
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
  await pageA.keyboard.press("e"); // enter editing
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

test.describe("Note actions round-trip through Firestore (#117, #118)", () => {
  // Gets past the seeded welcome note to a note with content we control.
  async function seedNote(page: Page, content: string) {
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1, { timeout: 10000 });
    await page.keyboard.press("c");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.getByTestId("content-pane").getByRole("textbox").fill(content);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await page.waitForTimeout(500);
  }

  async function reloadAndSignIn(page: Page) {
    await page.waitForTimeout(500);
    await page.reload();
    await signInViaPage(page);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle", { timeout: 10000 });
  }

  test("Shift+Y stores #archived exactly once (#118)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await seedNote(page, "Archive me");
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Y");
    await expect(page.locator("[data-testid='note-item'][data-archived='true']")).toHaveCount(1);

    await reloadAndSignIn(page);
    // Read the stored content back. The UI suite cannot catch a doubled tag: it renders
    // local state, which only ever had one. Firestore is where the duplicate showed up.
    await page.locator("[data-testid='note-item'][data-archived='true']").first().click();
    const content = await page.getByTestId("content-pane").textContent();
    expect(content).toContain("Archive me");
    expect(content!.match(/#archived/g) ?? []).toHaveLength(1);
  });

  test("undoing an archive persists the un-archive", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await seedNote(page, "Undo my archive");
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Y");
    await expect(page.locator("[data-testid='note-item'][data-archived='true']")).toHaveCount(1);
    await page.keyboard.press("z");
    await expect(page.locator("[data-testid='note-item'][data-archived='true']")).toHaveCount(0);

    await reloadAndSignIn(page);
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(2, { timeout: 10000 });
    await expect(page.locator("[data-testid='note-item'][data-archived='true']")).toHaveCount(0);
  });

  test("undoing a pin persists", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await seedNote(page, "Undo my pin");
    await page.getByTestId("app").focus();
    await page.keyboard.press("p");
    await expect(page.locator("[data-testid='note-item'][data-selected='true']")).toHaveAttribute("data-pinned", "true");
    await page.keyboard.press("z");
    await expect(page.locator("[data-testid='note-item'][data-selected='true']")).toHaveAttribute("data-pinned", "false");

    await reloadAndSignIn(page);
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(2, { timeout: 10000 });
    await expect(page.locator("[data-testid='note-item'][data-pinned='true']")).toHaveCount(0);
  });

  test("undoing a task move persists", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await seedNote(page, "Undo my task move");
    await page.getByTestId("app").focus();
    await page.keyboard.press("t");
    await page.keyboard.press("m");
    await expect(page.getByTestId("task-move-overlay")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("content-pane")).toContainText("#tasks-inbox");
    await page.keyboard.press("z");
    await expect(page.getByTestId("content-pane")).not.toContainText("#tasks-inbox");

    await reloadAndSignIn(page);
    await page.getByTestId("list-pane").getByTestId("note-item")
      .filter({ hasText: "Undo my task move" }).first().click();
    const content = await page.getByTestId("content-pane").textContent();
    expect(content).toContain("Undo my task move");
    expect(content).not.toContain("#tasks-");
  });

  test("dd permanently deletes an archived note (#174)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await seedNote(page, "Delete me for good");
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Y");
    const archived = page.locator("[data-testid='note-item'][data-archived='true']");
    await expect(archived).toHaveCount(1);
    await archived.first().click();
    await page.getByTestId("app").focus();
    await page.keyboard.press("d");
    await page.keyboard.press("d");
    await expect(archived).toHaveCount(0);

    await reloadAndSignIn(page);
    // Positive signal first (the welcome note synced), then the absence of the deleted one
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1, { timeout: 10000 });
    await expect(page.getByTestId("list-pane").getByTestId("note-item")
      .filter({ hasText: "Delete me for good" })).toHaveCount(0);
  });

  test("undoing a permanent delete persists the restored note (#174)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await seedNote(page, "Bring me back");
    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Y");
    const archived = page.locator("[data-testid='note-item'][data-archived='true']");
    await archived.first().click();
    await page.getByTestId("app").focus();
    await page.keyboard.press("d");
    await page.keyboard.press("d");
    await expect(archived).toHaveCount(0);
    await page.keyboard.press("z");
    await expect(archived).toHaveCount(1);

    await reloadAndSignIn(page);
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(2, { timeout: 10000 });
    await archived.first().click();
    const content = await page.getByTestId("content-pane").textContent();
    expect(content).toContain("Bring me back");
    expect(content!.match(/#archived/g) ?? []).toHaveLength(1);
  });
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

// --- Save reliability (#76, #198) ------------------------------------------------------
//
// A write the server rejects must be visible and must not cost the user their text; text typed
// inside the 500ms debounce must survive the tab going away. The rejection tests swap the
// emulator's rules for a deny-all set, which gives a genuine `permission-denied` from the real
// SDK — no stubbing.
test.describe("Save reliability (#76, #198)", () => {
  const FIRESTORE_EMULATOR = "http://127.0.0.1:8080";
  const PROJECT = "notedude2";
  const realRules = () => readFileSync(join(__dirname, "..", "firestore.rules"), "utf8");
  const DENY_WRITES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/notes/{noteId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }
  }
}`;

  async function setRules(content: string) {
    const res = await fetch(`${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT}:securityRules`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
    });
    if (!res.ok) throw new Error(`could not set emulator rules: ${res.status} ${await res.text()}`);
  }

  /** Every note's content as the *server* holds it (owner access bypasses the rules). */
  async function serverContents(): Promise<string[]> {
    const res = await fetch(
      `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "notes", allDescendants: true }] } }),
      }
    );
    const rows = (await res.json()) as { document?: { fields: { content?: { stringValue?: string } } } }[];
    return rows.filter((r) => r.document).map((r) => r.document!.fields.content?.stringValue ?? "");
  }

  const app = (page: Page) => page.getByTestId("app");
  const editor = (page: Page) => page.getByTestId("content-pane").getByRole("textbox");
  const saveStatus = (page: Page) => page.getByTestId("save-status");

  async function waitForWelcome(page: Page) {
    await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1, { timeout: 10000 });
  }

  // Records whether any list row ever flashed "saved", so a test can assert it never did.
  async function watchFlashes(page: Page) {
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      w.__flashed = false;
      new MutationObserver(() => {
        if (document.querySelector("[data-testid='note-item'][data-flash='true']")) w.__flashed = true;
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-flash"] });
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flashed = (page: Page) => page.evaluate(() => (window as any).__flashed as boolean);

  test.afterEach(async () => {
    await setRules(realRules());
  });

  test("text typed inside the debounce window survives a reload (#198)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await page.keyboard.press("c");
    await editor(page).fill("Typed just before reload");
    // No Escape, no wait: reload at once, as a closed tab or a crash would.
    await page.reload();
    await signInViaPage(page);
    await expect(page.getByTestId("note-item-title").filter({ hasText: "Typed just before reload" }))
      .toHaveCount(1, { timeout: 15000 });
    // And it reaches the server, not just this device.
    await expect.poll(serverContents, { timeout: 10000 }).toContain("Typed just before reload");
  });

  test("text typed inside the debounce window survives closing the tab (#198)", async ({ page, context, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await page.keyboard.press("c");
    await editor(page).fill("Typed just before close");
    await page.close();
    const again = await context.newPage();
    await loadAndSignIn(again, baseURL!);
    await expect(again.getByTestId("note-item-title").filter({ hasText: "Typed just before close" }))
      .toHaveCount(1, { timeout: 15000 });
    await expect.poll(serverContents, { timeout: 10000 }).toContain("Typed just before close");
  });

  test("hiding the page flushes the pending write immediately (#198)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await page.keyboard.press("c");
    await editor(page).fill("Flushed on pagehide");
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    // Well inside the 500ms debounce, had it still been waiting.
    await expect.poll(serverContents, { timeout: 400, intervals: [50] }).toContain("Flushed on pagehide");
  });

  test("a rejected write is shown, keeps the text, never flashes saved, and retries (#76)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await page.keyboard.press("c");
    await editor(page).fill("Original");
    await page.keyboard.press("Escape");
    await expect.poll(serverContents, { timeout: 10000 }).toContain("Original");

    await setRules(DENY_WRITES);
    await watchFlashes(page);
    await page.keyboard.press("e");
    await editor(page).fill("Edited while writes are refused");
    await page.keyboard.press("Escape");
    await expect(app(page)).toHaveAttribute("data-state", "idle");

    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "error", { timeout: 10000 });
    await expect(saveStatus(page)).toContainText("couldn't save");
    await expect(saveStatus(page)).toHaveAttribute("title", /permission-denied/);
    // The SDK rolls its cache back to the server copy; the screen must not follow it.
    await page.waitForTimeout(500);
    await expect(page.getByTestId("content-pane")).toContainText("Edited while writes are refused");
    await expect(page.getByTestId("note-item-title").filter({ hasText: "Edited while writes are refused" })).toHaveCount(1);
    expect(await flashed(page)).toBe(false);
    expect(await serverContents()).not.toContain("Edited while writes are refused");

    // Writes are accepted again; reconnecting triggers the retry.
    await setRules(realRules());
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "saved", { timeout: 10000 });
    await expect(saveStatus(page)).toHaveText("");
    await expect.poll(serverContents, { timeout: 10000 }).toContain("Edited while writes are refused");
  });

  test("a rejected edit is still there after a reload, and syncs once writes are accepted (#76)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await setRules(DENY_WRITES);
    await page.keyboard.press("c");
    await editor(page).fill("Refused then reloaded");
    await page.keyboard.press("Escape");
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "error", { timeout: 10000 });

    await setRules(realRules());
    await page.reload();
    await signInViaPage(page);
    await expect(page.getByTestId("note-item-title").filter({ hasText: "Refused then reloaded" }))
      .toHaveCount(1, { timeout: 15000 });
    await expect.poll(serverContents, { timeout: 10000 }).toContain("Refused then reloaded");
  });

  test("the saved flash still shows once the server acknowledges the write (#76)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await page.keyboard.press("c");
    await editor(page).fill("Acknowledged note");
    await page.keyboard.press("Escape");
    const row = page.locator("[data-testid='note-item'][data-selected='true']");
    await expect(row).toHaveAttribute("data-flash", "true");
    await expect.poll(serverContents).toContain("Acknowledged note");
  });

  test("a note over 100,000 characters is not sent, the user is told, and the text stays (#76)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    const huge = "Huge note\n" + "x".repeat(100_001);
    await page.keyboard.press("c");
    await editor(page).fill(huge);
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "too-long", { timeout: 5000 });
    await expect(saveStatus(page)).toContainText("too long");
    await expect(saveStatus(page)).toContainText(`${huge.length}/100000`);
    await page.keyboard.press("Escape");
    await expect(app(page)).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("note-item-title").filter({ hasText: "Huge note" })).toHaveCount(1);
    await page.waitForTimeout(800);
    expect((await serverContents()).some((c) => c.startsWith("Huge note"))).toBe(false);

    // Kept on the device across a reload, and still flagged.
    await page.reload();
    await signInViaPage(page);
    await expect(page.getByTestId("note-item-title").filter({ hasText: "Huge note" })).toHaveCount(1, { timeout: 15000 });
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "too-long");

    // Shortening it under the cap syncs it and clears the warning.
    await page.getByTestId("note-item-title").filter({ hasText: "Huge note" }).click();
    await page.getByTestId("app").focus();
    await page.keyboard.press("e");
    await editor(page).fill("Huge note, trimmed");
    await page.keyboard.press("Escape");
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "saved", { timeout: 10000 });
    await expect.poll(serverContents, { timeout: 10000 }).toContain("Huge note, trimmed");
  });

  test("offline edits read as saved on this device, not as failures, and sync on reconnect", async ({ page, context, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await context.setOffline(true);
    await page.keyboard.press("c");
    await editor(page).fill("Written offline");
    await page.keyboard.press("Escape");
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "offline", { timeout: 5000 });
    await expect(saveStatus(page)).toContainText("will sync");
    await context.setOffline(false);
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "saved", { timeout: 30000 });
    await expect.poll(serverContents, { timeout: 10000 }).toContain("Written offline");
  });

  // Closing the tab while a change has not reached the server asks first (#228). The text is
  // safe on the device either way (journal, above); the prompt is about the *server* copy.
  // Playwright only raises the beforeunload dialog when asked to run the handlers.
  async function closeAndWatchForPrompt(page: Page): Promise<"prompted" | "closed"> {
    const prompt = page.waitForEvent("dialog", { timeout: 3000 }).then(
      async (d) => {
        expect(d.type()).toBe("beforeunload");
        await d.dismiss();
        return "prompted" as const;
      },
      () => null
    );
    const closed = page.waitForEvent("close", { timeout: 3000 }).then(() => "closed" as const, () => null);
    await page.close({ runBeforeUnload: true });
    return (await Promise.race([prompt, closed]))!;
  }

  test("closing the tab while offline with an unsynced edit asks first (#228)", async ({ page, context, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await context.setOffline(true);
    await page.keyboard.press("c");
    await editor(page).fill("Unsynced at close");
    await page.keyboard.press("Escape");
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "offline", { timeout: 5000 });
    expect(await closeAndWatchForPrompt(page)).toBe("prompted");
  });

  test("closing the tab after a rejected write asks first, and stops asking once it syncs (#228)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await setRules(DENY_WRITES);
    await page.keyboard.press("c");
    await editor(page).fill("Refused at close");
    await page.keyboard.press("Escape");
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "error", { timeout: 10000 });
    expect(await closeAndWatchForPrompt(page)).toBe("prompted");

    await setRules(realRules());
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "saved", { timeout: 10000 });
    expect(await closeAndWatchForPrompt(page)).toBe("closed");
  });

  test("closing the tab when everything is synced does not ask (#228)", async ({ page, baseURL }) => {
    await loadAndSignIn(page, baseURL!);
    await waitForWelcome(page);
    await page.keyboard.press("c");
    await editor(page).fill("Synced before close");
    await page.keyboard.press("Escape");
    await expect.poll(serverContents, { timeout: 10000 }).toContain("Synced before close");
    await expect(saveStatus(page)).toHaveAttribute("data-save-state", "saved");
    expect(await closeAndWatchForPrompt(page)).toBe("closed");
  });
});
