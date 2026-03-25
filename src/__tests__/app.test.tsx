import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "@/components/App";

// Helper to render with user-event
function setup() {
  const user = userEvent.setup();
  render(<App />);
  return { user };
}

describe("UI Layout", () => {
  test("renders three panes: search bar, list pane, and content pane", () => {
    setup();
    expect(screen.getByTestId("top-pane")).toBeInTheDocument();
    expect(screen.getByTestId("list-pane")).toBeInTheDocument();
    expect(screen.getByTestId("content-pane")).toBeInTheDocument();
  });

  test("top pane contains a search input", () => {
    setup();
    const topPane = screen.getByTestId("top-pane");
    expect(within(topPane).getByRole("searchbox")).toBeInTheDocument();
  });

  test("list pane displays note titles (first line of content)", () => {
    setup();
    const listPane = screen.getByTestId("list-pane");
    // Should show at least some note items
    const items = within(listPane).getAllByTestId("note-item");
    expect(items.length).toBeGreaterThan(0);
  });

  test("content pane displays the selected note content", () => {
    setup();
    const contentPane = screen.getByTestId("content-pane");
    expect(contentPane).toHaveTextContent(/.+/); // should have some content
  });

  test("selected note is visually highlighted in list pane", () => {
    setup();
    const listPane = screen.getByTestId("list-pane");
    const selectedItem = within(listPane).getByTestId("note-item-selected");
    expect(selectedItem).toBeInTheDocument();
  });
});

describe("Application States", () => {
  describe("Idle State (IS) - default on app launch", () => {
    test("app starts in idle state", () => {
      setup();
      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "idle");
    });

    test("first note is selected on initial load", () => {
      setup();
      const listPane = screen.getByTestId("list-pane");
      const items = within(listPane).getAllByTestId("note-item");
      expect(items[0]).toHaveAttribute("data-selected", "true");
    });

    test("content pane is read-only in idle state", () => {
      setup();
      const contentPane = screen.getByTestId("content-pane");
      const editor = within(contentPane).queryByRole("textbox");
      // Either no textbox, or it's read-only
      if (editor) {
        expect(editor).toHaveAttribute("readonly");
      }
    });
  });

  describe("Editing State (ES)", () => {
    test("pressing 'c' in idle creates a new note and enters editing state", async () => {
      const { user } = setup();
      await user.keyboard("c");

      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "editing");
      const listPane = screen.getByTestId("list-pane");
      const items = within(listPane).getAllByTestId("note-item");
      // New note should exist with default title
      expect(items[0]).toHaveTextContent("new message");
    });

    test("pressing Enter in idle state enters editing for selected note", async () => {
      const { user } = setup();
      await user.keyboard("{Enter}");

      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "editing");
      const contentPane = screen.getByTestId("content-pane");
      const editor = within(contentPane).getByRole("textbox");
      expect(editor).not.toHaveAttribute("readonly");
    });

    test("cursor is at end of content when entering edit via Enter", async () => {
      const { user } = setup();
      await user.keyboard("{Enter}");

      const contentPane = screen.getByTestId("content-pane");
      const editor = within(contentPane).getByRole("textbox") as HTMLTextAreaElement;
      expect(editor.selectionStart).toBe(editor.value.length);
    });

    test("content pane is editable in editing state", async () => {
      const { user } = setup();
      await user.keyboard("{Enter}");

      const contentPane = screen.getByTestId("content-pane");
      const editor = within(contentPane).getByRole("textbox");
      expect(editor).not.toHaveAttribute("readonly");
    });
  });

  describe("Search State (SS)", () => {
    test("pressing '/' in idle enters search state", async () => {
      const { user } = setup();
      await user.keyboard("/");

      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "search");
      const topPane = screen.getByTestId("top-pane");
      const searchInput = within(topPane).getByRole("searchbox");
      expect(searchInput).toHaveFocus();
    });
  });
});

