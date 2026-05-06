"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { subscribeToNotes, saveNote, type NoteData } from "../lib/notes";

interface Note {
  id: string;
  content: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  isNew?: boolean; // true until the user edits content for the first time
}

type AppState = "idle" | "editing" | "search";

const INITIAL_NOTES: Note[] = [
  { id: "1", content: "Welcome to NoteDude #intro\nYour keyboard-driven note app.", pinned: true, createdAt: 1, updatedAt: 1 },
  { id: "2", content: "Getting started #intro #guide\nPress 'c' to create a new note.\nPress '/' to search.", pinned: false, createdAt: 2, updatedAt: 2 },
  { id: "3", content: "Keyboard shortcuts #guide\nEnter to edit, Esc to save.", pinned: false, createdAt: 3, updatedAt: 3 },
];

function getNoteTitle(note: Note): string {
  if (note.isNew && note.content === "") return "New Note";
  const firstLine = note.content.split("\n")[0];
  return firstLine || "No Text Entered";
}

function getNoteMetaSnippet(note: Note): string {
  const lines = note.content.split("\n");
  if (!lines[0]) return "No Content";
  const secondLine = lines[1] ?? "";
  return secondLine.length > 30 ? secondLine.slice(0, 30) + "…" : secondLine;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

// Returns the '#word' token immediately before the cursor, or null if none.
function getHashTokenBeforeCursor(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(/#[\w-]*$/);
  return match ? match[0] : null;
}

export default function App({ uid }: { uid?: string }) {
  const [notes, setNotes] = useState<Note[]>(uid ? [] : INITIAL_NOTES);
  const [selectedId, setSelectedId] = useState<string>(uid ? "" : INITIAL_NOTES[0].id);
  const [synced, setSynced] = useState(!uid); // true when initial load is done
  const [appState, setAppState] = useState<AppState>("idle");
  const [filterQuery, setFilterQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [selectedTagIndex, setSelectedTagIndex] = useState(-1);
  const [tagDropdownDismissed, setTagDropdownDismissed] = useState(false);
  const [editorTagIndex, setEditorTagIndex] = useState(-1);
  const [editorTagDismissed, setEditorTagDismissed] = useState(false);
  const [editorCursorPos, setEditorCursorPos] = useState(0);

  const appRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastEscRef = useRef<number>(0);

  const displayed = (() => {
    const sorted = sortNotes(notes);
    const query = appState === "search" ? filterQuery : activeFilter;
    if (!query.trim()) return sorted;
    return sorted.filter((n) => {
      const lower = n.content.toLowerCase();
      const parts = query.trim().split(/\s+/);
      return parts.every((part) => {
        if (part.startsWith("#")) {
          const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`${escaped}(?=[\\s,.]|$)`, "i").test(n.content);
        }
        return lower.includes(part.toLowerCase());
      });
    });
  })();

  const selectedNote = notes.find((n) => n.id === selectedId);

  const showTagDropdown = appState === "search" && filterQuery.startsWith("#") && !filterQuery.includes(" ") && !tagDropdownDismissed;
  const filteredTags = (() => {
    if (!showTagDropdown) return [];
    const allTags = extractTags(notes);
    const query = filterQuery.toLowerCase().slice(1); // remove '#'
    return query ? allTags.filter((t) => t.tag.slice(1).startsWith(query)) : allTags;
  })();

  const insertTag = useCallback((tag: string) => {
    setFilterQuery(tag + " ");
    setSelectedTagIndex(-1);
    searchRef.current?.focus();
  }, []);

  const selectTag = useCallback((tag: string) => {
    setActiveFilter(tag);
    setFilterQuery("");
    setSelectedTagIndex(-1);
    setAppState("idle");
  }, []);

  // Editor tag completion
  const editorHashToken = (() => {
    if (appState !== "editing" || editorTagDismissed) return null;
    const content = notes.find((n) => n.id === selectedId)?.content ?? "";
    return getHashTokenBeforeCursor(content, editorCursorPos);
  })();
  const showEditorTagDropdown = editorHashToken !== null;
  const editorFilteredTags = (() => {
    if (!showEditorTagDropdown) return [];
    const allTags = extractTags(notes);
    const token = (editorHashToken ?? "").toLowerCase();
    const query = token.slice(1);
    // Exclude the exact token being typed (it's a partial match from the current note)
    return allTags.filter((t) => t.tag !== token && (query ? t.tag.slice(1).startsWith(query) : true));
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
    setSelectedId(noteId);
    setAppState("editing");
  }, []);

  const saveEdits = useCallback(() => {
    // Clear isNew flag on save so a still-empty note shows "No Text Entered"
    setNotes((prev) =>
      prev.map((n) => n.id === selectedId && n.isNew ? { ...n, isNew: false } : n)
    );
    flushSave();
    setAppState("idle");
  }, [selectedId, flushSave]);

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
          // Add all remote notes, preserving local isNew flag
          for (const rn of remoteNotes) {
            const local = localMap.get(rn.id);
            merged.push(local?.isNew ? local : { ...rn, isNew: false });
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

  // Select first note once synced
  useEffect(() => {
    if (synced && !selectedId && notes.length > 0) {
      setSelectedId(sortNotes(notes)[0].id);
    }
  }, [synced, selectedId, notes]);

  // Auto-focus app on mount
  useEffect(() => {
    appRef.current?.focus();
  }, []);

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
      if (appState === "idle") {
        if (e.key === "c") {
          e.preventDefault();
          const newNote: Note = {
            id: crypto.randomUUID(),
            content: "",
            pinned: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isNew: true,
          };
          setNotes((prev) => [newNote, ...prev]);
          debouncedSave(newNote);
          enterEditing(newNote.id);
          return;
        }
        if (e.key === "Enter") {
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
          }
          setAppState("idle");
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appState, selectedId, filterQuery, displayed, enterEditing, saveEdits]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? 0;
    setEditorCursorPos(cursor);
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
    <div ref={appRef} tabIndex={-1} data-testid="app" data-state={appState} style={{ display: "flex", flexDirection: "column", height: "100%", outline: "none", fontFamily: "'Fira Code', monospace", fontSize: 14 }}>
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
          style={{ width: "100%", padding: "4px 0", fontFamily: "inherit", fontSize: "inherit", border: "none", outline: "none", background: "transparent" }}
        />
      </div>
      {showTagDropdown && filteredTags.length > 0 && (
        <div data-testid="tag-dropdown" style={{ padding: "4px 8px", background: "#f5f5f5" }}>
          {filteredTags.map(({ tag }, i) => (
            <div
              key={tag}
              data-testid="tag-item"
              data-selected={i === selectedTagIndex ? "true" : "false"}
              onClick={() => selectTag(tag)}
              style={{ padding: "4px 8px", cursor: "pointer", background: i === selectedTagIndex ? "#e0e7ff" : "transparent" }}
            >
              {tag}
            </div>
          ))}
        </div>
      )}
      <div style={{ overflow: "hidden", whiteSpace: "nowrap", color: "#000", lineHeight: "1.4", userSelect: "none", fontSize: 14 }}>
        {"- ".repeat(300)}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* List Pane */}
        <div data-testid="list-pane" style={{ width: 250, overflowY: "auto" }}>
          {displayed.map((note) => (
            <div
              key={note.id}
              data-testid="note-item"
              data-selected={note.id === selectedId ? "true" : "false"}
              data-pinned={note.pinned ? "true" : "false"}
              onClick={() => setSelectedId(note.id)}
              style={{
                padding: 8,
                cursor: "pointer",
                background: note.id === selectedId ? "#e0e7ff" : "transparent",
              }}
            >
              <div data-testid="note-item-title" style={{ fontWeight: 400, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {getNoteTitle(note)}
              </div>
              <div data-testid="note-item-meta" style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {formatTimestamp(note.createdAt)} | {getNoteMetaSnippet(note)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ overflow: "hidden", whiteSpace: "pre", color: "#000", lineHeight: "1.4", userSelect: "none", width: "1ch", fontSize: 14 }}>
          {("|\n").repeat(200)}
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
                onSelect={(e) => setEditorCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                style={{ width: "100%", height: "100%", border: "none", outline: "none", resize: "none", fontFamily: "inherit", fontSize: "inherit" }}
              />
              {showEditorTagDropdown && editorFilteredTags.length > 0 && (
                <div
                  data-testid="editor-tag-dropdown"
                  style={{ position: "absolute", top: 0, left: 0, background: "#f5f5f5", border: "1px solid #ddd", zIndex: 10, minWidth: 120 }}
                >
                  {editorFilteredTags.map(({ tag }, i) => (
                    <div
                      key={tag}
                      data-testid="editor-tag-item"
                      data-selected={i === editorTagIndex ? "true" : "false"}
                      onMouseDown={(e) => { e.preventDefault(); insertEditorTag(tag); }}
                      style={{ padding: "4px 8px", cursor: "pointer", background: i === editorTagIndex ? "#e0e7ff" : "transparent" }}
                    >
                      {tag}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{selectedNote?.content}</div>
          )}
        </div>
      </div>
    </div>
  );
}
