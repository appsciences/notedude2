"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { subscribeToNotes, saveNote, archiveNote, type NoteData } from "../lib/notes";

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

const INITIAL_NOTES: Note[] = [
  { id: "1", content: "Welcome to notedude #intro\nYour keyboard-driven note app.", pinned: true, tagPinned: false, createdAt: 1, updatedAt: 1 },
  { id: "2", content: "Getting started #intro #guide\nPress 'c' to create a new note.\nPress '/' to search.", pinned: false, tagPinned: false, createdAt: 2, updatedAt: 2 },
  { id: "3", content: "Keyboard shortcuts #guide\nEnter to edit, Esc to save.", pinned: false, tagPinned: false, createdAt: 3, updatedAt: 3 },
  { id: "4", content: "Tips #tips\nUse 'j' and 'k' to navigate.", pinned: false, tagPinned: false, createdAt: 4, updatedAt: 4 },
  { id: "5", content: "Projects #project\nOrganize notes by project.", pinned: false, tagPinned: false, createdAt: 5, updatedAt: 5 },
  { id: "6", content: "Archive #archive\nOld notes go here.", pinned: false, tagPinned: false, createdAt: 6, updatedAt: 6 },
  { id: "7", content: "Ideas #ideas\nCapture them here.", pinned: false, tagPinned: false, createdAt: 7, updatedAt: 7 },
];

function getNoteTitle(note: Note): string {
  if (note.isNew && note.content === "") return "New Note";
  const firstLine = note.content.split("\n")[0];
  return firstLine || "No Text Entered";
}

function getNoteMetaSnippet(note: Note): string {
  const lines = note.content.split("\n");
  if (!lines[0]) return "No Content";
  const secondLine = lines.slice(1).find((l) => l.trim() !== "") ?? "";
  return secondLine.length > 30 ? secondLine.slice(0, 30) + "…" : secondLine;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

  if (d >= startOfToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (d >= startOfWeek) {
    return d.toLocaleDateString([], { weekday: "short" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const URL_RE = /https?:\/\/[^\s<>"]+/g;
function renderWithLinks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(<a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecorationColor: "#888" }}>{m[0]}</a>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    // Within same pin status, newest first
    return b.createdAt - a.createdAt;
  });
}

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

const DEMO_STORAGE_KEY = "notedude_demo_notes";
const DEMO_WELCOME: Note = {
  id: "demo-welcome",
  content: "Demo mode - data is stored locally only.\n\nPress ? for keyboard shortcuts.",
  pinned: true,
  tagPinned: false,
  createdAt: 1,
  updatedAt: 1,
};

function loadDemoNotes(): Note[] {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Note[];
  } catch { /* ignore */ }
  return [DEMO_WELCOME];
}

function saveDemoNotes(notes: Note[]) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(notes));
}

