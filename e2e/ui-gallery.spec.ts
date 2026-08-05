import { test, expect, type Page } from "@playwright/test";

/**
 * Contract tests for @notedude/ui, driven through the gallery route at /test/ui.
 *
 * These cover what the library promises independently of the app: that every component
 * renders, that colours come from the active theme rather than being baked in, and that the
 * test ids the app's own suite depends on are emitted by the library now that the markup
 * lives here. The app-level suite in app.spec.ts remains the behavioural gate.
 */

const section = (page: Page, name: string) => page.getByTestId(`gallery-${name}`);

/** Resolved background of an element, as the browser computes it. */
async function bgOf(page: Page, testId: string): Promise<string> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
}

async function colorOf(page: Page, testId: string): Promise<string> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((el) => getComputedStyle(el as HTMLElement).color);
}

test.describe("@notedude/ui gallery", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test/ui");
    await expect(page.getByTestId("gallery")).toBeVisible();
  });

  test.describe("every component renders", () => {
    const names = [
      "buttons",
      "rule",
      "divider",
      "searchbar",
      "tag-dropdown-search",
      "tag-dropdown-editor",
      "note-list",
      "note-content",
      "note-editor",
      "help-overlay",
      "task-move-dialog",
      "task-list-nav",
      "mobile-toolbar",
      "footer",
      "account-header",
      "login-screen",
      "loading-screen",
    ];

    for (const name of names) {
      test(`${name} is present`, async ({ page }) => {
        await expect(section(page, name)).toBeVisible();
      });
    }
  });

  test.describe("test ids the app suite depends on", () => {
    test("NoteList emits list-pane, note-item and its two lines", async ({ page }) => {
      const list = section(page, "note-list");
      await expect(list.getByTestId("list-pane")).toBeVisible();
      await expect(list.getByTestId("note-item").first()).toBeVisible();
      await expect(list.getByTestId("note-item-title").first()).toBeVisible();
      await expect(list.getByTestId("note-item-meta").first()).toBeVisible();
    });

    test("NoteList emits archived-divider when archived notes are present", async ({ page }) => {
      await expect(section(page, "note-list").getByTestId("archived-divider")).toBeVisible();
    });

    test("search TagDropdown emits the unprefixed ids", async ({ page }) => {
      const d = section(page, "tag-dropdown-search");
      await expect(d.getByTestId("tag-dropdown")).toBeVisible();
      await expect(d.getByTestId("tag-item").first()).toBeVisible();
      await expect(d.getByTestId("tag-separator")).toBeVisible();
    });

    test("editor TagDropdown emits the editor-prefixed ids", async ({ page }) => {
      const d = section(page, "tag-dropdown-editor");
      await expect(d.getByTestId("editor-tag-dropdown")).toBeVisible();
      await expect(d.getByTestId("editor-tag-item").first()).toBeVisible();
      await expect(d.getByTestId("editor-tag-separator")).toBeVisible();
    });

    test("editor TagDropdown does not emit the search ids", async ({ page }) => {
      await expect(section(page, "tag-dropdown-editor").getByTestId("tag-dropdown")).toHaveCount(0);
    });

    test("overlays and chrome keep their ids", async ({ page }) => {
      await expect(section(page, "help-overlay").getByTestId("help-overlay")).toBeVisible();
      await expect(
        section(page, "task-move-dialog").getByTestId("task-move-overlay")
      ).toBeVisible();
      await expect(
        section(page, "task-move-dialog").getByTestId("task-move-item").first()
      ).toBeVisible();
      await expect(section(page, "mobile-toolbar").getByTestId("mobile-toolbar")).toBeVisible();
      await expect(section(page, "searchbar").getByTestId("top-pane")).toBeVisible();
      await expect(section(page, "divider").getByTestId("divider")).toBeVisible();
      await expect(section(page, "account-header").getByTestId("account-header")).toBeVisible();
      await expect(section(page, "login-screen").getByTestId("login-screen")).toBeVisible();
      await expect(section(page, "note-content").getByTestId("content-pane")).toBeVisible();
    });
  });

  test.describe("selection state", () => {
    test("the selected note row is marked and the others are not", async ({ page }) => {
      const items = section(page, "note-list").getByTestId("note-item");
      await expect(items.nth(0)).toHaveAttribute("data-selected", "true");
      await expect(items.nth(1)).toHaveAttribute("data-selected", "false");
    });

    test("pin state is exposed on the row", async ({ page }) => {
      const items = section(page, "note-list").getByTestId("note-item");
      await expect(items.nth(0)).toHaveAttribute("data-pinned", "true");
      await expect(items.nth(0)).toHaveAttribute("data-tagpinned", "false");
      await expect(items.nth(1)).toHaveAttribute("data-tagpinned", "true");
    });

    test("archived rows are marked archived", async ({ page }) => {
      const list = section(page, "note-list");
      await expect(list.getByTestId("note-item").last()).toHaveAttribute("data-archived", "true");
    });

    test("the highlighted tag row is marked selected", async ({ page }) => {
      const items = section(page, "tag-dropdown-search").getByTestId("tag-item");
      await expect(items.nth(0)).toHaveAttribute("data-selected", "true");
      await expect(items.nth(1)).toHaveAttribute("data-selected", "false");
    });
  });

  // The gallery resolves ?theme= after mount (see the route's comment), so these poll
  // rather than reading once.
  test.describe("theming", () => {
    test("dark is the default canvas", async ({ page }) => {
      // tokens.colors.bg.app.dark === #1a1a1a
      await expect.poll(() => bgOf(page, "gallery")).toBe("rgb(26, 26, 26)");
    });

    test("the light theme repaints the canvas", async ({ page }) => {
      await page.goto("/test/ui?theme=light");
      // tokens.colors.bg.app.light === #ffffff
      await expect.poll(() => bgOf(page, "gallery")).toBe("rgb(255, 255, 255)");
    });

    test("note metadata uses the muted pair, which differs per theme", async ({ page }) => {
      // colors.fg.muted — #999999 dark, #666666 light
      await expect.poll(() => colorOf(page, "note-item-meta")).toBe("rgb(153, 153, 153)");
      await page.goto("/test/ui?theme=light");
      await expect.poll(() => colorOf(page, "note-item-meta")).toBe("rgb(102, 102, 102)");
    });

    test("the footer grey is deliberately identical in both themes", async ({ page }) => {
      // The Footer draws no test id of its own, so target it the way the app suite does.
      const footerColor = () =>
        page
          .locator("text=notedude • an")
          .evaluate((el) => getComputedStyle(el as HTMLElement).color);

      // colors.fg.subtle — #888888 in both themes.
      await expect.poll(footerColor).toBe("rgb(136, 136, 136)");
      await page.goto("/test/ui?theme=light");
      await expect.poll(() => bgOf(page, "gallery")).toBe("rgb(255, 255, 255)");
      await expect.poll(footerColor).toBe("rgb(136, 136, 136)");
    });

    test("the selected row colour comes from the theme", async ({ page }) => {
      // colors.bg.selected — #3a3a6a dark, #e0e7ff light
      await expect.poll(() => bgOf(page, "note-item")).toBe("rgb(58, 58, 106)");
      await page.goto("/test/ui?theme=light");
      await expect.poll(() => bgOf(page, "note-item")).toBe("rgb(224, 231, 255)");
    });
  });

  test.describe("typography", () => {
    test("the library renders in the monospace face", async ({ page }) => {
      const family = await page
        .getByTestId("gallery")
        .evaluate((el) => getComputedStyle(el as HTMLElement).fontFamily);
      expect(family).toContain("Fira Code");
    });

    test("the pane divider is exactly one character wide", async ({ page }) => {
      const width = await page
        .getByTestId("divider")
        .evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
      const chWidth = await page.getByTestId("gallery").evaluate((el) => {
        const probe = document.createElement("span");
        probe.style.font = getComputedStyle(el as HTMLElement).font;
        probe.textContent = "0";
        document.body.appendChild(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return w;
      });
      expect(width).toBeCloseTo(chWidth, 0);
    });
  });

  test.describe("note text helpers", () => {
    test("a note titles from its first non-blank line", async ({ page }) => {
      await expect(
        section(page, "note-list").getByTestId("note-item-title").nth(2)
      ).toHaveText("buried title");
    });

    test("an untouched new note titles as New Note", async ({ page }) => {
      await expect(
        section(page, "note-list").getByTestId("note-item-title").nth(3)
      ).toHaveText("New Note");
    });

    test("a bare URL in note content becomes a new-tab link", async ({ page }) => {
      const link = section(page, "note-content").getByRole("link", { name: /example\.com/ });
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  test.describe("interaction", () => {
    test("clicking a note row reports the id", async ({ page }) => {
      await section(page, "note-list").getByTestId("note-item").nth(1).click();
      await expect(page.getByTestId("last-event")).toHaveText("select:n2");
    });

    test("clicking a search tag row reports the tag", async ({ page }) => {
      await section(page, "tag-dropdown-search").getByTestId("tag-item").nth(1).click();
      await expect(page.getByTestId("last-event")).toHaveText("tag:#guide");
    });

    test("the editor tag row commits on mousedown, keeping focus off the row", async ({ page }) => {
      // The app relies on this: a click would blur the textarea before the tag is inserted.
      await section(page, "tag-dropdown-editor")
        .getByTestId("editor-tag-item")
        .nth(0)
        .dispatchEvent("mousedown");
      await expect(page.getByTestId("last-event")).toHaveText("editor-tag:#intro");
    });

    test("a toolbar button reports its action", async ({ page }) => {
      await section(page, "mobile-toolbar").getByTestId("mobile-compose").click();
      await expect(page.getByTestId("last-event")).toHaveText("compose");
    });
  });
});
