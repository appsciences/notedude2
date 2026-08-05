"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { subscribeToNotes, saveNote, setNotePinned, setNoteTagPinned, setNoteContent, accountHasNotes, type NoteData } from "../lib/notes";
import { takePendingShare } from "../lib/share";
import { activeVariant, TASK_LISTS, type Variant } from "../lib/variant";
import {
  colors,
  contentWithoutTags,
  fonts,
  fontSizes,
  Footer,
  HelpOverlay,
  MobileToolbar,
  NoteContent,
  NoteEditor,
  NoteList,
  NoteText,
  PaneDivider,
  Rule,
  SearchBar,
  TagDropdown,
  TaskListNav,
  TaskMoveDialog,
  ThemeProvider,
  zIndices,
  type ShortcutSection,
} from "@notedude/ui";

interface Note {
  id: string;
  content: string;
  pinned: boolean;
  tagPinned: boolean;
  createdAt: number;
  updatedAt: number;
  isNew?: boolean; // true until the user edits content for the first time
}

type AppState = "idle" | "editing" | "search";

// Below this width the list pane (250px) and content pane cannot sit side by side and
// stay usable, so the two are shown one at a time instead (#108).
const NARROW_BREAKPOINT = 640;

// Starts false so the server-rendered markup is the desktop layout, then corrects on
// mount. The app is a static export, so there is no request-time viewport to read.
function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`);
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isNarrow;
}

// Tags a new note inherits from the active filter. #archived is excluded — inheriting it
// would archive the note before a single character is typed.
const NON_INHERITABLE_TAGS = new Set(["#archived"]);
function inheritedTags(query: string): string[] {
  const tags = (query.match(/#[\w-]+/g) ?? []).map((t) => t.toLowerCase());
  return Array.from(new Set(tags)).filter((t) => !NON_INHERITABLE_TAGS.has(t));
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // Within same pin status, newest first
    return b.createdAt - a.createdAt;
  });
}

const ARCHIVED_RE = /#archived(?=[\s,.]|$)/i;
function isArchived(note: Note): boolean {
  return ARCHIVED_RE.test(note.content);
}

const TASK_TAG_RE = /#tasks-[\w-]+/;

// --- Tag arithmetic ---------------------------------------------------------------
// Every tag-only content change goes through these, so that adding a tag and taking it
// away again are exact inverses. Callers own the arithmetic and hand the finished string
// to setNoteContent(), which writes it verbatim — see #118.

function appendTag(content: string, tag: string): string {
  const sep = content.endsWith("\n") || content === "" ? "" : " ";
  return content + sep + tag;
}

// Removes a tag along with the single space appendTag put in front of it.
function stripTag(content: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return content.replace(new RegExp(`[ \\t]?${escaped}(?=[\\s,.]|$)`, "i"), "");
}

// Puts `tag` on the note, replacing whatever #tasks-* tag it already carries. A note
// belongs to exactly one task list.
function withTaskTag(content: string, tag: string): string {
  return TASK_TAG_RE.test(content) ? content.replace(TASK_TAG_RE, tag) : appendTag(content, tag);
}

function withoutTaskTag(content: string): string {
  const current = content.match(TASK_TAG_RE)?.[0];
  return current ? stripTag(content, current) : content;
}

/**
 * One reversible action on a note (#117). Entries record a *transform*, never a content
 * snapshot: undoing an archive strips `#archived` from the content as it stands at undo
 * time, so an edit made in between survives. Restoring a snapshot would silently discard
 * it. Text editing is not represented here — the textarea has native browser undo.
 */
type NoteAction =
  | { kind: "archive"; noteId: string }
  | { kind: "pin"; noteId: string; before: boolean }
  | { kind: "tagPin"; noteId: string; before: boolean }
  | { kind: "taskMove"; noteId: string; before: string | null; after: string };

