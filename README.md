# notedude

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

```bash
npm test              # unit + E2E
npm run test:unit     # unit only (instant)
npm run test:e2e      # E2E only
npm run test:firebase # emulator-backed suite
npm run typecheck     # tsc --noEmit over src/, e2e/ and the unit tests
```

CI runs all three suites and the deploy is gated on every one of them.

### Unit suite (no browser)

```bash
npm run test:unit
npm run test:unit:watch
```

Vitest + happy-dom, colocated as `src/lib/*.test.ts`. Covers the pure logic: note titles and
snippets, tag arithmetic, tag extraction, timestamp formatting, the pasted-HTML converter,
share-target handling, and the popup-vs-redirect sign-in decision.

Two of those are unreachable from the browser suite — `formatTimestamp`'s today/this-week
branches (every seed note is dated epoch 1970) and `prefersRedirect()` (Playwright cannot
install a PWA).

### E2E suite (no Firebase required)

```bash
npm run test:e2e
```

Runs against the local dev server using in-memory seed data. No Firebase account or emulator
needed. On CI it runs against the built static export instead, which is both far faster and
the artifact that actually ships.

### Firebase roundtrip suite

Tests real Firestore reads/writes against a local Firebase emulator, and is the only thing
that exercises `firestore.rules`. Requires Java for the Firestore emulator.

```bash
# Install Java if needed
brew install --cask temurin

npm run test:firebase
```

When `FIREBASE_ROUNDTRIP=true`:
- Dev server starts on **port 3001** with `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (on CI, the
  static export is built with that flag and served instead)
- Firebase Auth (port 9099) and Firestore (port 8080) emulators start automatically, using the
  `firebase-tools` in `node_modules` — no global CLI needed
- A test user is created in the emulator and signed in via `window.__testSignIn`
- Coverage includes reload persistence, cross-session sync, welcome-note seeding, the #74
  lost-update regression, undo/redo persistence, and the Security Rules field whitelist and
  size cap

### Headless vs headed

Everything runs **headless** by default. To watch a run in a real browser window:

```bash
HEADED=1 npm run test:e2e     # or: npm run test:e2e:headed
HEADED=1 npm run test:firebase
```

Reserve headed mode for runs that need a human in the loop, such as a real Google sign-in.
Nothing in the committed suites requires it.

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
