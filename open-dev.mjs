import { chromium } from "@playwright/test";

const AUTH_EMULATOR = "http://127.0.0.1:9099";
const TEST_EMAIL = "dev@notedude.test";
const TEST_PASSWORD = "password123";

// Create test user (ignore if exists)
await fetch(
  `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, returnSecureToken: true }),
  }
).catch(() => {});

const browser = await chromium.launch({ headless: false, slowMo: 0 });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://localhost:3001");

await page.waitForFunction(() => !!(window).__testSignIn, { timeout: 10000 });
await page.evaluate(async ([e, p]) => {
  await window.__testSignIn(e, p);
}, [TEST_EMAIL, TEST_PASSWORD]);

await page.waitForSelector('[data-testid="app"][data-state="idle"]', { timeout: 10000 });

console.log("App ready — browser will stay open. Ctrl+C to close.");
// Keep process alive
await new Promise(() => {});
