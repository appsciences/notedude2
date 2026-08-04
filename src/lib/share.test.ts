import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PENDING_SHARE_KEY, composeSharedNote, takePendingShare } from "./share";

/**
 * Web Share Target plumbing (#110). The E2E suite drives the `/share` route end to end;
 * these cover the string arithmetic and the storage edge cases directly (#133).
 */

const params = (init: Record<string, string>) => new URLSearchParams(init);

describe("composeSharedNote", () => {
  it("returns empty string when nothing was shared", () => {
    expect(composeSharedNote(params({}))).toBe("");
  });

  it("uses the title alone", () => {
    expect(composeSharedNote(params({ title: "A headline" }))).toBe("A headline");
  });

  it("uses the text alone", () => {
    expect(composeSharedNote(params({ text: "some body" }))).toBe("some body");
  });

  it("uses the url alone", () => {
    expect(composeSharedNote(params({ url: "https://example.com" }))).toBe("https://example.com");
  });

  it("joins title, text and url in that order", () => {
    const out = composeSharedNote(
      params({ url: "https://example.com", title: "Headline", text: "Body" })
    );
    expect(out).toBe("Headline\nBody\nhttps://example.com");
  });

  it("drops blank and whitespace-only values", () => {
    expect(composeSharedNote(params({ title: "Headline", text: "   ", url: "" }))).toBe("Headline");
  });

  it("trims surrounding whitespace", () => {
    expect(composeSharedNote(params({ title: "  padded  " }))).toBe("padded");
  });

  it("collapses the duplicate Android sends when a link is shared as both text and url", () => {
    const link = "https://example.com/article";
    expect(composeSharedNote(params({ text: link, url: link }))).toBe(link);
  });

  it("keeps a url that differs from the text", () => {
    expect(composeSharedNote(params({ text: "read this", url: "https://example.com" }))).toBe(
      "read this\nhttps://example.com"
    );
  });
});

describe("takePendingShare", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when nothing is parked", () => {
    expect(takePendingShare()).toBeNull();
  });

  it("returns the parked share", () => {
    localStorage.setItem(PENDING_SHARE_KEY, "shared text");
    expect(takePendingShare()).toBe("shared text");
  });

  it("clears the share, so a reload cannot resurrect it", () => {
    localStorage.setItem(PENDING_SHARE_KEY, "shared text");
    takePendingShare();
    expect(localStorage.getItem(PENDING_SHARE_KEY)).toBeNull();
    expect(takePendingShare()).toBeNull();
  });

  it("treats a whitespace-only share as nothing, and still clears it", () => {
    localStorage.setItem(PENDING_SHARE_KEY, "   ");
    expect(takePendingShare()).toBeNull();
    expect(localStorage.getItem(PENDING_SHARE_KEY)).toBeNull();
  });

  it("returns null instead of throwing when storage is unavailable (private-mode Safari)", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(takePendingShare()).toBeNull();
  });
});
