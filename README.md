# NoteDude

A keyboard-driven note-taking app. Built with Next.js, Firebase, and Playwright.

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

### Standard suite (97 tests, no Firebase required)

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
npm run build        # outputs to /out
firebase deploy --only hosting
```

Live at: **https://notedude2.web.app**

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `c` | Create new note |
| `Enter` | Edit selected note |
| `/` | Open search |
| `j` / `↓` | Next note |
| `k` / `↑` | Previous note |
| `1`–`9` | Jump to note by position |
| `p` | Toggle pin on selected note |
| `Esc` | Save / exit editing or search |
| `Esc Esc` | Clear active filter |
| `t` → `i` | Filter `#tasks-inbox` |
| `t` → `t` | Filter `#tasks-today` |
| `t` → `n` | Filter `#tasks-nearterm` |
| `t` → `l` | Filter `#tasks-longterm` |
| `d` → `d` | Open donate page |
| `d` → `m` | Toggle dark mode |
