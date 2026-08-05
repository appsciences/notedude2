"use client";

/**
 * Component gallery for @notedude/ui.
 *
 * Every component in the library is rendered here with representative props. It exists for
 * two reasons: `e2e/ui-gallery.spec.ts` drives its contract tests through this page, and it
 * is the set of worked usage examples the design-system export is generated from.
 *
 * Nothing here reaches Firestore or the auth layer — the library is presentational, so the
 * gallery hands it plain data and records what it calls back with.
 */

import React, { useEffect, useState } from "react";
import {
  AccountHeader,
  Button,
  Footer,
  HelpOverlay,
  LoadingScreen,
  LoginScreen,
  MobileToolbar,
  NoteContent,
  NoteEditor,
  NoteList,
  NoteText,
  PaneDivider,
  Rule,
  SearchBar,
  TagDropdown,
  TaskMoveDialog,
  ThemeProvider,
  tokens,
  type NoteSummary,
  type ShortcutSection,
  type ThemeName,
} from "@notedude/ui";

// Fixed and well in the past, so the rendered timestamps never depend on the run date.
const T = Date.UTC(2020, 2, 15, 12, 0, 0);

const NOTES: NoteSummary[] = [
  { id: "n1", content: "Welcome to notedude #intro\nYour keyboard-driven note app.", pinned: true, tagPinned: false, createdAt: T },
  { id: "n2", content: "Getting started #guide\nPress 'c' to create a new note.", pinned: false, tagPinned: true, createdAt: T },
  { id: "n3", content: "\n\nburied title\nand its body", pinned: false, tagPinned: false, createdAt: T },
  { id: "n4", content: " #project", pinned: false, tagPinned: false, createdAt: T, isNew: true },
];

const ARCHIVED: NoteSummary[] = [
  { id: "n5", content: "Old thoughts #archived\nkept, but out of the way", pinned: false, tagPinned: false, createdAt: T },
];

const TAGS = [
  { tag: "#intro", lastUsed: T },
  { tag: "#guide", lastUsed: T },
  { tag: "#project", lastUsed: T },
];

const SHORTCUTS: ShortcutSection[] = [
  ["navigation", [["j / ↓", "next note"], ["k / ↑", "previous note"]]],
  ["etc", [["?", "show this"]]],
];

const TASK_TAGS = ["#tasks-inbox", "#tasks-today", "#tasks-done"];

const NOTE_BODY =
  "A note with a link: https://example.com/notes\nand a second line below it.";