describe("State Transitions & Keyboard Shortcuts", () => {
  describe("IS → ES via 'c' (new note)", () => {
    test("creates new note with title 'new message'", async () => {
      const { user } = setup();
      await user.keyboard("c");

      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "editing");
      const listPane = screen.getByTestId("list-pane");
      expect(within(listPane).getAllByTestId("note-item")[0]).toHaveTextContent("new message");
    });
  });

  describe("IS → ES via Enter (edit selected)", () => {
    test("selected note becomes editable", async () => {
      const { user } = setup();
      await user.keyboard("{Enter}");

      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "editing");
    });
  });

  describe("ES → IS via Esc (save and exit)", () => {
    test("pressing Esc in editing state saves and returns to idle", async () => {
      const { user } = setup();
      // Enter editing
      await user.keyboard("{Enter}");
      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "editing");

      // Type something
      const contentPane = screen.getByTestId("content-pane");
      const editor = within(contentPane).getByRole("textbox");
      await user.type(editor, " edited");

      // Exit editing
      await user.keyboard("{Escape}");
      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "idle");

      // Content should be saved
      expect(screen.getByTestId("content-pane")).toHaveTextContent(/edited/);
    });
  });

  describe("ES → IS via Cmd/Ctrl+Enter (save and exit)", () => {
    test("pressing Cmd+Enter in editing state saves and returns to idle", async () => {
      const { user } = setup();
      await user.keyboard("{Enter}");
      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "editing");

      await user.keyboard("{Meta>}{Enter}{/Meta}");
      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "idle");
    });
  });

  describe("IS → SS via '/' (search)", () => {
    test("search bar is focused", async () => {
      const { user } = setup();
      await user.keyboard("/");

      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "search");
      const searchInput = within(screen.getByTestId("top-pane")).getByRole("searchbox");
      expect(searchInput).toHaveFocus();
    });
  });

  describe("SS → IS via Enter (apply filter)", () => {
    test("filter is applied and returns to idle", async () => {
      const { user } = setup();
      // Enter search
      await user.keyboard("/");
      const searchInput = within(screen.getByTestId("top-pane")).getByRole("searchbox");
      await user.type(searchInput, "test query");
      await user.keyboard("{Enter}");

      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "idle");
      // Filter should be active — list pane should only show matching notes
    });
  });

  describe("SS → IS via Esc (clear filter)", () => {
    test("filter is cleared and returns to idle", async () => {
      const { user } = setup();
      // Enter search and type
      await user.keyboard("/");
      const searchInput = within(screen.getByTestId("top-pane")).getByRole("searchbox");
      await user.type(searchInput, "test query");
      await user.keyboard("{Enter}");

      // Now press Esc to clear
      await user.keyboard("{Escape}");
      expect(screen.getByTestId("app")).toHaveAttribute("data-state", "idle");
      // Search input should be empty
      expect(searchInput).toHaveValue("");
    });
  });

  describe("IS → IS via Esc (clear filter)", () => {
    test("Esc in idle clears any active filter", async () => {
      const { user } = setup();
      // Apply a filter first
      await user.keyboard("/");
      const searchInput = within(screen.getByTestId("top-pane")).getByRole("searchbox");
      await user.type(searchInput, "filter text");
      await user.keyboard("{Enter}");

      // Now in idle with filter active, press Esc
      await user.keyboard("{Escape}");
      expect(searchInput).toHaveValue("");
    });
  });
});

describe("Filtering Behavior", () => {
  test("only matching notes are shown when filter is active", async () => {
    const { user } = setup();
    const listPane = screen.getByTestId("list-pane");
    const initialCount = within(listPane).getAllByTestId("note-item").length;

    // Apply a filter that shouldn't match all notes
    await user.keyboard("/");
    const searchInput = within(screen.getByTestId("top-pane")).getByRole("searchbox");
    await user.type(searchInput, "nonexistent-filter-xyz");
    await user.keyboard("{Enter}");

    const filteredItems = within(listPane).queryAllByTestId("note-item");
    expect(filteredItems.length).toBeLessThan(initialCount);
  });
});

describe("Pinning Behavior", () => {
  test("pinned notes appear at the top of the list", () => {
    setup();
    // This test validates ordering — pinned notes should come first
    const listPane = screen.getByTestId("list-pane");
    const items = within(listPane).getAllByTestId("note-item");

    let seenUnpinned = false;
    items.forEach((item) => {
      const isPinned = item.getAttribute("data-pinned") === "true";
      if (!isPinned) seenUnpinned = true;
      if (isPinned && seenUnpinned) {
        throw new Error("Pinned note found after unpinned note");
      }
    });
  });
});
