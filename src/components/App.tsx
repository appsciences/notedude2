"use client";

import { useState, useRef, useEffect, useCallback } from "react";

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
  { id: "1", content: "Welcome to NoteDude\nYour keyboard-driven note app.", pinned: true, createdAt: 1, updatedAt: 1 },
  { id: "2", content: "Getting started\nPress 'c' to create a new note.\nPress '/' to search.", pinned: false, createdAt: 2, updatedAt: 2 },
  { id: "3", content: "Keyboard shortcuts\nEnter to edit, Esc to save.", pinned: false, createdAt: 3, updatedAt: 3 },
];

function getNoteTitle(note: Note): string {
  if (note.isNew && note.content === "") return "New Note";
  const firstLine = note.content.split("\n")[0];
  return firstLine || "No Text Entered";
}

function getNoteMetaSnippet(note: Note): string {
  const firstLine = note.content.split("\n")[0];
  if (!firstLine) return "No Content";
  return firstLine.length > 30 ? firstLine.slice(0, 30) + "…" : firstLine;
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

export default function App() {
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [selectedId, setSelectedId] = useState<string>(INITIAL_NOTES[0].id);
  const [appState, setAppState] = useState<AppState>("idle");
  const [filterQuery, setFilterQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const appRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const displayed = (() => {
    const sorted = sortNotes(notes);
    const filtered = activeFilter
      ? sorted.filter((n) => n.content.toLowerCase().includes(activeFilter.toLowerCase()))
      : sorted;
    return filtered;
  })();

  const selectedNote = notes.find((n) => n.id === selectedId);

  const enterEditing = useCallback((noteId: string) => {
    setSelectedId(noteId);
    setAppState("editing");
  }, []);

  const saveEdits = useCallback(() => {
    // Clear isNew flag on save so a still-empty note shows "No Text Entered"
    setNotes((prev) =>
      prev.map((n) => n.id === selectedId && n.isNew ? { ...n, isNew: false } : n)
    );
    setAppState("idle");
  }, [selectedId]);

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
          setActiveFilter("");
          setFilterQuery("");
          return;
        }
      }

      if (appState === "editing") {
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
        if (e.key === "Enter") {
          e.preventDefault();
          setActiveFilter(filterQuery);
          setAppState("idle");
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setActiveFilter("");
          setFilterQuery("");
          setAppState("idle");
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appState, selectedId, filterQuery, displayed, enterEditing, saveEdits]);

  const handleContentChange = (value: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === selectedId ? { ...n, content: value, updatedAt: Date.now(), isNew: false } : n
      )
    );
  };

  return (
    <div ref={appRef} tabIndex={-1} data-testid="app" data-state={appState} style={{ display: "flex", flexDirection: "column", height: "100vh", outline: "none", fontFamily: "'Fira Code', monospace", fontSize: 14 }}>
      {/* Top Pane */}
      <div data-testid="top-pane" style={{ padding: 8 }}>
        <input
          ref={searchRef}
          type="search"
          role="searchbox"
          placeholder="Search notes..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          readOnly={appState !== "search"}
          style={{ width: "100%", padding: 8, fontFamily: "inherit", fontSize: "inherit" }}
        />
      </div>
      <div style={{ overflow: "hidden", whiteSpace: "nowrap", color: "#999", lineHeight: "1", userSelect: "none" }}>
        {"─".repeat(300)}
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
              <div data-testid="note-item-title" style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {getNoteTitle(note)}
              </div>
              <div data-testid="note-item-meta" style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {formatTimestamp(note.createdAt)} &middot; {getNoteMetaSnippet(note)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ overflow: "hidden", whiteSpace: "pre", color: "#999", lineHeight: "1.15", userSelect: "none", width: "1ch" }}>
          {("│\n").repeat(200)}
        </div>
        {/* Content Pane */}
        <div data-testid="content-pane" style={{ flex: 1, padding: 16, overflowY: "auto" }}>
          {selectedNote && appState === "editing" && selectedNote.id === selectedId ? (
            <textarea
              ref={editorRef}
              role="textbox"
              value={selectedNote.content}
              onChange={(e) => handleContentChange(e.target.value)}
              style={{ width: "100%", height: "100%", border: "none", outline: "none", resize: "none", fontFamily: "inherit", fontSize: "inherit" }}
            />
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{selectedNote?.content}</div>
          )}
        </div>
      </div>
    </div>
  );
}
