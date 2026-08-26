import { test, expect, type Page } from "@playwright/test";

// Tag substitution — delete / rename / merge (#163).
//
// The fixture (INITIAL_NOTES) carries the tags these tests lean on:
//   1 "Welcome to notedude #intro"        2 "Getting started #intro #guide"
//   3 "Keyboard shortcuts #guide"         4 "Tips #tips"
//   5 "Projects #project"                 6 "Archive #archive"
//   7 "Ideas #ideas"
// #intro spans two notes, and note 2 carries both #intro and #guide — which is what makes
// it the merge case.

test.beforeEach(async ({ page }) => {
  await page.goto("/test");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await page.getByTestId("app").focus();
});

/** Open the tag dropdown on `query` and highlight the first row. */
async function highlightTag(page: Page, query: string) {
  await page.keyboard.press("/");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
  await page.keyboard.type(query);
  await expect(page.getByTestId("tag-dropdown")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("tag-item").first()).toHaveAttribute("data-selected", "true");
}

/** Open the substitution prompt for the first tag matching `query`. */
async function openSubstitute(page: Page, query: string) {
  await highlightTag(page, query);
  await page.keyboard.press("Shift+Backspace");
  await expect(page.getByTestId("substitute-prompt")).toBeVisible();
}

/** Full text of the note whose title starts with `titlePrefix`, read from the content pane. */
async function contentOf(page: Page, titlePrefix: string): Promise<string> {
  await page.getByTestId("note-item").filter({ hasText: titlePrefix }).first().click();
  return (await page.getByTestId("content-pane").innerText()).trim();
}

/**
 * Escape out of the prompt all the way to idle: cancel the substitution, dismiss the tag
 * dropdown, then leave search. The dropdown matters — it overlays the top of the list pane,
 * so reading a note's content while it is still open can have the click intercepted.
 */
async function escapeToIdle(page: Page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("tag-dropdown")).toHaveCount(0);
}

/** Every tag currently offered as a suggestion. */
async function suggestedTags(page: Page): Promise<string[]> {
  await page.keyboard.press("/");
  await page.keyboard.type("#");
  await expect(page.getByTestId("tag-dropdown")).toBeVisible();
  const tags = await page.getByTestId("tag-item").allInnerTexts();
  // Three: dismiss the dropdown, leave search state, then the Esc-Esc that clears the filter —
  // otherwise a bare "#" is left applied as an invisible filter.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  return tags.map((t) => t.trim());
}

test.describe("Opening the prompt", () => {

  test("Shift+Backspace on a highlighted tag opens the substitution prompt", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "substitute");
    await expect(page.getByTestId("substitute-source")).toHaveText("#intro");
  });

  test("the prompt is anchored to the tag that was highlighted, not the typed query", async ({ page }) => {
    // "#g" highlights #guide; the source must be the whole tag, not the two characters typed.
    await openSubstitute(page, "#g");
    await expect(page.getByTestId("substitute-source")).toHaveText("#guide");
  });

  test("Shift+Backspace does nothing when no tag is highlighted", async ({ page }) => {
    await page.keyboard.press("/");
    await page.keyboard.type("#intro");
    await expect(page.getByTestId("tag-dropdown")).toBeVisible();
    // No ArrowDown — nothing is highlighted.
    await page.keyboard.press("Shift+Backspace");
    await expect(page.getByTestId("substitute-prompt")).toHaveCount(0);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "search");
  });

  test("the target input starts empty and the search input is reused for it", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await expect(page.getByTestId("top-pane").getByRole("searchbox")).toHaveValue("");
  });

  test("the dropdown becomes a target picker with a 'replace with' header", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await expect(page.getByTestId("tag-dropdown-header")).toHaveText(/replace with/i);
  });
});

