import { describe, it, expect, afterEach, vi } from "vitest";
import { prefersRedirect } from "./sign-in-mode";

/**
 * The popup-vs-redirect decision behind #111: a popup never returns in an installed iOS
 * PWA, stranding the user on the login screen forever. Nothing covered this before #133,
 * and it cannot be covered from the E2E suite — Playwright cannot install a PWA.
 */

type MediaAnswers = Partial<Record<"standalone" | "coarse", boolean>>;

/** Installs a matchMedia that answers only the two queries this module asks about. */
function stubMatchMedia(answers: MediaAnswers) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches:
      query.includes("display-mode: standalone")
        ? !!answers.standalone
        : query.includes("pointer: coarse")
          ? !!answers.coarse
          : false,
  }));
}

function stubIosStandalone(value: boolean | undefined) {
  Object.defineProperty(window.navigator, "standalone", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  stubIosStandalone(undefined);
});

describe("prefersRedirect", () => {
  it("is false on a plain desktop browser — the popup is the better UX there", () => {
    stubMatchMedia({ standalone: false, coarse: false });
    expect(prefersRedirect()).toBe(false);
  });

  it("is true in an installed PWA reporting display-mode: standalone", () => {
    stubMatchMedia({ standalone: true, coarse: false });
    expect(prefersRedirect()).toBe(true);
  });

  it("is true on iOS Safari, which predates display-mode and sets navigator.standalone", () => {
    stubMatchMedia({ standalone: false, coarse: false });
    stubIosStandalone(true);
    expect(prefersRedirect()).toBe(true);
  });

  it("is true on a touch-first device (pointer: coarse)", () => {
    stubMatchMedia({ standalone: false, coarse: true });
    expect(prefersRedirect()).toBe(true);
  });

  it("keeps the popup on a touch-capable laptop driven by a mouse", () => {
    // `pointer: coarse` describes the *primary* input, so a touchscreen laptop still
    // reports a fine pointer and must not be pushed onto the redirect path.
    stubMatchMedia({ standalone: false, coarse: false });
    stubIosStandalone(false);
    expect(prefersRedirect()).toBe(false);
  });

  it("is true when both signals fire", () => {
    stubMatchMedia({ standalone: true, coarse: true });
    expect(prefersRedirect()).toBe(true);
  });

  it("returns a boolean, never undefined, when navigator.standalone is absent", () => {
    stubMatchMedia({ standalone: false, coarse: false });
    expect(prefersRedirect()).toBe(false);
    expect(typeof prefersRedirect()).toBe("boolean");
  });

  it("is false when there is no window at all (server render)", () => {
    vi.stubGlobal("window", undefined);
    expect(prefersRedirect()).toBe(false);
  });
});