export default function App({ uid, onLogout, demo }: { uid?: string; onLogout?: () => void; demo?: boolean }) {
  const [notes, setNotes] = useState<Note[]>(() => {
    if (demo) return loadDemoNotes();
    return uid ? [] : INITIAL_NOTES;
  });
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (demo) { const n = loadDemoNotes(); return n[0]?.id ?? ""; }
    return uid ? "" : INITIAL_NOTES[0].id;
  });
  const [synced, setSynced] = useState(!uid || !!demo); // true when initial load is done
  const [appState, setAppState] = useState<AppState>("idle");
  const [filterQuery, setFilterQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [selectedTagIndex, setSelectedTagIndex] = useState(-1);
  const [tagDropdownDismissed, setTagDropdownDismissed] = useState(false);
  const [editorTagIndex, setEditorTagIndex] = useState(-1);
  const [editorTagDismissed, setEditorTagDismissed] = useState(false);
  const [editorCursorPos, setEditorCursorPos] = useState(0);
  const [editorDropdownPos, setEditorDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [darkMode, setDarkMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [saveFlashId, setSaveFlashId] = useState<string | null>(null);
  const [showTaskMove, setShowTaskMove] = useState(false);
  const [taskMoveIndex, setTaskMoveIndex] = useState(0);
  const [recentSearchTags, setRecentSearchTags] = useState<string[]>([]);
  useEffect(() => {
    if (localStorage.getItem("theme") === "dark") setDarkMode(true);
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
  // Navigation history: list of note IDs visited (in editing or idle selection)
  const navHistoryRef = useRef<string[]>([]);
  const navIdxRef = useRef(-1); // points to current position in navHistoryRef
  const navSkipRef = useRef(false); // true while navigating history to avoid re-push

  const activeQuery = appState === "search" ? filterQuery : activeFilter;

  // All #tags mentioned anywhere in the active query
  const activeQueryTags = new Set(
    (activeQuery.match(/#[\w-]+/gi) ?? []).map((t) => t.toLowerCase())
  );

  const TASK_TAGS = ["#tasks-inbox", "#tasks-today", "#tasks-nearterm", "#tasks-longterm", "#tasks-done"];
  const taskTagsSorted = (() => {
    const recency = new Map(extractTags(notes).filter(t => TASK_TAGS.includes(t.tag)).map(t => [t.tag, t.lastUsed]));
    return [...TASK_TAGS].sort((a, b) => (recency.get(b) ?? 0) - (recency.get(a) ?? 0));
  })();

  function getPinBullets(note: Note): { circle: boolean; hash: boolean } {
    return { circle: note.pinned, hash: note.tagPinned };
  }

  const isArchived = (n: Note) => /#archived(?=[\s,.]|$)/i.test(n.content);

  const { displayed, displayedArchived } = (() => {
    const query = activeQuery;
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
      return { displayed: sortNotes(notes.filter((n) => !isArchived(n))), displayedArchived: [] };
    }
    const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
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

  const selectedNote = notes.find((n) => n.id === selectedId);

  const showTagDropdown = appState === "search" && filterQuery.startsWith("#") && !filterQuery.includes(" ") && !tagDropdownDismissed;
  const { filteredTags, recentTagCount } = (() => {
    if (!showTagDropdown) return { filteredTags: [], recentTagCount: 0 };
    const allTags = extractTags(notes);
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
    setFilterQuery("");
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
    const allTags = extractTags(notes);
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

  const enterEditing = useCallback((noteId: string) => {
    editingNoteIdRef.current = noteId;
    setSelectedId(noteId);
    setAppState("editing");
  }, []);

  const saveEdits = useCallback(() => {
    editingNoteIdRef.current = null;
    setNotes((prev) => {
      const note = prev.find((n) => n.id === selectedId);
      // Discard note if it's still empty when exiting editing
      if (note && note.content.trim() === "") {
        return prev.filter((n) => n.id !== selectedId);
      }
      return prev.map((n) => n.id === selectedId && n.isNew ? { ...n, isNew: false } : n);
    });
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
        if (!welcomeSeededRef.current && remoteNotes.length === 0) {
          welcomeSeededRef.current = true;
          const now = Date.now();
          const welcome: Note = { id: crypto.randomUUID(), content: "Greetings\nPress ? for keyboard shortcuts.", pinned: false, tagPinned: false, createdAt: now, updatedAt: now };
          saveNote(uid, welcome);
          setNotes([welcome]);
          setSynced(true);
          return;
        }
        welcomeSeededRef.current = true;
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

  // Demo mode: persist notes to localStorage on every change
  useEffect(() => {
    if (!demo) return;
    saveDemoNotes(notes);
  }, [demo, notes]);

  // Select first note once synced
  useEffect(() => {
    if (synced && !selectedId && notes.length > 0) {
      setSelectedId(sortNotes(notes)[0].id);
    }
  }, [synced, selectedId, notes]);

  // Keep selectedId in sync with displayed list
  useEffect(() => {
    const allDisplayed = [...displayed, ...displayedArchived];
    if (allDisplayed.length > 0 && !allDisplayed.some((n) => n.id === selectedId)) {
      setSelectedId(displayed[0]?.id ?? displayedArchived[0]?.id ?? "");
    }
  }, [displayed, displayedArchived, selectedId]);

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
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
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
          const tag = taskTagsSorted[taskMoveIndex];
          setNotes(prev => prev.map(n => {
            if (n.id !== selectedId) return n;
            const newContent = /#tasks-[\w-]+/.test(n.content)
              ? n.content.replace(/#tasks-[\w-]+/, tag)
              : n.content + (n.content.endsWith("\n") || n.content === "" ? "" : " ") + tag;
            const updated = { ...n, content: newContent, updatedAt: Date.now() };
            debouncedSave(updated);
            return updated;
          }));
          setShowTaskMove(false);
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

      if (appState === "idle") {
        if (e.key === "p" && !e.shiftKey) {
          e.preventDefault();
          if (selectedId) {
            const updated = notes.find((n) => n.id === selectedId);
            setNotes((prev) => prev.map((n) => n.id === selectedId ? { ...n, pinned: !n.pinned } : n));
            if (uid && !demo && updated) saveNote(uid, { ...updated, pinned: !updated.pinned });
          }
          return;
        }
        if (e.key === "P" && e.shiftKey) {
          e.preventDefault();
          if (selectedId) {
            const updated = notes.find((n) => n.id === selectedId);
            setNotes((prev) => prev.map((n) => n.id === selectedId ? { ...n, tagPinned: !n.tagPinned } : n));
            if (uid && !demo && updated) saveNote(uid, { ...updated, tagPinned: !updated.tagPinned });
          }
          return;
        }
        if (e.key === "c") {
          e.preventDefault();
          const newNote: Note = {
            id: crypto.randomUUID(),
            content: "",
            pinned: false,
            tagPinned: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isNew: true,
          };
          setNotes((prev) => [newNote, ...prev]);
          debouncedSave(newNote);
          enterEditing(newNote.id);
          return;
        }
        if (e.key === "Enter" || e.key === "e") {
          e.preventDefault();
          if (selectedId) enterEditing(selectedId);
          return;
        }
        if (e.key === "j" || e.key === "ArrowDown") {
          e.preventDefault();
          const idx = displayed.findIndex((n) => n.id === selectedId);
          if (idx < displayed.length - 1) {
            setSelectedId(displayed[idx + 1].id);
          }
          return;
        }
        if (e.key === "k" || e.key === "ArrowUp") {
          e.preventDefault();
          const idx = displayed.findIndex((n) => n.id === selectedId);
          if (idx > 0) {
            setSelectedId(displayed[idx - 1].id);
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
          if (selectedId) {
            const idx = displayed.findIndex((n) => n.id === selectedId);
            const next = displayed[idx + 1] ?? displayed[idx - 1] ?? displayed[0] ?? null;
            setNotes((prev) => prev.map((n) => {
              if (n.id !== selectedId) return n;
              const sep = n.content.endsWith("\n") || n.content === "" ? "" : " ";
              const newContent = n.content + sep + "#archived";
              const updated = { ...n, content: newContent, updatedAt: Date.now() };
              if (uid && !demo) archiveNote(uid, updated);
              return updated;
            }));
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
            window.open("https://notedude.app/donate", "_blank");
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
        if (e.key >= "1" && e.key <= "9" && displayed.length > 0) {
          e.preventDefault();
          const idx = e.key === "9" ? displayed.length - 1 : Math.min(Number(e.key) - 1, displayed.length - 1);
          setSelectedId(displayed[idx].id);
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
  }, [appState, selectedId, filterQuery, displayed, enterEditing, saveEdits, demo, notes]);

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

  return (
    <div ref={appRef} tabIndex={-1} data-testid="app" data-state={appState} data-theme={darkMode ? "dark" : "light"} style={{ display: "flex", flexDirection: "column", height: "100%", outline: "none", fontFamily: "'Fira Code', monospace", fontSize: 14, background: darkMode ? "#1a1a1a" : "#ffffff", color: darkMode ? "#e8e8e8" : "#000000" }}>
      {/* Top Pane */}
      <div data-testid="top-pane" style={{ padding: "8px 8px 8px 8px", display: "flex", alignItems: "center" }}>
        <span style={{ userSelect: "none", marginRight: 4 }}>&gt;</span>
        <input
          ref={searchRef}
          type="search"
          role="searchbox"
          placeholder="search notes..."
          value={filterQuery}
          onChange={(e) => { setFilterQuery(e.target.value); setSelectedTagIndex(-1); setTagDropdownDismissed(false); }}
          readOnly={appState !== "search"}
          onClick={() => { if (appState !== "search") { setAppState("search"); } }}
          style={{ width: "100%", padding: "4px 0", fontFamily: "inherit", fontSize: "inherit", border: "none", outline: "none", background: "transparent", color: "inherit" }}
        />
      </div>
      {showTagDropdown && filteredTags.length > 0 && (
        <div data-testid="tag-dropdown" style={{ padding: "4px 8px", background: darkMode ? "#2a2a2a" : "#f5f5f5" }}>
          {filteredTags.map(({ tag }, i) => (
            <div key={tag}>
              {i === recentTagCount && recentTagCount > 0 && recentTagCount < filteredTags.length && (
                <div data-testid="tag-separator" style={{ borderTop: `1px solid ${darkMode ? "#444" : "#ccc"}`, margin: "4px 0" }} />
              )}
              <div
                data-testid="tag-item"
                data-selected={i === selectedTagIndex ? "true" : "false"}
                onClick={() => selectTag(tag)}
                style={{ padding: "4px 8px", cursor: "pointer", background: i === selectedTagIndex ? (darkMode ? "#3a3a6a" : "#e0e7ff") : "transparent" }}
              >
                {tag}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ overflow: "hidden", whiteSpace: "nowrap", color: darkMode ? "#555" : "#000", lineHeight: "1.4", userSelect: "none", fontSize: 14 }}>
        {"- ".repeat(300)}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* List Pane */}
        <div ref={listPaneRef} data-testid="list-pane" style={{ width: 250, overflowY: "auto" }}>
          {[...displayed, ...displayedArchived].map((note, i) => {
            const isArchivedDivider = i === displayed.length && displayedArchived.length > 0;
            return (
              <React.Fragment key={note.id}>
                {isArchivedDivider && (
                  <div data-testid="archived-divider" style={{ fontSize: 10, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.08em", padding: "6px 8px 2px", userSelect: "none" }}>
                    archived
                  </div>
                )}
                <div
                  data-testid="note-item"
                  data-selected={note.id === selectedId ? "true" : "false"}
                  data-pinned={note.pinned ? "true" : "false"}
                  data-tagpinned={note.tagPinned ? "true" : "false"}
                  data-flash={note.id === saveFlashId ? "true" : "false"}
                  onClick={() => setSelectedId(note.id)}
                  style={{
                    padding: 8,
                    cursor: "pointer",
                    background: note.id === saveFlashId
                      ? (darkMode ? "#1a7a1a" : "#6fcf7f")
                      : note.id === selectedId ? (darkMode ? "#3a3a6a" : "#e0e7ff") : "transparent",
                    transition: "background 0.3s ease",
                    opacity: isArchived(note) ? 0.5 : 1,
                  }}
                >
                  <div data-testid="note-item-title" style={{ fontWeight: 400, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {(() => { const b = getPinBullets(note); return (<>{b.circle && <span style={{ marginRight: 2 }}>○</span>}{b.hash && <span style={{ fontSize: "0.75em", opacity: 0.6, marginRight: 2 }}>#</span>}</>); })()}
                    {getNoteTitle(note)}
                  </div>
                  <div data-testid="note-item-meta" style={{ fontSize: 12, color: darkMode ? "#999" : "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {formatTimestamp(note.createdAt)} | {getNoteMetaSnippet(note)}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div data-testid="divider" style={{ overflow: "hidden", whiteSpace: "pre", color: darkMode ? "#555" : "#000", lineHeight: "1.4", userSelect: "none", width: "1ch", fontSize: 14 }}>
          {("|\n").repeat(dividerRows)}
        </div>
        {/* Content Pane */}
        <div data-testid="content-pane" style={{ flex: 1, padding: 16, overflowY: "auto", position: "relative" }}>
          {selectedNote && appState === "editing" && selectedNote.id === selectedId ? (
            <>
              <textarea
                ref={editorRef}
                role="textbox"
                value={selectedNote.content}
                onChange={handleContentChange}
                onPaste={handlePaste}
                onSelect={(e) => {
                  const ta = e.target as HTMLTextAreaElement;
                  const pos = ta.selectionStart ?? 0;
                  setEditorCursorPos(pos);
                  setEditorDropdownPos(getCursorPixelPos(ta, pos));
                }}
                style={{ width: "100%", height: "100%", border: "none", outline: "none", resize: "none", fontFamily: "inherit", fontSize: "inherit", background: "transparent", color: "inherit" }}
              />
              {showEditorTagDropdown && editorFilteredTags.length > 0 && (
                <div
                  data-testid="editor-tag-dropdown"
                  style={{ position: "absolute", top: editorDropdownPos.top, left: editorDropdownPos.left, background: darkMode ? "#2a2a2a" : "#f5f5f5", border: `1px solid ${darkMode ? "#444" : "#ddd"}`, zIndex: 10, minWidth: 120 }}
                >
                  {editorFilteredTags.map(({ tag }, i) => (
                    <div key={tag}>
                      {i === editorRecentTagCount && editorRecentTagCount < editorFilteredTags.length && (
                        <div data-testid="editor-tag-separator" style={{ borderTop: `1px solid ${darkMode ? "#444" : "#ccc"}`, margin: "4px 0" }} />
                      )}
                      <div
                        data-testid="editor-tag-item"
                        data-selected={i === editorTagIndex ? "true" : "false"}
                        onMouseDown={(e) => { e.preventDefault(); insertEditorTag(tag); }}
                        style={{ padding: "4px 8px", cursor: "pointer", background: i === editorTagIndex ? (darkMode ? "#3a3a6a" : "#e0e7ff") : "transparent" }}
                      >
                        {tag}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ whiteSpace: "pre-wrap", minHeight: "100%" }}>{renderWithLinks(selectedNote?.content ?? "")}</div>
          )}
        </div>
      </div>
      <div style={{ padding: "8px", textAlign: "center", fontSize: 12, color: "#888", userSelect: "none" }}>
        notedude &bull; an <a href="mailto:nbinoinfo@gmail.com" target="_blank" rel="noopener noreferrer" style={{ color: "#888", textDecoration: "underline" }}>nbino</a> production
      </div>
      {showHelp && (
        <div
          data-testid="help-overlay"
          onClick={() => setShowHelp(false)}
          style={{ position: "fixed", inset: 0, background: darkMode ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, fontFamily: "inherit" }}
        >
          <div style={{ maxWidth: 560, width: "100%", padding: "32px 40px", color: darkMode ? "#e8e8e8" : "#000", overflowY: "auto", maxHeight: "90vh" }}>
            <div style={{ marginBottom: 24, fontSize: 16 }}>keyboard shortcuts</div>
            {([
              ["navigation", [
                ["j / ↓",   "next note"],
                ["k / ↑",   "previous note"],
                ["1 – 9",   "jump to note by position"],
                ["⌘[ / ⌘]", "navigate back / forward in history"],
                ["c",       "create new note"],
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
                ["Shift+Y", "archive note (tags #archived, hidden in idle)"],
                ["d → m",   "toggle dark mode"],
                ["d → d",   "open donate page"],
                ["r → r",   "report an issue"],
                ["l → l",   "log out"],
                ["?",       "show this"],
              ]],
            ] as [string, [string, string][]][]).map(([section, rows]) => (
              <div key={section} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{section}</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <tbody>
                    {rows.map(([key, desc]) => (
                      <tr key={key}>
                        <td style={{ paddingBottom: 6, paddingRight: 32, whiteSpace: "nowrap", opacity: 0.5, width: 100 }}>{key}</td>
                        <td style={{ paddingBottom: 6 }}>{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.4 }}>press any key or click to close</div>
          </div>
        </div>
      )}
      {showTaskMove && (
        <div
          data-testid="task-move-overlay"
          onClick={() => setShowTaskMove(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: darkMode ? "#2a2a2a" : "#fff", border: `1px solid ${darkMode ? "#555" : "#ccc"}`, borderRadius: 6, padding: "16px 24px", minWidth: 220, fontFamily: "'Fira Code', monospace", fontSize: 14 }}
          >
            <div style={{ marginBottom: 12, fontSize: 12, opacity: 0.5 }}>move note to task list</div>
            {taskTagsSorted.map((tag, i) => (
              <div
                key={tag}
                data-testid="task-move-item"
                data-selected={i === taskMoveIndex ? "true" : "false"}
                onClick={() => {
                  if (!selectedId) return;
                  const t = tag;
                  setNotes(prev => prev.map(n => {
                    if (n.id !== selectedId) return n;
                    const newContent = /#tasks-[\w-]+/.test(n.content)
                      ? n.content.replace(/#tasks-[\w-]+/, t)
                      : n.content + (n.content.endsWith("\n") || n.content === "" ? "" : " ") + t;
                    const updated = { ...n, content: newContent, updatedAt: Date.now() };
                    debouncedSave(updated);
                    return updated;
                  }));
                  setShowTaskMove(false);
                }}
                style={{ padding: "6px 8px", borderRadius: 4, cursor: "pointer", background: i === taskMoveIndex ? (darkMode ? "#444" : "#e8e8e8") : "transparent", color: darkMode ? "#e8e8e8" : "#000" }}
              >
                {tag}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