test.describe("The hint states the outcome and the blast radius", () => {

  test("empty target reads as a removal, with the note count", async ({ page }) => {
    await openSubstitute(page, "#intro");
    // #intro is on notes 1 and 2.
    await expect(page.getByTestId("substitute-hint")).toHaveText(/remove from 2 notes/i);
  });

  test("a target no note carries reads as a rename", async ({ page }) => {
    await openSubstitute(page, "#tips");
    await page.keyboard.type("#hints");
    await expect(page.getByTestId("substitute-hint")).toHaveText(/rename to #hints/i);
  });

  test("a target that already exists reads as a merge", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#guide");
    await expect(page.getByTestId("substitute-hint")).toHaveText(/merge into #guide/i);
  });

  test("the hint updates live as the target is typed", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await expect(page.getByTestId("substitute-hint")).toHaveText(/remove from 2 notes/i);
    await page.keyboard.type("#hints");
    await expect(page.getByTestId("substitute-hint")).toHaveText(/rename to #hints/i);
  });
});

test.describe("Delete — an empty target", () => {

  test("strips the tag from every note that carried it", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    expect(await contentOf(page, "Welcome to notedude")).toBe(
      "Welcome to notedude\nYour keyboard-driven note app.",
    );
    // The note's other tag survives untouched.
    expect(await contentOf(page, "Getting started")).toContain("Getting started #guide");
  });

  test("the deleted tag stops being suggested", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    expect(await suggestedTags(page)).not.toContain("#intro");
  });

  test("untouched notes keep their tags", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const tags = await suggestedTags(page);
    expect(tags).toContain("#guide");
    expect(tags).toContain("#tips");
  });

  test("applying returns to idle and clears the query and filter", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("top-pane").getByRole("searchbox")).toHaveValue("");
    // Every note is listed again, so no invisible filter is left applied.
    expect(await page.getByTestId("note-item").count()).toBe(7);
  });

  test("a status line reports what happened and offers undo", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("status-line")).toHaveText(/removed #intro from 2 notes.*z to undo/i);
  });
});

test.describe("Rename — a target no note carries", () => {

  test("rewrites the tag in place, preserving its position in the text", async ({ page }) => {
    await openSubstitute(page, "#tips");
    await page.keyboard.type("#hints");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    expect(await contentOf(page, "Tips")).toBe("Tips #hints\nUse 'j' and 'k' to navigate.");
  });

  test("the old tag is gone from suggestions and the new one is offered", async ({ page }) => {
    await openSubstitute(page, "#tips");
    await page.keyboard.type("#hints");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    const tags = await suggestedTags(page);
    expect(tags).not.toContain("#tips");
    expect(tags).toContain("#hints");
  });

  test("a leading # may be omitted from the target", async ({ page }) => {
    await openSubstitute(page, "#tips");
    await page.keyboard.type("hints");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    expect(await contentOf(page, "Tips")).toContain("#hints");
  });

  test("renaming a tag that spans several notes rewrites all of them", async ({ page }) => {
    await openSubstitute(page, "#guide");
    await page.keyboard.type("#manual");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    expect(await contentOf(page, "Getting started")).toContain("#manual");
    expect(await contentOf(page, "Keyboard shortcuts")).toContain("Keyboard shortcuts #manual");
  });
});

test.describe("Merge — a target other notes already carry", () => {

  test("a note carrying both tags ends up with the target exactly once", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#guide");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    // "Getting started #intro #guide" must not become "... #guide #guide".
    expect(await contentOf(page, "Getting started")).toBe(
      "Getting started #guide\nPress 'c' to create a new note.\nPress '/' to search.",
    );
  });

  test("a note carrying only the source gets the target", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#guide");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    expect(await contentOf(page, "Welcome to notedude")).toBe(
      "Welcome to notedude #guide\nYour keyboard-driven note app.",
    );
  });

  test("the merged filter now matches every note from both tags", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#guide");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await page.keyboard.press("/");
    await page.keyboard.type("#guide");
    await page.keyboard.press("Enter");
    // Notes 1, 2 and 3 — the two former #intro notes plus the original #guide note.
    await expect(page.getByTestId("note-item")).toHaveCount(3);
  });

  test("a target can be picked by clicking a dropdown row", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.getByTestId("tag-item").filter({ hasText: "#guide" }).first().click();
    await expect(page.getByTestId("substitute-hint")).toHaveText(/merge into #guide/i);
  });
});

