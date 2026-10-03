import { test, expect, Page } from "@playwright/test";
import { clearEmulatorData } from "./emulator-setup";

// Launch-QA probes for data integrity against the Firebase emulator (run with
// FIREBASE_ROUNDTRIP=true). Each test pins a way a signed-in user could lose or corrupt notes.

const AUTH_EMULATOR = "http://127.0.0.1:9099";
const TEST_EMAIL = "test@notedude.test";
const TEST_PASSWORD = "password123";

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

async function signIn(page: Page) {
  await page.evaluate(
    async ([email, password]: [string, string]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (window as any).__testSignIn(email, password);
    },
    [TEST_EMAIL, TEST_PASSWORD] as [string, string]
  );
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle", { timeout: 10000 });
}

async function loadAndSignIn(page: Page, baseURL: string) {
  await page.goto(baseURL);
  await signIn(page);
  await page.getByTestId("app").focus();
}

async function reloadAndSignIn(page: Page) {
  await page.reload();
  await signIn(page);
  await expect(page.getByTestId("note-item-title").first()).toBeVisible({ timeout: 15000 });
}

async function seedNote(page: Page, content: string) {
  await expect(page.getByTestId("list-pane").getByTestId("note-item")).toHaveCount(1, { timeout: 10000 });
  await page.keyboard.press("c");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  await page.getByTestId("content-pane").getByRole("textbox").fill(content);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.waitForTimeout(800);
}

test.beforeEach(async () => {
  await clearEmulatorData();
  await createTestUser();
});

test("an edit to an existing note survives a reload", async ({ page, baseURL }) => {
  await loadAndSignIn(page, baseURL!);
  await seedNote(page, "Original text");
  await page.keyboard.press("e");
  const editor = page.getByTestId("content-pane").getByRole("textbox");
  await editor.fill("Original text, then edited");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  await reloadAndSignIn(page);
  await expect(page.getByTestId("note-item-title").filter({ hasText: "then edited" })).toHaveCount(1);
});

test("emptying an existing note and leaving does not bring back a 'No Text Entered' ghost (#184)", async ({ page, baseURL }) => {
  test.fail(true, "Known bug #184: the discard is local-only. Remove this once it is fixed.");
  await loadAndSignIn(page, baseURL!);
  await seedNote(page, "About to be emptied");
  await page.keyboard.press("e");
  await page.getByTestId("content-pane").getByRole("textbox").fill("");
  // Pause past the 500ms debounce so the empty content is written, the case #184 describes.
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.waitForTimeout(800);
  await reloadAndSignIn(page);
  await expect(page.getByTestId("note-item-title").filter({ hasText: "No Text Entered" })).toHaveCount(0);
});

test("typing then closing the tab inside the debounce window keeps the text", async ({ page, baseURL }) => {
  test.fail(true, "Known bug #198: no pagehide flush for the 500ms debounce. Remove this once it is fixed.");
  await loadAndSignIn(page, baseURL!);
  await seedNote(page, "Stable note");
  await page.keyboard.press("c");
  await page.getByTestId("content-pane").getByRole("textbox").fill("Typed just before close");
  // No Escape, no wait: reload immediately, as a closed tab or a crash would.
  await page.reload();
  await signIn(page);
  await expect(page.getByTestId("note-item-title").filter({ hasText: "Stable note" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("note-item-title").filter({ hasText: "Typed just before close" })).toHaveCount(1);
});

test("an edit made on one device appears on a second signed-in device", async ({ browser, baseURL }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await loadAndSignIn(a, baseURL!);
  await seedNote(a, "Shared note v1");
  await loadAndSignIn(b, baseURL!);
  await expect(b.getByTestId("note-item-title").filter({ hasText: "Shared note v1" })).toBeVisible({ timeout: 15000 });
  await a.keyboard.press("e");
  await a.getByTestId("content-pane").getByRole("textbox").fill("Shared note v2");
  await a.keyboard.press("Escape");
  await expect(b.getByTestId("note-item-title").filter({ hasText: "Shared note v2" })).toBeVisible({ timeout: 15000 });
  await ctxA.close();
  await ctxB.close();
});