// Callers pass active (non-archived) notes only: a tag whose last remaining note has been
// archived is no longer in use and must stop being suggested. See #90.
function extractTags(notes: Note[]): { tag: string; lastUsed: number }[] {
  const tagMap = new Map<string, number>();
  for (const note of notes) {
    const matches = note.content.match(/#[\w-]+/g);
    if (matches) {
      for (const raw of matches) {
        const tag = raw.toLowerCase();
        const existing = tagMap.get(tag) ?? 0;
        if (note.updatedAt > existing) tagMap.set(tag, note.updatedAt);
      }
    }
  }
  return Array.from(tagMap.entries())
    .map(([tag, lastUsed]) => ({ tag, lastUsed }))
    .sort((a, b) => b.lastUsed - a.lastUsed || a.tag.localeCompare(b.tag));
}

function getCursorPixelPos(textarea: HTMLTextAreaElement, cursorPos: number): { top: number; left: number } {
  const style = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const textBefore = textarea.value.slice(0, cursorPos);
  const lines = textBefore.split("\n");
  const lineIndex = lines.length - 1;
  // Content pane has 16px padding; textarea fills it with no extra padding
  const PANE_PADDING = 16;
  const top = PANE_PADDING + lineIndex * lineHeight + lineHeight - textarea.scrollTop;
  const left = PANE_PADDING; // left-align the dropdown under the line
  return { top, left };
}

// Returns the '#word' token immediately before the cursor, or null if none.
function getHashTokenBeforeCursor(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(/#[\w-]*$/);
  return match ? match[0] : null;
}

// The help overlay's contents. Data rather than markup, so the shortcut list is editable
// without touching layout — HelpOverlay renders whatever it is given.
const SHORTCUT_SECTIONS: ShortcutSection[] = [
  ["navigation", [
    ["j / ↓",   "next note"],
    ["k / ↑",   "previous note"],
    ["1 – 9",   "jump to note by position"],
    ["⌘[ / ⌘]", "navigate back / forward in history"],
    ["c",       "create new note (inherits tags from the active search)"],
    ["Shift+C", "create new note, clearing the active search"],
    ["⏎ / e",   "edit selected note"],
    ["Esc / ⌘⏎", "save and exit editing"],
  ]],
  ["search", [
    ["/",       "open search"],
    ["⏎",       "apply search filter"],
    ["Esc",     "apply filter and exit search"],
    ["Esc Esc", "clear filter"],
  ]],
  ["pinning", [
    ["p",       "pin note to top (idle mode)"],
    ["Shift+P", "tag-pin note (top of search results when first tag matches)"],
    ["○",       "indicator: pinned"],
    ["#",       "indicator: tag-pinned (first tag matches active search)"],
  ]],
  ["to do list", [
    ["t → i",   "#tasks-inbox"],
    ["t → t",   "#tasks-today"],
    ["t → n",   "#tasks-nearterm"],
    ["t → l",   "#tasks-longterm"],
    ["t → d",   "#tasks-done"],
    ["t → m",   "move note to a task list (incl. done)"],
  ]],
  ["etc", [
    ["Shift+Y", "archive note (tags #archived, moves to end of list)"],
    ["z",       "undo last note action (archive / pin / task move)"],
    ["Shift+Z", "redo last undone note action"],
    ["d → m",   "toggle dark mode"],
    ["d → d",   "open donate page"],
    ["r → r",   "report an issue"],
    ["l → l",   "log out"],
    ["⌘/ or ?", "show this (⌘/ works from any mode)"],
  ]],
];

// Keyed by variant so the two products never share a demo store — todude's demo holds tasks
// and notedude's holds notes, and one overwriting the other is nobody's idea of a demo (#151).
function demoStorageKey(variant: Variant) {
  return `${variant.id}_demo_notes`;
}

function loadDemoNotes(variant: Variant): Note[] {
  try {
    const raw = localStorage.getItem(demoStorageKey(variant));
    if (raw) return JSON.parse(raw) as Note[];
  } catch { /* ignore */ }
  return [{
    id: "demo-welcome",
    content: variant.demoWelcome,
    pinned: true,
    tagPinned: false,
    createdAt: 1,
    updatedAt: 1,
  }];
}

function saveDemoNotes(variant: Variant, notes: Note[]) {
  localStorage.setItem(demoStorageKey(variant), JSON.stringify(notes));
}

export default function App({
  uid,
  onLogout,
  demo,
  // Defaulted to the build-time record, overridden only by the `/test/*` routes so one build
  // can cover both products in the E2E suite (#151).
  variant = activeVariant,
}: { uid?: string; onLogout?: () => void; demo?: boolean; variant?: Variant }) {
  const [notes, setNotes] = useState<Note[]>(() => {
    if (demo) return loadDemoNotes(variant);
    return uid ? [] : variant.seed;
  });
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (demo) { const n = loadDemoNotes(variant); return n[0]?.id ?? ""; }
    return uid ? "" : variant.seed[0].id;
  });
  const [synced, setSynced] = useState(!uid || !!demo); // true when initial load is done
  const [appState, setAppState] = useState<AppState>("idle");
  const [filterQuery, setFilterQuery] = useState(variant.initialFilter);
  const [activeFilter, setActiveFilter] = useState(variant.initialFilter);
  const [selectedTagIndex, setSelectedTagIndex] = useState(-1);
  const [tagDropdownDismissed, setTagDropdownDismissed] = useState(false);
  const [editorTagIndex, setEditorTagIndex] = useState(-1);
  const [editorTagDismissed, setEditorTagDismissed] = useState(false);
  const [editorCursorPos, setEditorCursorPos] = useState(0);
  const [editorDropdownPos, setEditorDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [darkMode, setDarkMode] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [saveFlashId, setSaveFlashId] = useState<string | null>(null);
  const [showTaskMove, setShowTaskMove] = useState(false);
  const [taskMoveIndex, setTaskMoveIndex] = useState(0);
  const [recentSearchTags, setRecentSearchTags] = useState<string[]>([]);
  // Single-pane navigation, narrow viewports only. Ignored on desktop, where both panes
  // are always mounted (#108).
  const isNarrow = useIsNarrow();
  const [mobileView, setMobileView] = useState<"list" | "content">("list");
  // Note ids captured when editing began, holding the list steady until editing ends (#93, #94)
  const [frozenOrder, setFrozenOrder] = useState<string[] | null>(null);
  useEffect(() => {
    // Dark mode is the default; only switch to light if the user explicitly chose it.
    if (localStorage.getItem("theme") === "light") setDarkMode(false);
    try {
      const stored = localStorage.getItem("recentSearchTags");
      if (stored) setRecentSearchTags(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const [dividerRows, setDividerRows] = useState(35);

  const appRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listPaneRef = useRef<HTMLDivElement>(null);
  const lastEscRef = useRef<number>(0);
  const tPrefixArmed = useRef(false);
  const tPrefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dPrefixArmed = useRef(false);
  const dPrefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lPrefixArmed = useRef(false);
  const lPrefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rPrefixArmed = useRef(false);
  const rPrefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const welcomeSeededRef = useRef(false);
  const editingNoteIdRef = useRef<string | null>(null);
  // Where to put the caret the next time the editor opens; null means "end of content".
  const newNoteCursorRef = useRef<number | null>(null);
  // Always-current view of `notes`, for callbacks that must not read a stale array.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  // Navigation history: list of note IDs visited (in editing or idle selection)
  const navHistoryRef = useRef<string[]>([]);
  const navIdxRef = useRef(-1); // points to current position in navHistoryRef
  const navSkipRef = useRef(false); // true while navigating history to avoid re-push

  const activeQuery = appState === "search" ? filterQuery : activeFilter;

  // All #tags mentioned anywhere in the active query
  const activeQueryTags = new Set(
    (activeQuery.match(/#[\w-]+/gi) ?? []).map((t) => t.toLowerCase())
  );

  // The note under the editor, if any. It is exempt from filtering and from scope below.
  const editingId = appState === "editing" ? selectedId : null;

  /**
   * Whether a note belongs to this product at all (#151).
   *
   * In the tasks-only variant an untagged note is not "filtered out", it is simply not part
   * of todude — both products read one `users/{uid}/notes` collection, so a todude account
   * genuinely holds notes todude must never show. The note being edited is exempt, so a task
   * does not vanish out from under the cursor while its tag is retyped (cf. #93, #94).
   */
  const inScope = (n: Note) =>
    !variant.tasksOnly || n.id === editingId || TASK_TAG_RE.test(n.content);

  // Tag suggestions are drawn from active notes only (#90), and only from notes this product
  // can see.
  const activeNotes = notes.filter((n) => !isArchived(n) && inScope(n));

  const taskTagsSorted = (() => {
    const recency = new Map(extractTags(activeNotes).filter(t => TASK_LISTS.includes(t.tag)).map(t => [t.tag, t.lastUsed]));
    return [...TASK_LISTS].sort((a, b) => (recency.get(b) ?? 0) - (recency.get(a) ?? 0));
  })();

  // How full each list is, for the nav bar. Counted off `activeNotes` so archiving a task
  // takes it out of the tally, matching what selecting the list would actually show.
  const taskListCounts = variant.taskLists.map((tag) => ({
    tag,
    count: activeNotes.filter((n) => new RegExp(`${tag}(?=[\\s,.]|$)`, "i").test(n.content)).length,
  }));

  // A list is "active" only when the query is exactly that tag — a compound search such as
  // "#tasks-today milk" is not a list view, and highlighting one would misdescribe it.
  const activeListTag =
    variant.taskLists.find((tag) => activeQuery.trim().toLowerCase() === tag) ?? null;

  const { displayed, displayedArchived } = (() => {
    const query = activeQuery;
    // Scope is applied before anything else: it decides what this product contains, which is
    // a different question from what the current filter selects out of it (#151).
    const scoped = notes.filter(inScope);
    const splitArchived = (arr: Note[]) => ({
      displayed: arr.filter((n) => !isArchived(n)),
      displayedArchived: arr.filter((n) => isArchived(n)),
    });

    // While editing, membership and order are held at whatever they were when editing
    // began. Otherwise a note that stops matching the filter mid-edit (deleting the very
    // tag being searched for, #94) or a new note that never matched it (#93) falls out of
    // the list, and typing re-sorts the list under the user (search sorts by updatedAt).
    // Notes are re-read from `notes` by id, so titles still update live.
    if (frozenOrder) {
      const byId = new Map(notes.map((n) => [n.id, n]));
      const frozen = frozenOrder
        .map((id) => byId.get(id))
        .filter((n): n is Note => n !== undefined);
      if (editingId && !frozen.some((n) => n.id === editingId)) {
        const editingNote = byId.get(editingId);
        if (editingNote) frozen.unshift(editingNote);
      }
      return splitArchived(frozen);
    }

    const matchesQuery = (n: Note) => {
      if (!query.trim()) return true;
      const lower = n.content.toLowerCase();
      const parts = query.trim().split(/\s+/);
      return parts.every((part) => {
        if (part.startsWith("#")) {
          const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`${escaped}(?=[\\s,.]|$)`, "i").test(n.content);
        }
        return lower.includes(part.toLowerCase());
      });
    };
    if (!query.trim()) {
      // Archived notes are not hidden — they sort to the end, below the divider (#96).
      return splitArchived(sortNotes(scoped));
    }
    const sorted = [...scoped].sort((a, b) => b.updatedAt - a.updatedAt);
    const isActiveTagPinned = (n: Note) => {
      const firstTag = n.content.match(/#[\w-]+/)?.[0]?.toLowerCase();
      return n.tagPinned && !!firstTag && activeQueryTags.has(firstTag);
    };
    const applyTagPin = (arr: Note[]) => activeQueryTags.size === 0 ? arr : [...arr].sort((a, b) => {
      const aTp = isActiveTagPinned(a);
      const bTp = isActiveTagPinned(b);
      if (aTp && !bTp) return -1;
      if (!aTp && bTp) return 1;
      return b.updatedAt - a.updatedAt;
    });
    return {
      displayed: applyTagPin(sorted.filter((n) => !isArchived(n) && matchesQuery(n))),
      displayedArchived: sorted.filter((n) => isArchived(n) && matchesQuery(n)),
    };
  })();

  // Keyboard navigation traverses the whole list — active notes, then archived (#95).
  const navigable = [...displayed, ...displayedArchived];

  const selectedNote = notes.find((n) => n.id === selectedId);

  const showTagDropdown = appState === "search" && filterQuery.startsWith("#") && !filterQuery.includes(" ") && !tagDropdownDismissed;
  const { filteredTags, recentTagCount } = (() => {
    if (!showTagDropdown) return { filteredTags: [], recentTagCount: 0 };
    const allTags = extractTags(activeNotes);
    const query = filterQuery.toLowerCase().slice(1);
    const matched = query ? allTags.filter((t) => t.tag.slice(1).startsWith(query)) : allTags;
    const matchedSet = new Set(matched.map((t) => t.tag));
    // Top section: recently searched tags that match the current query prefix, in recency order
    const recentMatched = recentSearchTags.filter((tag) => matchedSet.has(tag)).slice(0, 5);
    const recentSet = new Set(recentMatched);
    const rest = matched.filter((t) => !recentSet.has(t.tag)).sort((a, b) => a.tag.localeCompare(b.tag));
    return { filteredTags: [...recentMatched.map((tag) => ({ tag, lastUsed: 0 })), ...rest], recentTagCount: recentMatched.length };
  })();

  const insertTag = useCallback((tag: string) => {
    setFilterQuery(tag + " ");
    setSelectedTagIndex(-1);
    searchRef.current?.focus();
  }, []);

  const recordSearchTag = useCallback((tag: string) => {
    setRecentSearchTags((prev) => {
      const next = [tag, ...prev.filter((t) => t !== tag)].slice(0, 20);
      localStorage.setItem("recentSearchTags", JSON.stringify(next));
      return next;
    });
  }, []);

  const selectTag = useCallback((tag: string) => {
    recordSearchTag(tag);
    setActiveFilter(tag);
    // Leave the tag in the search box, like Enter and the 't' shortcuts do — an applied
    // filter the user cannot see is a filter they cannot reason about (#101).
    setFilterQuery(tag);
    setSelectedTagIndex(-1);
    setAppState("idle");
  }, [recordSearchTag]);

  // Editor tag completion
  const editorHashToken = (() => {
    if (appState !== "editing" || editorTagDismissed) return null;
    const content = notes.find((n) => n.id === selectedId)?.content ?? "";
    return getHashTokenBeforeCursor(content, editorCursorPos);
  })();
  const showEditorTagDropdown = editorHashToken !== null;
  const { editorFilteredTags, editorRecentTagCount } = (() => {
    if (!showEditorTagDropdown) return { editorFilteredTags: [], editorRecentTagCount: 0 };
    const allTags = extractTags(activeNotes);
    const token = (editorHashToken ?? "").toLowerCase();
    const query = token.slice(1);
    const matched = allTags.filter((t) => t.tag !== token && (query ? t.tag.slice(1).startsWith(query) : true));
    const recent = matched.slice(0, 5);
    const rest = matched.slice(5).sort((a, b) => a.tag.localeCompare(b.tag));
    return { editorFilteredTags: [...recent, ...rest], editorRecentTagCount: recent.length };
  })();

  const insertEditorTag = useCallback((tag: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const content = editor.value;
    const cursor = editor.selectionStart ?? 0;
    const token = getHashTokenBeforeCursor(content, cursor);
    if (!token) return;
    const start = cursor - token.length;
    const newContent = content.slice(0, start) + tag + " " + content.slice(cursor);
    // Update note content
    const newCursor = start + tag.length + 1;
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== selectedId) return n;
        const updated = { ...n, content: newContent, updatedAt: Date.now(), isNew: false };
        return updated;
      })
    );
    setEditorTagIndex(-1);
    setEditorTagDismissed(true);
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      editor.selectionStart = newCursor;
      editor.selectionEnd = newCursor;
      editor.focus();
    });
  }, [selectedId]);

  // Debounced save to Firestore
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingNoteRef = useRef<Note | null>(null);

  const flushSave = useCallback(() => {
    if (uid && pendingNoteRef.current) {
      saveNote(uid, pendingNoteRef.current);
      pendingNoteRef.current = null;
    }
  }, [uid]);

  const debouncedSave = useCallback((note: Note) => {
    if (!uid) return;
    pendingNoteRef.current = note;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, 500);
  }, [uid, flushSave]);

  // --- Undo / redo (#117) ---------------------------------------------------------
  // Refs, not state: nothing renders the stacks, and a ref cannot be read stale by the
  // keydown handler. In-memory and per-session — a reload starts with both empty.
  const undoStackRef = useRef<NoteAction[]>([]);
  const redoStackRef = useRef<NoteAction[]>([]);

  const pushAction = useCallback((action: NoteAction) => {
    undoStackRef.current.push(action);
    // Standard linear model: a fresh action abandons the redo branch.
    redoStackRef.current = [];
  }, []);

  // Applies `action` in one direction. Returns false when the note no longer exists, so
  // the caller can skip the entry instead of spending the keystroke doing nothing.
  const applyAction = useCallback((action: NoteAction, direction: "undo" | "redo"): boolean => {
    const note = notesRef.current.find((n) => n.id === action.noteId);
    if (!note) return false;

    const writeContent = (content: string) => {
      setNotes((prev) => prev.map((n) => n.id === note.id ? { ...n, content, updatedAt: Date.now() } : n));
      if (uid && !demo) setNoteContent(uid, note.id, content);
    };

    switch (action.kind) {
      case "archive":
        writeContent(direction === "undo"
          ? stripTag(note.content, "#archived")
          : appendTag(note.content, "#archived"));
        break;
      case "pin": {
        const pinned = direction === "undo" ? action.before : !action.before;
        setNotes((prev) => prev.map((n) => n.id === note.id ? { ...n, pinned } : n));
        if (uid && !demo) setNotePinned(uid, note.id, pinned);
        break;
      }
      case "tagPin": {
        const tagPinned = direction === "undo" ? action.before : !action.before;
        setNotes((prev) => prev.map((n) => n.id === note.id ? { ...n, tagPinned } : n));
        if (uid && !demo) setNoteTagPinned(uid, note.id, tagPinned);
        break;
      }
      case "taskMove":
        writeContent(direction === "undo"
          ? (action.before === null ? withoutTaskTag(note.content) : withTaskTag(note.content, action.before))
          : withTaskTag(note.content, action.after));
        break;
    }
    // Put the affected note back on screen — archiving in particular moved the selection
    // elsewhere when it fired, and an undo you cannot see is not obviously an undo.
    setSelectedId(note.id);
    return true;
  }, [uid, demo]);

  const undo = useCallback(() => {
    while (undoStackRef.current.length > 0) {
      const action = undoStackRef.current.pop()!;
      if (applyAction(action, "undo")) {
        redoStackRef.current.push(action);
        return;
      }
      // Note was discarded since — drop the entry and try the one beneath it.
    }
  }, [applyAction]);

  const redo = useCallback(() => {
    while (redoStackRef.current.length > 0) {
      const action = redoStackRef.current.pop()!;
      if (applyAction(action, "redo")) {
        undoStackRef.current.push(action);
        return;
      }
    }
  }, [applyAction]);

  // Assign a task tag, replacing any the note already carries. Shared by the overlay's
  // keyboard and click paths so both record the same undo entry.
  const applyTaskTag = useCallback((noteId: string, tag: string) => {
    const note = notesRef.current.find((n) => n.id === noteId);
    if (!note) return;
    const before = note.content.match(TASK_TAG_RE)?.[0] ?? null;
    const content = withTaskTag(note.content, tag);
    setNotes((prev) => prev.map((n) => n.id === noteId ? { ...n, content, updatedAt: Date.now() } : n));
    if (uid && !demo) setNoteContent(uid, noteId, content);
    pushAction({ kind: "taskMove", noteId, before, after: tag });
    setShowTaskMove(false);
  }, [uid, demo, pushAction]);

  const enterEditing = useCallback((noteId: string) => {
    editingNoteIdRef.current = noteId;
    setSelectedId(noteId);
    setAppState("editing");
    // Every route into editing must surface the editor on a single-pane viewport —
    // including 'c' from a hardware keyboard on a narrow window.
    setMobileView("content");
  }, []);

  // Create a note carrying `tags`, and open it for editing with the cursor before them,
  // so the user types the title and lands on "Title #tag" — the house convention.
  // Deliberately not saved here: an untouched note must never reach Firestore (#77).
  const createNote = useCallback((tags: string[]) => {
    const now = Date.now();
    // In the tasks-only variant a new note must always land in a list, or the scope rule
    // hides it the instant it exists. That is precisely the `Shift+C` path, which clears the
    // filter and so leaves nothing to inherit (#151).
    const withList =
      variant.tasksOnly && variant.fallbackList && !tags.some((t) => TASK_TAG_RE.test(t))
        ? [...tags, variant.fallbackList]
        : tags;
    const newNote: Note = {
      id: crypto.randomUUID(),
      content: withList.length > 0 ? " " + withList.join(" ") : "",
      pinned: false,
      tagPinned: false,
      createdAt: now,
      updatedAt: now,
      isNew: true,
    };
    newNoteCursorRef.current = 0;
    setNotes((prev) => [newNote, ...prev]);
    enterEditing(newNote.id);
  }, [enterEditing, variant]);

  // A shared note is the inverse of `c`: its content came from an explicit user action in
  // another app, so it is real from the start — persisted immediately and never subject to
  // the discard-if-untouched rule that protects against empty notes (#110, cf. #77).
  const createSharedNote = useCallback((content: string) => {
    const now = Date.now();
    // Same rule as `c`: in the tasks-only variant a share that carries no list tag would be
    // saved and then immediately hidden by the scope rule, so it lands in the inbox (#151).
    const scopedContent =
      variant.tasksOnly && variant.fallbackList && !TASK_TAG_RE.test(content)
        ? appendTag(content, variant.fallbackList)
        : content;
    const newNote: Note = {
      id: crypto.randomUUID(),
      content: scopedContent,
      pinned: false,
      tagPinned: false,
      createdAt: now,
      updatedAt: now,
      isNew: false,
    };
    newNoteCursorRef.current = scopedContent.length;
    setNotes((prev) => [newNote, ...prev]);
    if (uid && !demo) saveNote(uid, newNote);
    enterEditing(newNote.id);
  }, [enterEditing, uid, demo, variant]);

  // Web Share Target handoff: /share parks the payload, the app claims it here. Claiming
  // clears it, so the re-run when `uid` arrives from auth is a no-op.
  useEffect(() => {
    const shared = takePendingShare();
    if (shared) createSharedNote(shared);
  }, [createSharedNote]);

  const saveEdits = useCallback(() => {
    editingNoteIdRef.current = null;
    // Read through the ref, never the closure: a keystroke and the Escape that follows it
    // can land before this callback is rebuilt, and a stale `notes` here would see the
    // note as still empty and discard content the user actually typed.
    const note = notesRef.current.find((n) => n.id === selectedId);
    // Discard a note that holds nothing the user wrote — blank, or (for a note never yet
    // touched) only the tags it inherited from the filter, so 'c' then Esc leaves no junk.
    const isDiscardable = !!note && (
      note.content.trim() === "" ||
      (!!note.isNew && contentWithoutTags(note.content) === "")
    );
    if (isDiscardable) {
      // Drop any queued write too, so a discarded note is never resurrected by a flush (#77).
      if (pendingNoteRef.current?.id === selectedId) pendingNoteRef.current = null;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setNotes((prev) => prev.filter((n) => n.id !== selectedId));
    } else {
      setNotes((prev) => prev.map((n) => n.id === selectedId && n.isNew ? { ...n, isNew: false } : n));
    }
    flushSave();
    setAppState("idle");
    if (selectedId) {
      setSaveFlashId(selectedId);
      setTimeout(() => setSaveFlashId(null), 450);
    }
  }, [selectedId, flushSave]);

  // Push to nav history when selectedId changes (skip when navigating history itself)
  useEffect(() => {
    if (!selectedId) return;
    if (navSkipRef.current) { navSkipRef.current = false; return; }
    const history = navHistoryRef.current;
    // Don't push duplicate of current position
    if (history[navIdxRef.current] === selectedId) return;
    // Truncate forward history
    const newHistory = history.slice(0, navIdxRef.current + 1);
    newHistory.push(selectedId);
    navHistoryRef.current = newHistory;
    navIdxRef.current = newHistory.length - 1;
  }, [selectedId]);

  // Firestore subscription
  useEffect(() => {
    if (!uid) return;
    return subscribeToNotes(
      uid,
      (remoteNotes) => {
        setNotes((prev) => {
          // Merge: keep local isNew flags, prefer local content for notes being edited
          const remoteMap = new Map(remoteNotes.map((n) => [n.id, n]));
          const localMap = new Map(prev.map((n) => [n.id, n]));
          const merged: Note[] = [];
          // Add all remote notes, preserving local content when actively editing
          for (const rn of remoteNotes) {
            const local = localMap.get(rn.id);
            const preserveLocal = local && (local.isNew || rn.id === editingNoteIdRef.current);
            merged.push(preserveLocal ? local : { ...rn, isNew: false });
          }
          // Keep local-only notes (newly created, not yet synced)
          for (const ln of prev) {
            if (!remoteMap.has(ln.id)) merged.push(ln);
          }
          return merged;
        });
        setSynced(true);
      },
      (err) => console.error("Firestore subscription error:", err)
    );
  }, [uid]);

  // Seed the welcome note, but only for a genuinely new account.
  //
  // Deliberately kept off the subscription above. Its first snapshot can be an empty cache
  // hit, which is indistinguishable from a new account, so deciding there handed returning
  // users a duplicate welcome note — written into their own Firestore data (#120). An
  // authoritative server read answers the question directly and leaves the merge untouched,
  // which matters because the lost-update guard in #74 depends on its exact behaviour.
  useEffect(() => {
    if (!uid || demo) return;
    let cancelled = false;
    (async () => {
      try {
        if (await accountHasNotes(uid)) return;
        if (cancelled || welcomeSeededRef.current) return;
        welcomeSeededRef.current = true;
        const now = Date.now();
        const welcome: Note = {
          id: crypto.randomUUID(),
          content: "Greetings\nPress ⌘/ (Ctrl+/) for keyboard shortcuts.",
          pinned: false,
          tagPinned: false,
          createdAt: now,
          updatedAt: now,
        };
        saveNote(uid, welcome);
        setNotes((prev) => (prev.length === 0 ? [welcome] : prev));
        setSynced(true);
      } catch (err) {
        // Offline, or the read was refused. Treat that as "unknown", never as "empty":
        // seeding on an unanswered question is the bug this replaced.
        console.error("Welcome-note check failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, demo]);

  // Demo mode: persist notes to localStorage on every change
  useEffect(() => {
    if (!demo) return;
    saveDemoNotes(variant, notes);
  }, [demo, notes, variant]);

  // Select first note once synced. Skipped while a filter is active so that a zero-result
  // search is allowed to leave nothing selected (#97).
  useEffect(() => {
    if (synced && !selectedId && !activeQuery.trim() && notes.length > 0) {
      setSelectedId(sortNotes(notes)[0].id);
    }
  }, [synced, selectedId, notes, activeQuery]);

  // Freeze / release the displayed list around editing. Keyed on appState alone: the whole
  // point is that the captured order does not follow later changes to the list.
  useEffect(() => {
    if (appState !== "editing") {
      setFrozenOrder(null);
      return;
    }
    setFrozenOrder((prev) => prev ?? [...displayed, ...displayedArchived].map((n) => n.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]);

  // Keep selectedId in sync with displayed list
  useEffect(() => {
    // Never move the selection out from under an open editor (#93, #94).
    if (appState === "editing") return;
    const allDisplayed = [...displayed, ...displayedArchived];
    if (allDisplayed.length === 0) {
      // Nothing matches the filter: deselect, so the content pane goes blank instead of
      // showing a note that is not in the results (#97).
      if (selectedId) setSelectedId("");
      return;
    }
    if (!allDisplayed.some((n) => n.id === selectedId)) {
      setSelectedId(displayed[0]?.id ?? displayedArchived[0]?.id ?? "");
    }
  }, [appState, displayed, displayedArchived, selectedId]);

  // Auto-focus app on mount
  useEffect(() => {
    appRef.current?.focus();
  }, []);

  // Keep | divider tall enough to cover both panes
  useEffect(() => {
    const LINE_HEIGHT_PX = 14 * 1.4; // fontSize 14, lineHeight 1.4
    const EXTRA_ROWS = 10;
    function update() {
      const listH = Array.from(listPaneRef.current?.children ?? [])
        .reduce((sum, el) => sum + (el as HTMLElement).offsetHeight, 0);
      const contentLines = (selectedNote?.content ?? "").split("\n").length;
      const contentH = contentLines * LINE_HEIGHT_PX + 32; // +32 for padding
      setDividerRows(Math.ceil(Math.max(listH, contentH) / LINE_HEIGHT_PX) + EXTRA_ROWS);
    }
    const ro = new ResizeObserver(update);
    if (listPaneRef.current) ro.observe(listPaneRef.current);
    update();
    return () => ro.disconnect();
  }, [selectedNote]);

  // Focus management
  useEffect(() => {
    if (appState === "editing" && editorRef.current) {
      const el = editorRef.current;
      el.focus();
      const caret = newNoteCursorRef.current ?? el.value.length;
      newNoteCursorRef.current = null;
      el.selectionStart = caret;
      el.selectionEnd = caret;
    } else if (appState === "search" && searchRef.current) {
      searchRef.current.focus();
    } else if (appState === "idle") {
      // Focus app container so keyboard shortcuts work
      appRef.current?.focus();
    }
  }, [appState, selectedId]);

  // Global keyboard handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (showHelp) { setShowHelp(false); return; }
      if (showTaskMove) {
        e.preventDefault();
        if (e.key === "Escape") { setShowTaskMove(false); return; }
        if (e.key === "j" || e.key === "ArrowDown") { setTaskMoveIndex(i => Math.min(i + 1, taskTagsSorted.length - 1)); return; }
        if (e.key === "k" || e.key === "ArrowUp") { setTaskMoveIndex(i => Math.max(i - 1, 0)); return; }
        if (e.key === "Enter" && selectedId) {
          applyTaskTag(selectedId, taskTagsSorted[taskMoveIndex]);
          return;
        }
        return;
      }
      // cmd+[ / cmd+] navigation history — works in all states
      if (e.metaKey && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        const history = navHistoryRef.current;
        const idx = navIdxRef.current;
        const targetIdx = e.key === "[" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= history.length) return;
        const targetId = history[targetIdx];
        if (!notes.find((n) => n.id === targetId)) return;
        navSkipRef.current = true;
        navIdxRef.current = targetIdx;
        if (appState === "editing") saveEdits();
        setSelectedId(targetId);
        setAppState("editing");
        return;
      }
      // ⌘/ or Ctrl+/ — show keyboard shortcuts from any state.
      // Safe while editing: it's a modifier combo, so plain "/" still types normally.
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShowHelp(true);
        return;
      }

      if (appState === "idle") {
        if (e.key === "p" && !e.shiftKey) {
          e.preventDefault();
          if (selectedId) {
            const updated = notes.find((n) => n.id === selectedId);
            setNotes((prev) => prev.map((n) => n.id === selectedId ? { ...n, pinned: !n.pinned } : n));
            if (uid && !demo && updated) setNotePinned(uid, updated.id, !updated.pinned);
            if (updated) pushAction({ kind: "pin", noteId: updated.id, before: updated.pinned });
          }
          return;
        }
        if (e.key === "P" && e.shiftKey) {
          e.preventDefault();
          if (selectedId) {
            const updated = notes.find((n) => n.id === selectedId);
            setNotes((prev) => prev.map((n) => n.id === selectedId ? { ...n, tagPinned: !n.tagPinned } : n));
            if (uid && !demo && updated) setNoteTagPinned(uid, updated.id, !updated.tagPinned);
            if (updated) pushAction({ kind: "tagPin", noteId: updated.id, before: updated.tagPinned });
          }
          return;
        }
        // Undo/redo covers actions on notes only — never text edits, which keep the
        // textarea's native browser undo. Bound in idle alone for that reason (#117).
        if (e.key === "z" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          undo();
          return;
        }
        if (e.key === "Z" && e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          redo();
          return;
        }
        // 'c' composes in context: the new note inherits the active filter's tags, so it
        // belongs to the list you are looking at and stays visible there (#99).
        if (e.key === "c" && !e.shiftKey) {
          e.preventDefault();
          createNote(inheritedTags(activeFilter));
          return;
        }
        // Shift+C composes clean: drop the filter, start a blank note (#100).
        if (e.key === "C" && e.shiftKey) {
          e.preventDefault();
          setActiveFilter("");
          setFilterQuery("");
          createNote([]);
          return;
        }
        if (e.key === "Enter" || e.key === "e") {
          e.preventDefault();
          if (selectedId) enterEditing(selectedId);
          return;
        }
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          const idx = navigable.findIndex((n) => n.id === selectedId);
          if (idx < navigable.length - 1) {
            setSelectedId(navigable[idx + 1].id);
          }
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          const idx = navigable.findIndex((n) => n.id === selectedId);
          if (idx > 0) {
            setSelectedId(navigable[idx - 1].id);
          }
          return;
        }
        if (e.key === "/") {
          e.preventDefault();
          setAppState("search");
          return;
        }
        if (tPrefixArmed.current) {
          tPrefixArmed.current = false;
          if (tPrefixTimer.current) { clearTimeout(tPrefixTimer.current); tPrefixTimer.current = null; }
          if (e.key === "m") {
            e.preventDefault();
            setTaskMoveIndex(0);
            setShowTaskMove(true);
            return;
          }
          const tagMap: Record<string, string> = { i: "#tasks-inbox", t: "#tasks-today", n: "#tasks-nearterm", l: "#tasks-longterm", d: "#tasks-done" };
          const tag = tagMap[e.key];
          if (tag) {
            e.preventDefault();
            setActiveFilter(tag);
            setFilterQuery(tag);
            // select first matching note
            const match = sortNotes(notes).find((n) => new RegExp(`(?:^|\\s)${tag}(?:\\s|$)`, "i").test(n.content));
            if (match) setSelectedId(match.id);
          }
          return;
        }
        if (e.key === "?") {
          e.preventDefault();
          setShowHelp(true);
          return;
        }
        if (e.key === "Y") {
          e.preventDefault();
          const toArchive = notes.find((n) => n.id === selectedId);
          // Archiving an archived note would just append a second #archived tag (#67).
          if (toArchive && !isArchived(toArchive)) {
            // Next selection comes from the active list, so it never lands in the archive.
            const idx = displayed.findIndex((n) => n.id === selectedId);
            const next = displayed[idx + 1] ?? displayed[idx - 1] ?? displayed[0] ?? null;
            // Compute the content once and store exactly that. The old archiveNote()
            // appended #archived a second time on the way to Firestore (#118).
            const newContent = appendTag(toArchive.content, "#archived");
            setNotes((prev) => prev.map((n) =>
              n.id === selectedId ? { ...n, content: newContent, updatedAt: Date.now() } : n
            ));
            if (uid && !demo) setNoteContent(uid, toArchive.id, newContent);
            pushAction({ kind: "archive", noteId: toArchive.id });
            setSelectedId(next?.id ?? "");
          }
          return;
        }
        if (e.key === "t") {
          e.preventDefault();
          tPrefixArmed.current = true;
          tPrefixTimer.current = setTimeout(() => { tPrefixArmed.current = false; tPrefixTimer.current = null; }, 1500);
          return;
        }
        if (dPrefixArmed.current) {
          dPrefixArmed.current = false;
          if (dPrefixTimer.current) { clearTimeout(dPrefixTimer.current); dPrefixTimer.current = null; }
          if (e.key === "d") {
            e.preventDefault();
            window.open("https://notedude.app#donate", "_blank");
          } else if (e.key === "m") {
            e.preventDefault();
            setDarkMode((prev) => {
              const next = !prev;
              localStorage.setItem("theme", next ? "dark" : "light");
              return next;
            });
          }
          return;
        }
        if (e.key === "d") {
          e.preventDefault();
          dPrefixArmed.current = true;
          dPrefixTimer.current = setTimeout(() => { dPrefixArmed.current = false; dPrefixTimer.current = null; }, 1500);
          return;
        }
        if (lPrefixArmed.current) {
          lPrefixArmed.current = false;
          if (lPrefixTimer.current) { clearTimeout(lPrefixTimer.current); lPrefixTimer.current = null; }
          if (e.key === "l") {
            e.preventDefault();
            onLogout?.();
          }
          return;
        }
        if (e.key === "l") {
          e.preventDefault();
          lPrefixArmed.current = true;
          lPrefixTimer.current = setTimeout(() => { lPrefixArmed.current = false; lPrefixTimer.current = null; }, 1500);
          return;
        }
        if (rPrefixArmed.current) {
          rPrefixArmed.current = false;
          if (rPrefixTimer.current) { clearTimeout(rPrefixTimer.current); rPrefixTimer.current = null; }
          if (e.key === "r") {
            e.preventDefault();
            window.open("mailto:issues20260531@notedude.app", "_blank");
          }
          return;
        }
        if (e.key === "r") {
          e.preventDefault();
          rPrefixArmed.current = true;
          rPrefixTimer.current = setTimeout(() => { rPrefixArmed.current = false; rPrefixTimer.current = null; }, 1500);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          const now = Date.now();
          if (now - lastEscRef.current < 500) {
            setActiveFilter("");
            setFilterQuery("");
            lastEscRef.current = 0;
          } else {
            lastEscRef.current = now;
          }
          return;
        }
        if (e.key >= "1" && e.key <= "9" && navigable.length > 0) {
          e.preventDefault();
          const idx = e.key === "9" ? navigable.length - 1 : Math.min(Number(e.key) - 1, navigable.length - 1);
          setSelectedId(navigable[idx].id);
          return;
        }
      }

      if (appState === "editing") {
        if (showEditorTagDropdown && editorFilteredTags.length > 0) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setEditorTagIndex((prev) => Math.min(prev + 1, editorFilteredTags.length - 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setEditorTagIndex((prev) => Math.max(prev - 1, -1));
            return;
          }
          if (e.key === "Enter" && editorTagIndex >= 0) {
            e.preventDefault();
            insertEditorTag(editorFilteredTags[editorTagIndex].tag);
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setEditorTagDismissed(true);
            setEditorTagIndex(-1);
            return;
          }
        }
        if (e.key === "Escape") {
          e.preventDefault();
          saveEdits();
          return;
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          saveEdits();
          return;
        }
      }

      if (appState === "search") {
        if (showTagDropdown && filteredTags.length > 0) {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedTagIndex((prev) => {
              if (e.key === "ArrowDown") return Math.min(prev + 1, filteredTags.length - 1);
              return Math.max(prev - 1, -1);
            });
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setTagDropdownDismissed(true);
            setSelectedTagIndex(-1);
            return;
          }
          if (e.key === "Enter" && selectedTagIndex >= 0) {
            e.preventDefault();
            insertTag(filteredTags[selectedTagIndex].tag);
            return;
          }
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const tags = (filterQuery.match(/#[\w-]+/g) ?? []).map((t) => t.toLowerCase());
          tags.forEach(recordSearchTag);
          setActiveFilter(filterQuery);
          setAppState("idle");
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          const now = Date.now();
          if (now - lastEscRef.current < 500) {
            setActiveFilter("");
            setFilterQuery("");
            lastEscRef.current = 0;
          } else {
            lastEscRef.current = now;
            setActiveFilter(filterQuery);
          }
          setAppState("idle");
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appState, selectedId, filterQuery, activeFilter, displayed, navigable, enterEditing, createNote, saveEdits, demo, notes, undo, redo, pushAction, applyTaskTag]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (!html) return; // no HTML — let default paste handle it
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    function nodeToText(node: Node, counters: number[]): string {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      const el = node as Element;
      const tag = el.tagName?.toLowerCase();
      if (tag === "ol" || tag === "ul") {
        const newCounters = tag === "ol" ? [...counters, 0] : [...counters, -1];
        return Array.from(el.childNodes).map((c) => nodeToText(c, newCounters)).join("");
      }
      if (tag === "li") {
        const depth = counters.length - 1;
        const counter = counters[depth];
        let prefix: string;
        if (counter === -1) {
          prefix = "  ".repeat(depth) + "• ";
        } else {
          counters[depth]++;
          const n = counters[depth];
          prefix = depth === 0
            ? `${n}. `
            : "  ".repeat(depth) + `${"abcdefghijklmnopqrstuvwxyz"[n - 1]}. `;
        }
        const text = Array.from(el.childNodes).map((c) => nodeToText(c, counters)).join("").trim();
        return prefix + text + "\n";
      }
      if (tag === "br") return "\n";
      if (tag === "p" || tag === "div") {
        const text = Array.from(el.childNodes).map((c) => nodeToText(c, counters)).join("");
        return text + (text.endsWith("\n") ? "" : "\n");
      }
      return Array.from(el.childNodes).map((c) => nodeToText(c, counters)).join("");
    }
    const converted = nodeToText(doc.body, []).replace(/\n{3,}/g, "\n\n").trim();
    if (!converted) return;
    e.preventDefault();
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const newValue = ta.value.slice(0, start) + converted + ta.value.slice(end);
    const newCursor = start + converted.length;
    // Trigger React's change handler by dispatching a native input event
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    nativeInputValueSetter?.call(ta, newValue);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = newCursor; });
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? 0;
    setEditorCursorPos(cursor);
    setEditorDropdownPos(getCursorPixelPos(e.target, cursor));
    setEditorTagDismissed(false);
    setEditorTagIndex(-1);
    const updated = { content: value, updatedAt: Date.now(), isNew: false };
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id !== selectedId) return n;
        const merged = { ...n, ...updated };
        debouncedSave(merged);
        return merged;
      })
    );
  };

  // Exactly one pane is mounted at a time on a narrow viewport; both always are on desktop.
  const showList = !isNarrow || mobileView === "list";
  const showContent = !isNarrow || mobileView === "content";

  // Leaving the content pane commits the edit, so the mobile back button and Esc agree.
  const leaveContentPane = () => {
    if (appState === "editing") saveEdits();
    setMobileView("list");
  };

  const themeName = darkMode ? "dark" : "light";

  return (
    <ThemeProvider theme={themeName}>
      <div
        ref={appRef}
        tabIndex={-1}
        data-testid="app"
        data-state={appState}
        data-theme={themeName}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          outline: "none",
          fontFamily: fonts.mono,
          fontSize: fontSizes.md,
          background: colors.bg.app[themeName],
          color: colors.fg.default[themeName],
        }}
      >
        <SearchBar
          value={filterQuery}
          onChange={(value) => {
            setFilterQuery(value);
            setSelectedTagIndex(-1);
            setTagDropdownDismissed(false);
          }}
          active={appState === "search"}
          onActivate={() => setAppState("search")}
          inputRef={searchRef}
        />

        {/* Zero-height anchor. The dropdown hangs off it as an overlay rather than sitting in
            the column, where opening it shoved the panes below down 48px and closing it
            yanked them back (#124). */}
        <div style={{ position: "relative", zIndex: zIndices.dropdown }}>
          {showTagDropdown && (
            <TagDropdown
              variant="search"
              tags={filteredTags}
              selectedIndex={selectedTagIndex}
              recentCount={recentTagCount}
              onSelect={selectTag}
            />
          )}
        </div>

        <Rule />

        {/* The five lists as navigation, in the todude variant only. Selecting one applies its
            filter, which is the same state the `t → i/t/n/l/d` chords set (#151). */}
        {variant.taskLists.length > 0 && (
          <>
            <TaskListNav lists={taskListCounts} activeTag={activeListTag} onSelect={selectTag} />
            <Rule />
          </>
        )}

        {/* minHeight: 0 so this row shrinks to the space left over instead of being sized by
            its own content — the divider column alone is hundreds of rows tall (#124). */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {showList && (
            <NoteList
              notes={displayed}
              archivedNotes={displayedArchived}
              selectedId={selectedId}
              flashingId={saveFlashId}
              onSelect={(id) => { setSelectedId(id); setMobileView("content"); }}
              fullWidth={isNarrow}
              listRef={listPaneRef}
            />
          )}

          {/* The rule between panes only means anything when both are on screen. */}
          {!isNarrow && <PaneDivider rows={dividerRows} />}

          {showContent && (
            <NoteContent
              onClick={(e) => {
                // Click anywhere in the read-only pane to edit; don't hijack link clicks.
                if (appState === "idle" && selectedId && !(e.target as HTMLElement).closest("a")) {
                  enterEditing(selectedId);
                }
              }}
            >
              {selectedNote && appState === "editing" && selectedNote.id === selectedId ? (
                <>
                  <NoteEditor
                    value={selectedNote.content}
                    onChange={handleContentChange}
                    onPaste={handlePaste}
                    onSelect={(e) => {
                      const ta = e.target as HTMLTextAreaElement;
                      const pos = ta.selectionStart ?? 0;
                      setEditorCursorPos(pos);
                      setEditorDropdownPos(getCursorPixelPos(ta, pos));
                    }}
                    editorRef={editorRef}
                  />
                  {showEditorTagDropdown && (
                    <TagDropdown
                      variant="editor"
                      tags={editorFilteredTags}
                      selectedIndex={editorTagIndex}
                      recentCount={editorRecentTagCount}
                      position={editorDropdownPos}
                      onSelect={insertEditorTag}
                    />
                  )}
                </>
              ) : (
                <NoteText content={selectedNote?.content ?? ""} />
              )}
            </NoteContent>
          )}
        </div>

        {isNarrow && (
          <MobileToolbar
            view={mobileView}
            onCompose={() => createNote(inheritedTags(activeFilter))}
            onBack={leaveContentPane}
          />
        )}

        <Footer brand={variant.name} />

        {showHelp && (
          <HelpOverlay sections={SHORTCUT_SECTIONS} onDismiss={() => setShowHelp(false)} />
        )}

        {showTaskMove && (
          <TaskMoveDialog
            tags={taskTagsSorted}
            selectedIndex={taskMoveIndex}
            onSelect={(tag) => { if (selectedId) applyTaskTag(selectedId, tag); }}
            onDismiss={() => setShowTaskMove(false)}
          />
        )}
      </div>
    </ThemeProvider>
  );
}
