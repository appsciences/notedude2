import { test, expect, Browser } from "@playwright/test";

// Which sign-in flow each client gets (#132).
//
// The popup is correct for every client except an iOS home-screen app, where it opens in a
// detached context that never returns a credential (#111). Routing *any* standalone client
// to `signInWithRedirect` silently broke the installed desktop PWA: the Google account
// chooser appeared, and choosing an account landed back on the login screen, signed out.
//
// These tests never complete a sign-in. They assert only the branch the app takes —
// `window.open` for the popup, a top-level navigation to the auth handler for the redirect.
// Both signals are recorded on the Node side, because the redirect branch tears down the
// page's execution context on its way out.

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

type Client = {
  /** `(display-mode: standalone)` — true for any installed PWA, desktop included. */
  standalone: boolean;
  /** `navigator.standalone`, which only iOS/iPadOS Safari defines. */
  iosStandalone?: boolean;
  /** `(pointer: coarse)` — the *primary* pointer, so a touch laptop is still false. */
  coarse?: boolean;
  /** iPadOS reports a Mac user-agent; touch points are what give it away. */
  touchPoints?: number;
};

/**
 * Open a page impersonating a client's install/input signals, and report which sign-in
 * branch it takes. Firebase validates the origin against the project config before it opens
 * anything, so that call is answered locally; every real auth navigation is aborted, which
 * still lets us observe that it was attempted.
 */
async function signInBranch(browser: Browser, userAgent: string, client: Client) {
  const context = await browser.newContext({ userAgent });
  const popups: string[] = [];
  const redirects: string[] = [];

  await context.exposeFunction("__reportPopup", (url: string) => {
    popups.push(url);
  });

  await context.addInitScript((c: Client) => {
    const real = window.matchMedia.bind(window);
    const mql = (media: string, matches: boolean) =>
      ({
        media,
        matches,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;

    window.matchMedia = (q: string) =>
      q.includes("display-mode: standalone")
        ? mql(q, c.standalone)
        : q.includes("pointer: coarse")
          ? mql(q, !!c.coarse)
          : real(q);

    if (c.iosStandalone) {
      Object.defineProperty(navigator, "standalone", { get: () => true, configurable: true });
    }
    Object.defineProperty(navigator, "maxTouchPoints", {
      get: () => c.touchPoints ?? 0,
      configurable: true,
    });

    // Record the popup attempt instead of really opening a window.
    window.open = ((url?: string | URL) => {
      (window as unknown as { __reportPopup: (u: string) => void }).__reportPopup(
        String(url ?? "")
      );
      return { closed: false, close() {}, focus() {} };
    }) as typeof window.open;
  }, client);

  const page = await context.newPage();
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame() && /__\/auth\/handler/.test(r.url())) {
      redirects.push(r.url());
    }
  });

  await page.route(/identitytoolkit|securetoken/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        projectId: "notedude2",
        authorizedDomains: ["localhost", "127.0.0.1", "notedude2.web.app"],
      }),
    })
  );
  await page.route(/__\/auth\/|emulator\/auth\/|accounts\.google\.com/, (route) => route.abort());

  await page.goto("/");
  await expect(page.getByTestId("login-screen")).toBeVisible();
  await page.getByRole("button", { name: /sign in with google/i }).click();

  await expect
    .poll(() => popups.length > 0 || redirects.length > 0, { timeout: 10_000 })
    .toBe(true);

  const branch = { openedPopup: popups.length > 0, redirected: redirects.length > 0 };
  await context.close();
  return branch;
}

test.describe("Sign-in flow selection", () => {
  test("installed desktop PWA uses the popup, not a redirect", async ({ browser }) => {
    // The #132 regression: standalone display mode alone used to force the redirect.
    expect(await signInBranch(browser, DESKTOP_UA, { standalone: true })).toEqual({
      openedPopup: true,
      redirected: false,
    });
  });

  test("ordinary desktop browser uses the popup", async ({ browser }) => {
    expect(await signInBranch(browser, DESKTOP_UA, { standalone: false })).toEqual({
      openedPopup: true,
      redirected: false,
    });
  });

  test("touch device in a browser tab uses the popup", async ({ browser }) => {
    // A coarse pointer on its own is not a reason to redirect; only an installed iOS app is.
    expect(
      await signInBranch(browser, IPHONE_UA, { standalone: false, coarse: true, touchPoints: 5 })
    ).toEqual({ openedPopup: true, redirected: false });
  });

  test("iOS home-screen app uses the redirect", async ({ browser }) => {
    expect(
      await signInBranch(browser, IPHONE_UA, {
        standalone: true,
        iosStandalone: true,
        coarse: true,
        touchPoints: 5,
      })
    ).toEqual({ openedPopup: false, redirected: true });
  });

  test("iPadOS home-screen app uses the redirect despite its Mac user-agent", async ({
    browser,
  }) => {
    expect(
      await signInBranch(browser, DESKTOP_UA, { standalone: true, coarse: true, touchPoints: 5 })
    ).toEqual({ openedPopup: false, redirected: true });
  });
});

test.describe("Sign-in failures are visible", () => {
  test("a failed sign-in reports itself instead of silently returning to the login screen", async ({
    page,
  }) => {
    // The #132 symptom was an invisible failure: errors were swallowed, so a broken
    // sign-in was indistinguishable from a button that did nothing.
    await page.route(/identitytoolkit|securetoken/, (route) => route.abort());
    await page.route(/__\/auth\/|accounts\.google\.com/, (route) => route.abort());

    await page.goto("/");
    await expect(page.getByTestId("login-screen")).toBeVisible();
    await page.getByRole("button", { name: /sign in with google/i }).click();

    await expect(page.getByTestId("login-error")).toBeVisible();
  });

  test("no error is shown before a sign-in is attempted", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("login-screen")).toBeVisible();
    await expect(page.getByTestId("login-error")).toHaveCount(0);
  });
});
