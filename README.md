# notedude

A keyboard-driven note-taking app. Built with Next.js, Firebase, and Playwright.

## What it's for

Consulting work splits naturally into clients, and clients into projects. Each client-project
has a handful of facts you reach for constantly — the git repository, environment URLs, where
the credentials live, who to ask — and then a long tail of ordinary notes: meeting records,
decisions, scratch work.

The awkward part is that the constant facts and the long tail belong together. Keep them in
separate apps and you maintain two systems; keep them in one flat list and the reference note
sinks under everything written since.

notedude's answer is **tag-pinning**. Tag a note with the context it belongs to, filter to
that context, and `Shift+P` pins the note to the top of *that filter only*:

```
#client_bob_proj1  Repo: github.com/acme/bob-proj1
                   Staging: staging.bob.example.com
                   Prod: bob.example.com · creds in 1Password "Bob / proj1"
                   PM: Dana (dana@…), standup Tue 09:00
```

Press `/`, type `#client_bob_proj1`, and that note is first — every time, including the thirty
seconds before a call starts. Everything else tagged the same way sits underneath in the usual
most-recent-first order.

Because the pin is scoped to the note's **first tag**, it only applies in its own context. The
same note sorts like any other when you filter by `#meeting`, or when you are browsing with no
filter at all — so one pinned reference note per client-project never crowds another view. Plain
`p` is the separate, unscoped pin for notes that should sit on top of the whole list.

## Stack

- **Next.js** (App Router, static export)
- **Firebase** — Auth (Google sign-in) + Firestore (note storage)
- **Tailwind CSS**
- **Playwright** — E2E tests

## Development

```bash
npm install
npm run dev          # start dev server at localhost:3000
```

To skip Google auth and use local seed notes:

```bash
NEXT_PUBLIC_SKIP_AUTH=true npm run dev
```

## Testing

### Standard suite (no Firebase required)

```bash
npx playwright test
```

Runs against the local dev server using in-memory seed data. No Firebase account or emulator needed.

### Firebase roundtrip suite

Tests actual Firestore reads/writes against a local Firebase emulator. Requires Java (for the Firestore emulator).

```bash
# Install Java if needed
brew install --cask temurin

# Run the roundtrip suite
FIREBASE_ROUNDTRIP=true npx playwright test
```

When `FIREBASE_ROUNDTRIP=true`:
- Dev server starts on **port 3001** with `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`
- Firebase Auth (port 9099) and Firestore (port 8080) emulators start automatically
- A test user is created in the emulator and signed in headlessly via `window.__testSignIn`
- Two tests run:
  1. **Reload persistence** — create a note, reload, confirm it survived
  2. **Cross-session sync** — write a note in one browser context, open a second, confirm it appears

## Deployment

```bash
npm run deploy           # build + deploy to production
npm run deploy:staging   # build + deploy to staging channel (30-day URL)
```

- **Production**: https://notedude2.web.app
- **Staging**: `https://notedude2--staging-<hash>.web.app` (printed after deploy)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `c` | Create new note, inheriting the active filter's tags |
| `Shift+C` | Clear the filter, create a blank note |
| `e` | Edit selected note |
| `/` | Open search |
| `j` / `↓` | Next note |
| `k` / `↑` | Previous note |
| `1`–`9` | Jump to note by position |
| `p` | Toggle pin — top of the list in idle mode |
| `Shift+P` | Toggle tag-pin — top of the filter matching the note's first tag |
| `Shift+Y` | Archive selected note |
| `d` → `d` | Permanently delete selected note (archived notes only) |
| `z` / `Shift+Z` | Undo / redo the last action, text edits included |
| `Esc` | Save / exit editing or search |
| `Cmd+Enter` | Save and exit editing |
| `Esc Esc` | Clear active filter |
| `t` → `i` / `t` / `n` / `l` / `d` | Filter `#tasks-inbox` / `-today` / `-nearterm` / `-longterm` / `-done` |
| `t` → `m` | Move selected note to a task list |
| `?` / `Cmd+/` | Keyboard shortcuts overlay |
| `Shift+D` | Open donate page |
| `d` → `m` | Toggle dark mode |

`spec.md` carries the full list, including the editor's Markdown shortcuts.