function Section({ name, title, children }: { name: string; title: string; children: React.ReactNode }) {
  return (
    <section
      data-testid={`gallery-${name}`}
      style={{ marginBottom: tokens.space.xxl, position: "relative" }}
    >
      <h2
        style={{
          fontSize: tokens.fontSizes.xs,
          opacity: tokens.opacities.label,
          textTransform: "uppercase",
          letterSpacing: tokens.letterSpacings.label,
          marginBottom: tokens.space.md,
          fontWeight: 400,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Overlays and screens paint themselves over the whole viewport, which would bury the rest
 * of the gallery and swallow its clicks. `transform` makes this box the containing block
 * for `position: fixed` descendants, so an overlay fills the stage instead of the window —
 * the one reliable way to pin a fixed element without altering the component itself.
 */
function Stage({ height = 260, children }: { height?: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        height,
        overflow: "hidden",
        transform: "translateZ(0)",
        border: `1px dashed ${tokens.colors.border.default.dark}`,
      }}
    >
      {children}
    </div>
  );
}

export default function UiGalleryPage() {
  // Read after mount, never during render. The app is a static export, so the prerendered
  // HTML has no query string to consult — deriving the theme inline would disagree with the
  // server markup and trip a hydration mismatch. Tests poll for the corrected value.
  const [theme, setTheme] = useState<ThemeName>("dark");
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    setTheme(requested === "light" ? "light" : "dark");
  }, []);

  const [lastEvent, setLastEvent] = useState("");
  const [query, setQuery] = useState("#in");
  const [draft, setDraft] = useState(NOTE_BODY);

  return (
    <ThemeProvider theme={theme}>
      <div
        data-testid="gallery"
        style={{
          minHeight: "100vh",
          background: tokens.colors.bg.app[theme],
          color: tokens.colors.fg.default[theme],
          fontFamily: tokens.fonts.mono,
          fontSize: tokens.fontSizes.md,
          padding: tokens.space.xl,
        }}
      >
        <div style={{ marginBottom: tokens.space.xl }}>
          notedude design system —{" "}
          <span data-testid="last-event" style={{ opacity: tokens.opacities.dim }}>
            {lastEvent}
          </span>
        </div>

        <Section name="buttons" title="Button">
          <div style={{ display: "flex", gap: tokens.space.lg, alignItems: "center", flexWrap: "wrap" }}>
            <Button onClick={() => setLastEvent("button:default")}>⏎ sign in with google</Button>
            <Button variant="outline" onClick={() => setLastEvent("button:outline")}>
              <u>d</u>emo mode
            </Button>
            <Button variant="link" onClick={() => setLastEvent("button:link")}>logout</Button>
            <div style={{ display: "flex", width: 240 }}>
              <Button variant="toolbar" onClick={() => setLastEvent("button:toolbar")}>+ new note</Button>
            </div>
          </div>
        </Section>

        <Section name="rule" title="Rule">
          <Rule />
        </Section>

        <Section name="divider" title="PaneDivider">
          <div style={{ display: "flex", height: 80 }}>
            <PaneDivider rows={8} />
          </div>
        </Section>

        <Section name="searchbar" title="SearchBar">
          <SearchBar value={query} onChange={setQuery} active onActivate={() => setLastEvent("search:activate")} />
        </Section>

        <Section name="tag-dropdown-search" title="TagDropdown — search">
          <div style={{ position: "relative", height: 120 }}>
            <TagDropdown
              variant="search"
              tags={TAGS}
              selectedIndex={0}
              recentCount={1}
              onSelect={(tag) => setLastEvent(`tag:${tag}`)}
            />
          </div>
        </Section>

        <Section name="tag-dropdown-editor" title="TagDropdown — editor">
          <div style={{ position: "relative", height: 120 }}>
            <TagDropdown
              variant="editor"
              tags={TAGS}
              selectedIndex={-1}
              recentCount={2}
              position={{ top: 0, left: 0 }}
              onSelect={(tag) => setLastEvent(`editor-tag:${tag}`)}
            />
          </div>
        </Section>

        <Section name="note-list" title="NoteList">
          <NoteList
            notes={NOTES}
            archivedNotes={ARCHIVED}
            selectedId="n1"
            flashingId={null}
            onSelect={(id) => setLastEvent(`select:${id}`)}
          />
        </Section>

        <Section name="note-content" title="NoteContent — read">
          <Stage height={140}>
            <NoteContent onClick={() => setLastEvent("content:click")}>
              <NoteText content={NOTE_BODY} />
            </NoteContent>
          </Stage>
        </Section>

        <Section name="note-editor" title="NoteEditor">
          <Stage height={140}>
            <NoteContent>
              <NoteEditor value={draft} onChange={(e) => setDraft(e.target.value)} />
            </NoteContent>
          </Stage>
        </Section>

        <Section name="help-overlay" title="HelpOverlay">
          <Stage height={320}>
            <HelpOverlay sections={SHORTCUTS} onDismiss={() => setLastEvent("help:dismiss")} />
          </Stage>
        </Section>

        <Section name="task-move-dialog" title="TaskMoveDialog">
          <Stage height={260}>
            <TaskMoveDialog
              tags={TASK_TAGS}
              selectedIndex={1}
              onSelect={(tag) => setLastEvent(`task:${tag}`)}
              onDismiss={() => setLastEvent("task:dismiss")}
            />
          </Stage>
        </Section>

        <Section name="mobile-toolbar" title="MobileToolbar">
          <MobileToolbar
            view="list"
            onCompose={() => setLastEvent("compose")}
            onBack={() => setLastEvent("back")}
          />
        </Section>

        <Section name="account-header" title="AccountHeader">
          <AccountHeader>
            leo@example.com
            <Button variant="link" style={{ marginLeft: tokens.space.md }} onClick={() => setLastEvent("logout")}>
              logout
            </Button>
          </AccountHeader>
        </Section>

        <Section name="footer" title="Footer">
          <Footer />
        </Section>

        <Section name="login-screen" title="LoginScreen">
          <Stage height={320}>
            <LoginScreen
              onSignIn={() => setLastEvent("signin")}
              onDemo={() => setLastEvent("demo")}
              error="Sign-in was cancelled."
            />
          </Stage>
        </Section>

        <Section name="loading-screen" title="LoadingScreen">
          <Stage height={120}>
            <LoadingScreen />
          </Stage>
        </Section>
      </div>
    </ThemeProvider>
  );
}
