import { test, expect } from "@playwright/test";

// Replaces the old mobile-block.spec.ts. notedude used to refuse to run on any mobile
// user-agent; it now renders a single-pane layout on narrow viewports instead (#108).

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };

test.describe("Mobile Support", () => {
  test("mobile user-agent reaches the login page instead of a block message", async ({
    browser,
  }) => {
    const context = await browser.newContext({ userAgent: MOBILE_UA, viewport: NARROW });
    const page = await context.newPage();
    await page.goto("/");

    await expect(page.getByTestId("mobile-block")).toHaveCount(0);
    await expect(page.getByTestId("login-screen")).toBeVisible();
    await expect(page.getByText("sign in with google")).toBeVisible();

    await context.close();
  });

  test("narrow viewport opens on the list pane only", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await expect(page.getByTestId("list-pane")).toBeVisible();
    await expect(page.getByTestId("content-pane")).toBeHidden();
    // The vertical rule between panes is meaningless in single-pane mode.
    await expect(page.getByTestId("divider")).toBeHidden();
  });

  test("tapping a note opens the content pane, and back returns to the list", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await page.getByTestId("note-item").first().click();
    await expect(page.getByTestId("content-pane")).toBeVisible();
    await expect(page.getByTestId("list-pane")).toBeHidden();

    await page.getByTestId("mobile-back").click();
    await expect(page.getByTestId("list-pane")).toBeVisible();
    await expect(page.getByTestId("content-pane")).toBeHidden();
  });

  test("the list's compose control is a terminal prompt, not a boxed button", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    const compose = page.getByTestId("mobile-compose");
    await expect(compose).toContainText("$ new note");
    // A prompt line: no border box, and it takes the row, bar the [keys] toggle, so the whole line is the tap target.
    expect(await compose.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
    const [row, bar] = await Promise.all([compose.boundingBox(), page.getByTestId("mobile-toolbar").boundingBox()]);
    expect(row!.width).toBeGreaterThan(bar!.width * 0.7); // the rest is the [keys] toggle
    expect(row!.height).toBeGreaterThanOrEqual(44); // a touch target
    await expect(page.getByTestId("mobile-cursor")).toBeVisible();
  });

  test("the note view's way back is a prompt too", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await page.getByTestId("note-item").first().click();
    await expect(page.getByTestId("mobile-back")).toContainText("$ cd ..");
  });

  test("compose button creates a note and opens it for editing", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const before = await page.getByTestId("note-item").count();

    await page.getByTestId("mobile-compose").click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(page.getByTestId("content-pane")).toBeVisible();

    await page.getByRole("textbox").fill("written on a phone");
    await page.getByTestId("mobile-back").click();

    await expect(page.getByTestId("list-pane")).toBeVisible();
    expect(await page.getByTestId("note-item").count()).toBe(before + 1);
    // Not necessarily first in the list: pinned notes sort above it.
    await expect(
      page.getByTestId("note-item").filter({ hasText: "written on a phone" })
    ).toHaveCount(1);
  });

  test("desktop viewport is unchanged: both panes, no mobile toolbar", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await expect(page.getByTestId("list-pane")).toBeVisible();
    await expect(page.getByTestId("content-pane")).toBeVisible();
    await expect(page.getByTestId("divider")).toBeVisible();
    await expect(page.getByTestId("mobile-compose")).toHaveCount(0);
    await expect(page.getByTestId("mobile-back")).toHaveCount(0);
  });

  test("tapping the search field makes it editable and focused inside the tap", async ({ page }) => {
    // iOS only raises the keyboard for an input that is focused, and not read-only, within
    // the gesture itself. The field starts read-only (it shows the filter in idle), so the
    // tap has to flip it and focus it synchronously rather than leave that to a later effect.
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const search = page.getByRole("searchbox");
    expect(await search.evaluate((el: HTMLInputElement) => el.readOnly)).toBe(true);

    const atClick = await search.evaluate((el: HTMLInputElement) => new Promise<{ readOnly: boolean; focused: boolean }>((resolve) => {
      el.addEventListener("click", () => queueMicrotask(() => resolve({
        readOnly: el.readOnly,
        focused: document.activeElement === el,
      })), { once: true });
      el.click();
    }));
    expect(atClick).toEqual({ readOnly: false, focused: true });
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
  });
});

test.describe("Mobile command keypad", () => {
  async function open(page: import("@playwright/test").Page) {
    await page.setViewportSize(NARROW);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await page.getByTestId("mobile-keys-toggle").click();
    await expect(page.getByTestId("command-keypad")).toBeVisible();
  }
  const key = (page: import("@playwright/test").Page, k: string) =>
    page.getByTestId("command-keypad").locator(`[data-key="${k}"]`);

  test("a toggle in the toolbar opens a keypad of command keys only", async ({ page }) => {
    await open(page);
    const keys = await page.getByTestId("command-keypad").locator("[data-key]").evaluateAll(
      (els) => els.map((e) => e.getAttribute("data-key")),
    );
    // Commands and nothing else: no alphabet to type with.
    expect(new Set(keys)).toEqual(new Set(
      ["c", "C", "e", "i", "/", "o", "?", "j", "k", "z", "Z", "p", "P", "Y", "t", "d", "n", "l", "m", "Escape", "Enter"],
    ));
    // Opening it never raises the native keyboard: nothing is focused for typing.
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toMatch(/INPUT|TEXTAREA/);
  });

  test("tapping j and k moves the selection, as the keys do", async ({ page }) => {
    await open(page);
    const items = page.getByTestId("note-item");
    await expect(items.first()).toHaveAttribute("data-selected", "true");
    // Whatever the second note is, j must select it and k must come back.
    await page.evaluate(() => { document.querySelectorAll("[data-testid=note-item]"); });
    if ((await items.count()) > 1) {
      await key(page, "j").click();
      await expect(items.nth(1)).toHaveAttribute("data-selected", "true");
      await key(page, "k").click();
      await expect(items.first()).toHaveAttribute("data-selected", "true");
    }
  });

  test("c composes, and the keypad steps aside for the editor", async ({ page }) => {
    await open(page);
    await key(page, "c").click();
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await expect(page.getByTestId("command-keypad")).toHaveCount(0);
  });

  test("a shifted key sends the shifted command", async ({ page }) => {
    await open(page);
    await key(page, "C").click(); // Shift+C: compose clean
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });

  test("chords work: t then t applies the #tasks-today filter", async ({ page }) => {
    await open(page);
    await key(page, "t").click();
    await key(page, "t").click();
    await expect(page.getByRole("searchbox")).toHaveValue(/tasks-today/);
  });

  test("the choice of an open keypad is remembered", async ({ page }) => {
    await open(page);
    await page.reload();
    await expect(page.getByTestId("command-keypad")).toBeVisible();
  });

  test("desktop has neither the toggle nor the keypad", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto("/test");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("mobile-keys-toggle")).toHaveCount(0);
    await expect(page.getByTestId("command-keypad")).toHaveCount(0);
  });
});
