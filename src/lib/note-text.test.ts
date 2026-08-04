import { describe, it, expect } from "vitest";
import {
  contentWithoutTags,
  inheritedTags,
  firstNonBlankIndex,
  getNoteTitle,
  getNoteMetaSnippet,
  sortNotes,
  isArchived,
  appendTag,
  stripTag,
  withTaskTag,
  withoutTaskTag,
  currentTaskTag,
  extractTags,
  getHashTokenBeforeCursor,
} from "./note-text";

describe("contentWithoutTags", () => {
  it("strips every tag and trims what is left", () => {
    expect(contentWithoutTags("Buy milk #errands #today")).toBe("Buy milk");
  });

  it("returns empty for a note holding nothing but tags", () => {
    expect(contentWithoutTags(" #guide #intro")).toBe("");
  });

  it("keeps a bare # that is not a tag", () => {
    expect(contentWithoutTags("issue # 4")).toBe("issue # 4");
  });

  it("treats hyphens as part of a tag", () => {
    expect(contentWithoutTags("x #tasks-today")).toBe("x");
  });
});

describe("inheritedTags", () => {
  it("returns the tags in a filter, lowercased", () => {
    expect(inheritedTags("#Guide #INTRO")).toEqual(["#guide", "#intro"]);
  });

  it("drops duplicates", () => {
    expect(inheritedTags("#guide #guide")).toEqual(["#guide"]);
  });

  it("ignores free-text terms", () => {
    expect(inheritedTags("milk #errands bread")).toEqual(["#errands"]);
  });

  it("never inherits #archived — it would archive the note before a keystroke", () => {
    expect(inheritedTags("#archived #guide")).toEqual(["#guide"]);
  });

  it("returns nothing for a filter with no tags", () => {
    expect(inheritedTags("just text")).toEqual([]);
  });
});

describe("firstNonBlankIndex", () => {
  it("finds the first line with something on it", () => {
    expect(firstNonBlankIndex(["", "  ", "Title"])).toBe(2);
  });

  it("returns -1 when every line is blank", () => {
    expect(firstNonBlankIndex(["", "   ", "\t"])).toBe(-1);
  });
});

describe("getNoteTitle", () => {
  it("uses the first line", () => {
    expect(getNoteTitle({ content: "Shopping\nmilk" })).toBe("Shopping");
  });

  it("skips leading blank lines rather than reporting an empty note (#126)", () => {
    expect(getNoteTitle({ content: "\n\n  \nReal title\nbody" })).toBe("Real title");
  });

  it("says 'New Note' for an untouched note carrying only inherited tags", () => {
    expect(getNoteTitle({ content: " #guide", isNew: true })).toBe("New Note");
  });

  it("says 'No Text Entered' for a whitespace-only note that has been touched", () => {
    expect(getNoteTitle({ content: "   \n  ", isNew: false })).toBe("No Text Entered");
  });

  it("keeps the tag line as the title once a tag-only note is no longer new", () => {
    expect(getNoteTitle({ content: " #guide", isNew: false })).toBe(" #guide");
  });
});

describe("getNoteMetaSnippet", () => {
  it("shows the first non-blank line below the title", () => {
    expect(getNoteMetaSnippet({ content: "Title\n\nsecond" })).toBe("second");
  });

  it("is empty when the note is a single line", () => {
    expect(getNoteMetaSnippet({ content: "Only line" })).toBe("");
  });

  it("says 'No Content' when the note holds only tags", () => {
    expect(getNoteMetaSnippet({ content: " #guide #intro" })).toBe("No Content");
  });

  it("truncates past 30 characters with an ellipsis", () => {
    const long = "y".repeat(45);
    const snippet = getNoteMetaSnippet({ content: `Title\n${long}` });
    expect(snippet).toBe("y".repeat(30) + "…");
    expect(snippet).toHaveLength(31);
  });

  it("leaves exactly 30 characters alone", () => {
    const exact = "z".repeat(30);
    expect(getNoteMetaSnippet({ content: `Title\n${exact}` })).toBe(exact);
  });

  it("looks below the real title line when the note opens with blanks (#126)", () => {
    expect(getNoteMetaSnippet({ content: "\n\nTitle\nbody" })).toBe("body");
  });
});

