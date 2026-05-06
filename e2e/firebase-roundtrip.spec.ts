import { test, expect, Page } from "@playwright/test";
import { clearEmulatorData } from "./emulator-setup";

const AUTH_EMULATOR = "http://127.0.0.1:9099";
const TEST_EMAIL = "test@notedude.test";
const TEST_PASSWORD = "password123";

async function createTestUser() {
  const res = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error(`Failed to create test user: ${res.status}`);
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
  const items = page.getByTestId("note-list").getByTestId("note-item");
  await expect(items).toHaveCount(1, { timeout: 5000 });
  await expect(page.getByTestId("content-pane")).toContainText("Greetings");
  await expect(page.getByTestId("content-pane")).toContainText("Press ? for keyboard shortcuts.");
});

test("welcome note is not re-created on subsequent login", async ({ page, baseURL }) => {
  // First login — seeds welcome note
  await loadAndSignIn(page, baseURL!);
  await expect(page.getByTestId("note-list").getByTestId("note-item")).toHaveCount(1, { timeout: 5000 });

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
  await expect(page.getByTestId("note-list").getByTestId("note-item")).toHaveCount(2, { timeout: 5000 });
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