test.describe("Refusals", () => {

  test("#archived is rejected as a target", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#archived");
    await expect(page.getByTestId("substitute-hint")).toHaveText(/cannot rename into #archived/i);
    await page.keyboard.press("Enter");
    // Still in the prompt, and nothing was written.
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "substitute");
    await escapeToIdle(page);
    expect(await contentOf(page, "Welcome to notedude")).toContain("#intro");
  });

  test("a #tasks-* tag is rejected as a target", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#tasks-today");
    await expect(page.getByTestId("substitute-hint")).toHaveText(/cannot rename into #tasks-today/i);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "substitute");
  });

  test("a target containing whitespace is rejected", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("two words");
    await expect(page.getByTestId("substitute-hint")).toHaveText(/cannot contain spaces/i);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "substitute");
  });

  test("a target equal to the source is a no-op that closes the prompt", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#intro");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");
    expect(await contentOf(page, "Welcome to notedude")).toBe(
      "Welcome to notedude #intro\nYour keyboard-driven note app.",
    );
  });
});

test.describe("Cancelling", () => {

  test("Esc closes the prompt and restores the previous query", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#guide");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("substitute-prompt")).toHaveCount(0);
    await expect(page.getByTestId("top-pane").getByRole("searchbox")).toHaveValue("#intro");
  });

  test("Esc leaves every note untouched", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#guide");
    await escapeToIdle(page);
    expect(await contentOf(page, "Welcome to notedude")).toContain("#intro");
    expect(await contentOf(page, "Getting started")).toContain("#intro #guide");
  });
});

test.describe("Undo / redo", () => {

  test("z restores every note a deletion touched", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await page.getByTestId("app").focus();
    await page.keyboard.press("z");
    expect(await contentOf(page, "Welcome to notedude")).toContain("#intro");
    expect(await contentOf(page, "Getting started")).toContain("#intro #guide");
  });

  test("z restores every note a merge touched, duplicates and all", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.type("#guide");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await page.getByTestId("app").focus();
    await page.keyboard.press("z");
    // The note that carried both must get both back — the dedup is undone too.
    expect(await contentOf(page, "Getting started")).toBe(
      "Getting started #intro #guide\nPress 'c' to create a new note.\nPress '/' to search.",
    );
  });

  test("Shift+Z reapplies the substitution", async ({ page }) => {
    await openSubstitute(page, "#tips");
    await page.keyboard.type("#hints");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await page.getByTestId("app").focus();
    await page.keyboard.press("z");
    expect(await contentOf(page, "Tips")).toContain("#tips");

    await page.getByTestId("app").focus();
    await page.keyboard.press("Shift+Z");
    expect(await contentOf(page, "Tips")).toContain("#hints");
  });

  test("a note edited since the substitution is left alone by undo", async ({ page }) => {
    await openSubstitute(page, "#intro");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    // Edit note 1 after the substitution.
    await page.getByTestId("note-item").filter({ hasText: "Welcome to notedude" }).first().click();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.type(" EDITED");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "idle");

    await page.getByTestId("app").focus();
    await page.keyboard.press("z");

    // The edit survives — undo must not clobber it — while the untouched note reverses.
    expect(await contentOf(page, "Welcome to notedude")).toContain("EDITED");
    expect(await contentOf(page, "Welcome to notedude")).not.toContain("#intro");
    expect(await contentOf(page, "Getting started")).toContain("#intro #guide");
  });
});

test.describe("Layout stability", () => {

  test("opening the prompt does not make the document scrollable", async ({ page }) => {
    const before = await page.evaluate(() => document.documentElement.scrollHeight);
    await openSubstitute(page, "#intro");
    const after = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(after).toBe(before);
  });

  test("opening the prompt does not move the list pane", async ({ page }) => {
    await highlightTag(page, "#intro");
    const before = await page.getByTestId("list-pane").boundingBox();
    await page.keyboard.press("Shift+Backspace");
    await expect(page.getByTestId("substitute-prompt")).toBeVisible();
    const after = await page.getByTestId("list-pane").boundingBox();
    expect(after?.y).toBe(before?.y);
  });
});

test.describe("Not offered in the editor", () => {

  test("Shift+Backspace in the editor's tag popover does not open the prompt", async ({ page }) => {
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
    await page.keyboard.type(" #in");
    await expect(page.getByTestId("editor-tag-dropdown")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Shift+Backspace");
    await expect(page.getByTestId("substitute-prompt")).toHaveCount(0);
    await expect(page.getByTestId("app")).toHaveAttribute("data-state", "editing");
  });
});