describe("sortNotes", () => {
  const note = (id: string, pinned: boolean, createdAt: number) => ({ id, pinned, createdAt });

  it("puts pinned notes first", () => {
    const sorted = sortNotes([note("a", false, 3), note("b", true, 1)]);
    expect(sorted.map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("orders newest first within the same pin status", () => {
    const sorted = sortNotes([note("old", false, 1), note("new", false, 9)]);
    expect(sorted.map((n) => n.id)).toEqual(["new", "old"]);
  });

  it("orders pinned notes among themselves by recency too", () => {
    const sorted = sortNotes([note("p-old", true, 1), note("p-new", true, 5), note("plain", false, 9)]);
    expect(sorted.map((n) => n.id)).toEqual(["p-new", "p-old", "plain"]);
  });

  it("does not mutate the input", () => {
    const input = [note("a", false, 1), note("b", true, 2)];
    sortNotes(input);
    expect(input.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("isArchived", () => {
  it("matches the tag at end of content", () => {
    expect(isArchived({ content: "done #archived" })).toBe(true);
  });

  it("matches followed by punctuation or whitespace", () => {
    expect(isArchived({ content: "a #archived b" })).toBe(true);
    expect(isArchived({ content: "a #archived." })).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isArchived({ content: "a #Archived" })).toBe(true);
  });

  it("does not match a longer tag that merely starts with it", () => {
    expect(isArchived({ content: "a #archived-later" })).toBe(false);
  });

  it("is false for a note without the tag", () => {
    expect(isArchived({ content: "still active #guide" })).toBe(false);
  });
});

describe("tag arithmetic", () => {
  it("appendTag separates from existing text with one space", () => {
    expect(appendTag("Note", "#tag")).toBe("Note #tag");
  });

  it("appendTag adds no separator after a trailing newline", () => {
    expect(appendTag("Note\n", "#tag")).toBe("Note\n#tag");
  });

  it("appendTag adds no separator to empty content", () => {
    expect(appendTag("", "#tag")).toBe("#tag");
  });

  it("stripTag removes the tag and the space appendTag added", () => {
    expect(stripTag("Note #tag", "#tag")).toBe("Note");
  });

  it("append then strip is an exact round trip (#118)", () => {
    for (const content of ["Note", "Note\n", "", "Multi\nline note"]) {
      expect(stripTag(appendTag(content, "#archived"), "#archived")).toBe(content);
    }
  });

  it("stripTag leaves a longer tag that merely starts the same", () => {
    expect(stripTag("Note #tagged", "#tag")).toBe("Note #tagged");
  });
});

describe("task tags", () => {
  it("withTaskTag appends when the note has none", () => {
    expect(withTaskTag("Do it", "#tasks-today")).toBe("Do it #tasks-today");
  });

  it("withTaskTag replaces an existing task tag in place", () => {
    expect(withTaskTag("Do it #tasks-inbox now", "#tasks-today")).toBe("Do it #tasks-today now");
  });

  it("withTaskTag leaves non-task tags alone", () => {
    expect(withTaskTag("Do it #errands", "#tasks-today")).toBe("Do it #errands #tasks-today");
  });

  it("withoutTaskTag removes the task tag and its separator", () => {
    expect(withoutTaskTag("Do it #tasks-today")).toBe("Do it");
  });

  it("withoutTaskTag is a no-op when there is no task tag", () => {
    expect(withoutTaskTag("Do it #errands")).toBe("Do it #errands");
  });

  it("a note belongs to exactly one task list after repeated moves", () => {
    let c = "Task";
    for (const t of ["#tasks-inbox", "#tasks-today", "#tasks-done"]) c = withTaskTag(c, t);
    expect(c).toBe("Task #tasks-done");
    expect(c.match(/#tasks-/g)).toHaveLength(1);
  });

  it("currentTaskTag reports the tag, or null", () => {
    expect(currentTaskTag("x #tasks-nearterm y")).toBe("#tasks-nearterm");
    expect(currentTaskTag("x #errands")).toBeNull();
  });
});

describe("extractTags", () => {
  it("collects every distinct tag, lowercased", () => {
    const tags = extractTags([
      { content: "a #One", updatedAt: 1 },
      { content: "b #two", updatedAt: 2 },
    ]);
    expect(tags.map((t) => t.tag).sort()).toEqual(["#one", "#two"]);
  });

  it("orders most recently used first", () => {
    const tags = extractTags([
      { content: "a #old", updatedAt: 1 },
      { content: "b #fresh", updatedAt: 99 },
    ]);
    expect(tags.map((t) => t.tag)).toEqual(["#fresh", "#old"]);
  });

  it("records a tag's most recent use across notes", () => {
    const tags = extractTags([
      { content: "a #shared", updatedAt: 5 },
      { content: "b #shared", updatedAt: 50 },
    ]);
    expect(tags).toEqual([{ tag: "#shared", lastUsed: 50 }]);
  });

  it("breaks recency ties alphabetically", () => {
    const tags = extractTags([{ content: "#beta #alpha", updatedAt: 7 }]);
    expect(tags.map((t) => t.tag)).toEqual(["#alpha", "#beta"]);
  });

  it("returns nothing for notes without tags", () => {
    expect(extractTags([{ content: "plain text", updatedAt: 1 }])).toEqual([]);
  });
});

describe("getHashTokenBeforeCursor", () => {
  it("returns the token being typed", () => {
    expect(getHashTokenBeforeCursor("note #gu", 8)).toBe("#gu");
  });

  it("returns a bare # the moment it is typed", () => {
    expect(getHashTokenBeforeCursor("note #", 6)).toBe("#");
  });

  it("returns null once a space breaks the token", () => {
    expect(getHashTokenBeforeCursor("note #guide ", 12)).toBeNull();
  });

  it("returns null when the cursor is not after a tag", () => {
    expect(getHashTokenBeforeCursor("plain text", 10)).toBeNull();
  });

  it("reads from the cursor, not the end of the text", () => {
    expect(getHashTokenBeforeCursor("#one and #two", 4)).toBe("#one");
  });
});
