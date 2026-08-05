# notedude - Specification

## Overview

A keyboard-driven note-taking app combining Google Keep's keyboard navigation with Apple Notes' layout and features. Built with Next.js.

## Mobile Support

notedude runs on phones as an installable PWA. It previously refused to load on any mobile user-agent; that block was removed in #108.

Below a **640px** viewport the three-pane layout cannot fit, so the list and content panes are shown **one at a time**:

- The list pane opens first, at full width. The content pane and the vertical rule between panes are not rendered
- Tapping a note switches to the content pane; tapping the content again edits it, as on desktop
- A toolbar (`data-testid="mobile-toolbar"`) sits above the footer carrying the two actions that are otherwise keyboard-only:
  - **+ new note** (`data-testid="mobile-compose"`) in list view — equivalent to `c`, and inherits the active filter's tags the same way
  - **← notes** (`data-testid="mobile-back"`) in content view — equivalent to `Esc`: it commits the edit, then returns to the list
- Entering editing by any route — including `c` from a hardware keyboard on a narrow window — surfaces the content pane
- At 640px and above the layout, the toolbar, and every keyboard shortcut are **unchanged**

The breakpoint is evaluated on the client after mount, so the server-rendered markup is always the desktop layout (the app is a static export and has no request-time viewport).

### Web Share Target

The manifest registers notedude as an Android share target, so text can be sent to it from any app without opening notedude first.

- Android opens `/share` with `title`, `text` and `url` query params (`method: "GET"` — a POST target would need a service worker fetch handler, which the static export does not have)
- `/share` joins the non-empty values with newlines in that order, dropping duplicates — a shared link commonly arrives as both `text` and `url`
- The result is parked in `localStorage` under `notedude:pendingShare`, and the route `replace`s itself with `/`, so a back press from the note leaves the app rather than re-triggering the share
- **Hosting**: the static export emits this route as `share.html`, not `share/index.html`, so Firebase's catch-all rewrite (`**` → `/index.html`) would otherwise swallow `/share` and serve the root page — silently doing nothing. `firebase.json` carries an explicit `/share` → `/share.html` rewrite **above** the catch-all, since the first matching rewrite wins. The same catch-all still shadows `/test`, which is why that route resolves to the login page in production
- The app claims a parked share on mount, **exactly once** (claiming clears the key, so a reload cannot resurrect it), and opens it as a new note

Unlike a note created with `c`, a shared note is **written immediately** and is never subject to the discard-if-untouched rule (see **Composing a Note**): its content came from a deliberate action in another app, so it is real from the start.

If no user is signed in when the share arrives, the payload stays parked and is claimed after sign-in.

### Sign-in: popup vs redirect

`signInWithPopup` is the flow for **every** client, including the installed desktop PWA.

The sole exception is **iOS standalone** — a home-screen app on iOS or iPadOS — where a popup opens in a detached context that never returns a credential (#111). That client, and only that client, uses `signInWithRedirect`. It is identified by an iOS user-agent (or an iPadOS one, which reports as a Mac and is disambiguated by `maxTouchPoints`) *combined with* standalone display mode; `navigator.standalone` is the iOS-only signal for the same thing.

The rule is deliberately narrow because the broad version regressed the desktop PWA (#132). Routing *any* `display-mode: standalone` client — or any device whose **primary** pointer is coarse — to the redirect meant an installed desktop PWA took the redirect path, where the Google account chooser appeared and picking an account returned the user to the login screen, signed out and with no error.

`signInWithRedirect` is unreliable on this deployment for **any** client. The app is served from `notedude2.web.app` / `app.notedude.app` while Firebase's `authDomain` is `notedude2.firebaseapp.com`, and the SDK hands the credential back by reading state through a hidden iframe at `https://<authDomain>/__/auth/iframe`. Chrome 115+ partitions third-party storage, so that iframe reads nothing and `getRedirectResult()` resolves empty. The real fix is a same-origin `authDomain`: Firebase Hosting already serves `/__/auth/handler` and `/__/auth/iframe` on every domain of the project (and exempts those reserved paths from the `X-Frame-Options: DENY` header `firebase.json` applies to `**`), but switching also requires registering `https://<host>/__/auth/handler` as an authorized OAuth redirect URI, which is a console change (#132).

The redirect result is claimed on mount before the auth listener is attached, so a returning user is not flashed the login screen.

A failed sign-in **shows an error on the login screen**. Failures used to be invisible: `auth/popup-closed-by-user` was discarded and every other error became an unhandled rejection, so a broken sign-in was indistinguishable from a no-op. Deliberately dismissing the popup is still silent — that is a user choice, not a failure.

### Install appearance

`background_color` and `theme_color` in the manifest are `#1a1a1a`, matching the app's dark default. They previously described a white/black app, which made the generated launch splash flash white on every cold start of the installed PWA (#109).

## UI Layout

The app consists of three panes:

### The page never scrolls

The app owns exactly the viewport and no more. The document itself is **never scrollable**: `scrollHeight` always equals the viewport height, in every state — idle, search, with the tag dropdown open, and while browsing filtered results. Scrolling happens **inside** the list pane and the content pane, never at the page level.

This is a correctness requirement, not a cosmetic one. When the page can scroll, the account header scrolls out of view and the whole UI appears to drift up and down as the note list changes size underneath it. See #124.

Three rules keep it true:

- `html` and `body` carry no margin and are exactly viewport-height. Without this the default 8px body margin alone makes a `100vh` child overflow by 16px.
- Every flex item in the vertical chain that wraps a scrollable region sets **`min-height: 0`**. A flex item's default `min-height: auto` resolves to its *content's* height, so a `flex: 1` wrapper silently refuses to shrink below its content and pushes the page taller than the viewport. This is what broke it in #124: the wrapper around `<App>` rendered 893px tall inside a 720px `100vh` container.
- The header row (account email + logout, or the demo-mode banner) is **`flex-shrink: 0`**, so it can never be compressed, and the container clips rather than scrolls.

### Header (account row)

Above the app, the authenticated and demo shells each render a header row. It is **always visible and never moves** — its position must be byte-identical across idle, search, dropdown-open, and result-browsing states. It is outside the app's own scroll regions and cannot be scrolled away.

### Top Pane (Search Bar)
- Contains a search/filter input field (similar to Google Keep)
- Used to filter the message list
- The tag suggestion dropdown is **overlaid, not inserted into the flow** (`position: absolute`, matching the in-editor completion dropdown). Opening or closing it must not move the panes below it — it used to push them down 48px and pull them back. See #124

### Left Pane (List Pane)
- Displays a list of notes in Apple Notes style (see **Note List Item Display** below)
- The currently selected note is visually highlighted
- Filtered by the active Message Filter (if any)

### Right Pane (Content Pane)
- Displays the content of the selected note
- Editable when in Editing State
- Read-only when in Idle State
- Blank when no note is selected (e.g. the active filter matches nothing — see Behaviors)
- Text renders at an **identical position** in read and edit modes. The editing `<textarea>` carries no padding of its own (the browser default `padding: 2px` is reset), so content does not shift when entering or leaving Editing State. See #91 / #31

## Data Model

### Note
| Field     | Type     | Description                          |
|-----------|----------|--------------------------------------|
| id        | string   | Unique identifier                    |
| content   | string   | Full note content                    |
| title     | string   | Derived — see Note List Item Display |
| pinned    | boolean  | Pinned to top of list in idle mode   |
| tagPinned | boolean  | Pinned to top of filtered results when first tag matches query |
| createdAt | datetime | Creation timestamp                   |
| updatedAt | datetime | Last modification timestamp          |

### Message Filter
| Field | Type   | Description                        |
|-------|--------|------------------------------------|
| query | string | Current search/filter query string |

## Application States

### 1. Idle State (IS)
- **Default state** on app launch
- No editing is active
- App listens for keyboard commands
- The last selected note (or first note in a new session) is selected
- Selected note content is displayed (read-only) in Content Pane

### 2. Editing State (ES)
- Note content is editable in the Content Pane
- Keyboard shortcuts are intercepted only for exit commands

### 3. Search State (SS)
- Search bar in Top Pane is focused and editable
- User types a filter query

## State Transitions

```
App Start → IS

IS → 'c'                    → ES    (new note created, inheriting the active filter's tags)
IS → 'Shift+C'              → ES    (filter cleared, new blank note created)
IS → 'Enter'                → ES    (selected note becomes editable, cursor at end)
IS → click content pane     → ES    (selected note becomes editable)
IS → '/'                    → SS    (search bar focused)
IS → 'Esc Esc'              → IS    (message filter cleared)

ES → 'Esc'                  → IS    (edits saved)
ES → 'Cmd/Ctrl + Enter'     → IS    (edits saved)

SS → 'Enter'                → IS    (message filter applied with current query)
SS → 'Esc'                  → IS    (filter applied, return to idle)
SS → 'Esc Esc'              → IS    (message filter cleared)
```

## Keyboard Shortcuts

| Shortcut         | From State | Action                                      |
|------------------|------------|---------------------------------------------|
| `c`              | IS         | Create new note inheriting the active filter's tags, enter editing state |
| `Shift+C`        | IS         | Clear the active filter, create a new blank note, enter editing state    |
| `Enter`          | IS         | Edit selected note, cursor at end of content|
| `/`              | IS         | Focus search bar, enter search state        |
| `j` / `↓`        | IS         | Select next note in list                    |
| `k` / `↑`        | IS         | Select previous note in list                |
| `Esc Esc`        | IS         | Clear message filter                        |
| `t` then `i`     | IS         | Apply `#tasks-inbox` filter, select first matching note |
| `t` then `t`     | IS         | Apply `#tasks-today` filter, select first matching note |
| `t` then `n`     | IS         | Apply `#tasks-nearterm` filter, select first matching note |
| `t` then `l`     | IS         | Apply `#tasks-longterm` filter, select first matching note |
| `t` then `d`     | IS         | Apply `#tasks-done` filter, select first matching note |
| `t` then `m`     | IS         | Open task-move overlay to assign a `#tasks-*` tag to the selected note (includes `#tasks-done`) |
| `p`              | IS         | Toggle regular pin on selected note (idle-mode top only)    |
| `Shift+P`        | IS         | Toggle tag-pin on selected note (search-mode top when first tag matches) |
| `?`              | IS         | Show keyboard shortcuts help overlay                        |
| `⌘/` / `Ctrl+/`  | IS/ES/SS   | Show keyboard shortcuts help overlay (works from any state)  |
| `d` then `d`     | IS         | Open `https://notedude.app#donate` in a new browser tab    |
| `r` then `r`     | IS         | Open `mailto:issues20260531@notedude.app` to report an issue |
| `d` then `m`     | IS         | Toggle dark/light mode                                      |
| `l` then `l`     | IS         | Log out the current user                                    |
| `Shift+Y`        | IS         | Archive the selected note (appends `#archived` tag, moves it to the archived section at the end of the list); select next active note |
| `z`              | IS         | Undo the last note action (archive / pin / tag-pin / task-move). Does **not** undo text edits |
| `Shift+Z`        | IS         | Redo the last undone note action            |
| `Esc`            | ES         | Save edits, return to idle                  |
| `Cmd/Ctrl+Enter` | ES         | Save edits, return to idle                  |
| `Enter`          | SS         | Apply filter, return to idle                |
| `Esc`            | SS         | Return to idle, keep filter                 |
| `Esc Esc`        | SS         | Clear filter, return to idle                |

## Tag Search Keyboard Shortcuts

From Idle State, pressing `t` arms a tag-shortcut prefix. A second key within 1500ms selects a preset tag filter:

| Second key | Tag applied / Action |
|------------|----------------------|
| `i`        | Apply `#tasks-inbox` filter   |
| `t`        | Apply `#tasks-today` filter   |
| `n`        | Apply `#tasks-nearterm` filter|
| `l`        | Apply `#tasks-longterm` filter|
| `d`        | Apply `#tasks-done` filter    |
| `m`        | Open task-move overlay (includes `#tasks-done`) |

- The filter is applied immediately and the first matching note is selected
- If the second key is not one of the above, the prefix is cancelled silently
- Shortcuts only fire from Idle State

## Task-Move Overlay

Pressing `t` then `m` in Idle State opens a task-move overlay on the selected note.

- Lists the five standard task tags: `#tasks-inbox`, `#tasks-today`, `#tasks-nearterm`, `#tasks-longterm`, `#tasks-done`
- Tags are sorted by most recently used (most recent `updatedAt` of any note containing that tag); unseen tags appear last in their natural order
- The first tag in the list is highlighted by default (`data-selected="true"`)
- `j` / `↓` and `k` / `↑` navigate the list
- `Enter` applies the highlighted tag to the selected note:
  - If the note already contains a `#tasks-*` tag, it is replaced
  - Otherwise the tag is appended to the note content
  - The note is saved immediately
- `Esc` dismisses the overlay without changes
- Applying a tag is reversible with `z` — see **Undo / Redo**
- Has `data-testid="task-move-overlay"`

## Archive

Pressing `Shift+Y` in Idle State archives the selected note:

- Appends ` #archived` to the note's content
- The note remains in the data store — it is not deleted
- Archived notes sort to the **end of the List Pane**, below a labelled divider (`data-testid="archived-divider"`), in **both Idle State and Search State**. They are never hidden outright — an archived note that cannot be seen cannot be recovered. See #95 / #96
  - Idle State: the archived section lists **all** archived notes, ordered like the active section (pinned first, then newest first)
  - Search State: the archived section lists archived notes **matching the query**
- Archived notes are displayed at 50% opacity to distinguish them from active notes
- Archived notes are **keyboard-reachable**: `j` / `k` / `↑` / `↓` and the `1`–`9` jump keys traverse the whole list — active notes first, then archived notes
- After archiving, the next **active** note is selected (or the previous one if it was the last). Selection does not jump into the archived section
- Archiving is reversible with `z` — see **Undo / Redo**
- Tags that appear only on archived notes are not offered as suggestions — see Tags

## Undo / Redo

`z` undoes the last **note action**; `Shift+Z` redoes it. Both are Idle State only.

### What is undoable

Only actions taken *on* a note — the ones a single keystroke can perform, and therefore the ones a single mis-keystroke can perform by accident:

| Action              | Shortcut                | Reversal                                                        |
|---------------------|-------------------------|-----------------------------------------------------------------|
| Archive             | `Shift+Y`               | Strip the `#archived` tag                                        |
| Pin                 | `p`                     | Restore the previous `pinned` value                              |
| Tag-pin             | `Shift+P`               | Restore the previous `tagPinned` value                           |
| Move to task list   | `t` → `m` (or overlay click) | Restore the previous `#tasks-*` tag, or remove it if the note had none |

### What is not

**Text editing is deliberately excluded.** The editor is a plain `<textarea>` and the browser already provides native undo inside it; an app-level stack layered on top would fight it. Consequently `z` and `Shift+Z` are bound only in Idle State — in Editing State they type a literal `z`, and in Search State they type into the search bar.

Note *creation* and the discard of an untouched note are also excluded: creation is not destructive, and a discarded note by definition held nothing the user wrote.

### Semantics

- Two stacks, the standard linear model: performing a new action pushes it onto the undo stack and **clears the redo stack**.
- `z` on an empty undo stack and `Shift+Z` on an empty redo stack are silent no-ops.
- Undo and redo **select the affected note**, so the result of the reversal is visible. This matters most for archive, which moves the selection elsewhere when it fires.
- Entries record a **transform, not a content snapshot**. Undoing an archive strips `#archived` from the note's content *as it currently stands*, rather than restoring the content captured at archive time. A snapshot would silently discard any edit made between the action and the undo.
- An entry whose note no longer exists (discarded in the meantime) is **skipped**, and the undo moves on to the next entry down the stack.
- The stacks are in-memory and per-session: reloading the app clears them.
- Reversals are persisted the same way the forward action is, via the field-level writes described under **Write semantics**.

## Dark Mode

- **Dark mode is the default** for both the login / pre-app screens and the main app. New users, and any user who has never toggled the theme, see dark mode.
- Light mode is applied only when the user has explicitly selected it, persisted as `localStorage` key `theme` with the value `"light"`. Absence of a stored preference (or the value `"dark"`) means dark mode.
- Pressing `d` then `m` in Idle State toggles between dark and light mode and persists the choice
- Preference persists across sessions via `localStorage` key `theme`
- The app root element carries `data-theme="dark"` or `data-theme="light"` reflecting the current mode
- Dark mode uses a dark background, light text, and adjusted borders and highlights
- The default dark background is applied globally (via the root layout, before first paint) so the page loads dark with no light flash; the login screen and pre-app screens (loading, demo-mode bar, signed-in bar) follow the same default and respect an explicit light preference

## Note List Item Display (Apple Notes Style)

Each note in the List Pane displays two lines:

| Line | Content | Fallback |
|------|---------|----------|
| **Line 1 — Title** | First **non-blank** line of note content | `"New Note"` (just created, blank) / `"No Text Entered"` (no text at all) |
| **Line 2 — Metadata** | Creation timestamp + abbreviated next non-blank line | Timestamp + `"No Content"` (when there is none) |

Each item carries `data-testid="note-item"` plus state attributes: `data-selected`, `data-pinned`, `data-tagpinned`, `data-flash`, and `data-archived`.

### Display rules
- **New note** (created via `c` / `Shift+C`, holding no text beyond any inherited tags): Title = `"New Note"`, metadata = `<timestamp> No Content`. A note seeded with the active filter's tags counts as new until the user types — the tags show in the Content Pane but not in the list placeholders
- **Note with content**: Title = the **first line that has something on it**, metadata = `<timestamp> <abbreviated following non-blank line>`
- **Note with all content deleted** (while editing): Title = `"No Text Entered"`, metadata = `<timestamp> No Content`. A note left empty when editing exits is **discarded** (removed from the list) rather than kept — see Behaviors.

### Leading blank lines do not make a note look empty

The title is the first line **with something on it**, not literally line 1, and blank means "nothing but whitespace". A note whose content opens with one or more empty lines is titled by its first real line, and its snippet comes from the next non-blank line **after** that one.

Deriving the title from line 1 alone made any note starting with a blank line report `"No Text Entered"` / `"No Content"` — the list claiming the note was empty while the Content Pane showed its text. A whitespace-only first line was worse: non-empty as a string, so it was used as the title and the entry rendered blank, with no text and no placeholder. See #126.

`"No Text Entered"` and `"No Content"` are reserved for notes that genuinely hold no text, whitespace-only content included.

A note consisting only of `#tags` is unaffected: its tag line is real text, so it remains the title, and the snippet stays `"No Content"`.

## Composing a Note

A search is a **context**, not just a view: in notedude tags are the folder system, so a note composed while a filter is active belongs to that filter by default.

### `c` — compose in context

Creates a new note that inherits the `#tags` of the active filter and enters Editing State. The filter stays applied.

- The note's content is seeded with a leading space followed by the inherited tags, and the **caret is placed at position 0**, so typing a title yields the house convention `Title #tag`:

  ```
  filter: #tasks-today   →  c  →  editor: "▮ #tasks-today"
                               type "Call the vet"
                               →  "Call the vet #tasks-today"
  ```
- Tags are de-duplicated and lower-cased. **Free-text terms in the query are not seeded** — the app cannot know whether they belong in the title or the body.
- **`#archived` is never inherited**, since that would archive the note before a character is typed.
- Because the seeded note genuinely matches the filter, it appears at the top of the list the user is already looking at.
- With no active filter, `c` creates a blank note as before.

### `Shift+C` — compose clean

Clears the active filter and the search query, then creates a new **blank** note (no inherited tags) and enters Editing State. This is the escape hatch for "the note I want isn't part of what I'm looking at".

### The note being edited is never filtered out

While in Editing State, the note under the editor is **always present in the List Pane**, regardless of whether it matches the active filter. If it does not match, it is shown at the top of the list.

This holds for a new note under a free-text filter (which it can never match), a filter that matches nothing at all, and an existing note whose matching tag is deleted mid-edit. Without this guarantee the note is evicted from the list and the editor silently retargets whichever note takes its place (#93).

The mechanism is the editing freeze described under **Stable list while editing** in Behaviors: list membership and order are captured on entry to Editing State, and the note under the editor is prepended if it was not in that snapshot. Freezing the order too is what stops the `updatedAt` bump from every keystroke re-sorting search results mid-edit (#94).

When editing exits, a note that no longer matches drops out of the filtered list normally; the save flash on the row is the user's confirmation that it was saved rather than lost.

### Discarding an untouched note

Extending the empty-note rule: when editing exits, the note is discarded if either

- its content is blank (any note), **or**
- it is still untouched (`isNew`) and contains nothing but tags — i.e. stripping every `#tag` leaves no text.

The second clause means `c` followed immediately by `Esc` leaves no junk tag-only note behind. A tag-only note also shows the `"New Note"` / `"No Content"` placeholders in the List Pane, exactly as a blank one does.

### No write before first keystroke

A newly created note is **not** written to Firestore on creation — only once the user types content (`#77`). A discarded note also cancels any queued write, so it can never be resurrected by a pending flush.

## Tags

### Definition
A **tag** is any word in a note's content preceded by `#` (e.g., `#work`, `#todo`). Tags are case-insensitive for matching purposes.

### Tag suggestions are derived from active notes only
Both tag dropdowns — the search dropdown and the in-editor completion dropdown — list tags collected from **non-archived notes only**. A tag stops being suggested as soon as it is no longer used by any active note, whether because it was edited out of its last note, its last note was discarded, or its last note was archived. See #90.

This affects suggestion only, never matching: typing a tag in full still searches every note, and matching archived notes appear in the archived section of the results. `#archived` itself is therefore never suggested.

### Tag Search in Search State (SS)
When the user types `#` as the first character in the search bar:
1. A **tag dropdown** (`data-testid="tag-dropdown"`) appears below the search bar, listing all tags found across all notes
2. Tags are ordered: **recently used first** (by most recent `updatedAt` of any note containing the tag), then **alphabetically** for the rest
3. Typing additional characters after `#` incrementally filters the tag list (e.g., `#wo` shows `#work` but not `#todo`)
4. Each tag in the dropdown is a selectable item (`data-testid="tag-item"`)
5. Arrow Up/Down keys navigate the tag list, highlighting the selected tag (`data-selected="true"`)
6. Pressing Enter when a tag is highlighted applies it directly as a filter — same as clicking
7. Clicking a tag applies it directly as a filter — only notes containing that tag are shown in the List Pane
8. However a filter is applied — typing + `Enter`, clicking a tag, or a `t →` shortcut — the query **remains visible in the search box**. An applied filter is never invisible, so the user can always see why the list is narrowed and what `c` will inherit
6. The tag dropdown disappears when:
   - A tag is selected
   - The `#` is removed from the search bar
   - The user presses Escape (returns to IS, clears filter)

### Tag Filtering
When a tag filter is active, the List Pane shows only notes whose content contains the selected tag (matched as `#tagname` with word boundary).

## Help Overlay

Pressing `⌘/` (`Ctrl+/`) from any state — or `?` from Idle State — shows a full-screen overlay listing all keyboard shortcuts. The overlay:
- Has `data-testid="help-overlay"`
- Is dismissed by pressing any key or clicking anywhere
- `⌘/` works from Idle, Editing, and Search state (it is a modifier combo, so it is safe while typing — plain `/` still types normally). `?` is only recognized in Idle State, so it cannot be reached once a note is being edited; `⌘/` is the reliable way to surface shortcuts from edit mode.
- Each section is rendered with `data-testid="help-section"` and a `data-section` slug derived from its title (`voice → google tasks` → `voice-google-tasks`), so a test can assert against one section rather than the whole overlay
- A section may carry a **caption** — a dim line under its rows, for the one-time setup a spoken prompt needs. Shortcut sections have none; every voice section does

### Voice prompts

The overlay ends with three `voice` sections. These list **spoken phrases, not shortcuts** — no key handler in notedude is involved, and the phrases are addressed to an assistant on the phone. They exist because capture is the one thing a keyboard-first app cannot help with when there is no keyboard.

#### `voice → google tasks` and `voice → google keep` (Gemini)

Gemini writes to Google Tasks and Google Keep; the items reach notedude through the sync in **#138** (`#tasks-*` notes ↔ Google Tasks) and **#142** (every other note ↔ Keep). Until one of those ships, a prompt still creates the Google-side item but nothing appears in notedude — which is why each section's caption states that the sync has to be connected.

Two verified properties of Gemini shape the copy:

- **Gemini writes only to the default Google Tasks list** (`My Tasks`) and cannot target a user-created list. #138 syncs only lists whose normalized name starts with `tasks-`, so a voice-created task is out of scope — and silently never syncs — unless the user **renames the default list** to `Tasks Inbox`. The overlay says so; without that line the prompts look broken.
- **A due date is the only steer that works.** #138's pull precedence maps `due ≤ today` to `#tasks-today`, so "… today" is the one phrase that reaches a specific list. Anything else lands in the default list's tag and is retagged in notedude with `t → m`.

| Spoken to Gemini | Lands in notedude as |
|---|---|
| `create a task <text>` | note tagged for the default list (`#tasks-inbox` once renamed) |
| `create a task <text> today` | `#tasks-today` — via the due-date rule, not list targeting |
| `mark <text> as done` | `#tasks-done` |
| `create a note <text>` | plain note (no `#tasks-*` tag), via Keep |
| `create a checklist for <text>` | note whose Keep checklist imports as markdown checkboxes |
| `add <item> to <title> list` | appended to that note |

Keep's caption also notes that its sync is **server-side and Workspace-only** — the Keep API is unavailable to personal `@gmail.com` accounts (#142), so a personal-account user should not expect the note prompts to sync at all.

#### `voice → siri (ios)`

iOS has no route into Google Tasks or Keep, so Siri capture goes through the **Web Share Target** already described above — no notedude code is involved beyond `/share`.

The user creates one Apple Shortcut, *Ask for Input* → *Open URLs* → `https://app.notedude.app/share?text=[input]`, and names it after what it should do. Siri runs a shortcut by its name, and *Ask for Input* is spoken rather than typed when a shortcut is invoked by voice, which is what makes the flow hands-free.

- `hey siri, notedude note` → dictated text becomes a new note
- `hey siri, notedude task` → same, with `%23tasks-inbox` appended to the URL in the shortcut, so it arrives as a task

A task variant needs no `tag` parameter on `/share`: the tag is literal text in the shortcut's URL, and `/share` already joins whatever it receives into the note body.

## Pinning Indicators

Each note item in the List Pane shows a bullet character before its title based on its pin state:

| Condition | Bullet | Character |
|-----------|--------|-----------|
| `pinned === true` | Circle | `○` |
| `tagPinned === true` | Small hash | `#` (smaller, muted) |
| Neither | _(none)_ | |

- Both indicators can appear simultaneously when a note is both pinned and tag-pinned with a matching filter
- Bullets are part of the title line display only; they do not affect note content

## Pinning

Two independent pin modes exist, toggled via separate shortcuts:

### Regular pin (`p`)
- Toggles `pinned` on the selected note
- Works in Idle State and Search State
- Pinned notes sort to the **top of the list in idle mode only**
- In search/filter mode, pinned notes behave like regular notes — no sort boost

### Tag-pin (`Shift+P`)
- Toggles `tagPinned` on the selected note
- Works in Idle State and Search State
- Tag-pinned notes sort to the **top of filtered results** when the note's **first tag** appears in the active search query
- Has no effect on sort order in idle mode (no active filter)

### Tag-pin details
- **First tag** = the first `#word` token in the note's content
- A note is "active tag-pinned" when: `tagPinned === true` AND `firstTag` is in the active query tags
- In a tag-filtered list, active tag-pinned notes appear before all others; ties broken by `updatedAt` descending
- One note can be tag-pinned for at most one tag (its first tag) — deliberate primary-context authorship

### Example
A note `#client-acme Status update...` with `tagPinned = true` will appear first when the filter is `#client-acme`, but not when filtering by `#meeting`. In idle mode (no filter) it sorts like any other note.

## Behaviors

- **Note selection**: In IS, the selected note's content is displayed in the Content Pane
- **New note**: Created blank, or seeded with the active filter's tags — see **Composing a Note**
- **Click to edit**: In IS, clicking anywhere in the Content Pane enters Editing State for the selected note (clicking a link in the content opens the link instead)
- **Discard empty note**: When editing exits and the note holds no text the user wrote — blank, or untouched and tag-only — the note is discarded (removed from the list) rather than kept as a blank entry
- **Editing beats filtering**: The note being edited is always shown in the List Pane, even when it does not match the active filter — see **Composing a Note**
- **Filter**: When a message filter is active, only matching notes appear in the List Pane. Filtering is incremental — the note list updates live as the user types in the search bar
- **Empty filter results**: When the active filter matches no notes, the List Pane is empty **and the Content Pane is blank**. The previously selected note is deselected rather than left on screen, which would misrepresent a zero-result search as a hit. See #97
- **Stable list while editing**: Entering Editing State freezes the List Pane's membership and order until editing ends. While editing:
  - The note being edited stays in the list and stays selected **even if its content stops matching the active filter** — e.g. deleting the very tag being searched for. See #94
  - A note created with `c` under an active filter is prepended to the frozen list and remains the note being edited, rather than being filtered out and handing the editor to whichever note is first in the list. See #93
  - Live `updatedAt` bumps from typing do not re-sort the list mid-edit
  - Note titles and metadata still update live; only membership and order are frozen. The list re-evaluates against the filter on exit from Editing State
- **Filter clear**: Pressing Esc twice (within 500ms) in IS or SS clears the filter and shows all notes
- **Pinning**: Pinned notes appear at the top of the List Pane in idle mode. In search/filter mode they behave like regular notes
- **Tag-pinning**: Tag-pinned notes appear at the top of filtered results when their first tag matches the active search query
- **Undo/redo**: `z` / `Shift+Z` reverse and reapply the last **note action** (archive, pin, tag-pin, task-move). Text edits are not covered — see **Undo / Redo**
- **Auto-save**: Edits are saved automatically on state transition out of ES
- **Welcome note**: On first login a welcome note is automatically created with content `"Greetings\nPress ⌘/ (Ctrl+/) for keyboard shortcuts."`. It is created only once — subsequent logins with existing notes do not re-create it. The welcome note appears at the top of the note list and opens in **read (idle) mode**, never edit mode.

  "First login" is decided by an **authoritative server read** (`accountHasNotes()`, a `getDocsFromServer` query limited to one document), not by the first `onSnapshot` callback. That snapshot may be served from the local cache, and an empty cache hit is indistinguishable from a genuinely empty account — so deciding there gave a returning user on a fresh browser a *duplicate* welcome note, written into their own data (#120). A failed check (offline, or refused) counts as **unknown**, never as empty: nothing is seeded until the server answers.

  The seeding decision deliberately lives outside the Firestore subscription, whose callback does nothing but merge. That merge is what protects against lost updates (#74), so it is kept free of any other responsibility.

## Persistence & Security

### Deployment model
- The web app is a **static export** (`output: "export"`) served by Firebase Hosting. There is no Next.js server runtime, so the app has **no API routes** — all reads/writes go directly from the browser to Firestore via the Firebase client SDK, authorized by Firestore Security Rules.
- The only privileged/server-side surface is the **MCP server** (`mcp/`), which uses the Firebase Admin SDK with a service account and bypasses Security Rules. It is run locally by the note owner, not exposed to the public.

### CI
`.github/workflows/firebase-hosting.yml` has two jobs:

- **`test`** — runs on every push to `main` **and** every pull request. Installs deps, installs the Chromium browser, and runs the full Playwright suite. Uploads `playwright-report/` as an artifact so a failure can be inspected without reproducing it locally.
- **`build-and-deploy`** — `needs: test`, so a red suite can never reach the live channel. Guarded by `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` so a pull request is verified but never publishes to production.

Before #114 the workflow ran only `npm ci` + `npm run build` + deploy on push to `main`. Tests were never executed and pull requests carried no checks at all, which is how #112 — a test file that did not parse, silently skipping ~190 tests — survived unnoticed for a month. A successful build proves the code compiles, not that it works.

The emulator-backed `firebase-roundtrip` project stays out of CI: it is only selected when `FIREBASE_ROUNDTRIP=true`, and it needs a running Firestore emulator.

**CI runs against the production export, not `next dev`.** When `CI` is set, `playwright.config.ts` serves the built `out/` directory with `serve` instead of starting a dev server. `serve` resolves `/test` and `/share` to `test.html` and `share.html`, matching the clean-URL behaviour of the deployed site.

This is not a tuning preference. Dev mode compiles each route on demand and is pathologically slow on a GitHub runner: the suite took **12.2 minutes with 50 failures**, and simply widening the timeouts made it **36.9 minutes with 55** — the app frequently never became interactive, so more headroom only bought slower failures. Against the export the same 204 tests pass in **39 seconds**. It also means CI exercises the artifact that actually ships. Locally `next dev` is kept for its fast rebuild loop.

Because next-pwa is disabled in development but active in a production build, the export ships a service worker. `use.serviceWorkers: "block"` keeps it from caching between tests; nothing in the suite tests offline behaviour.

### Firestore Security Rules
Notes live at `users/{userId}/notes/{noteId}`.
- **Read / delete**: allowed only when `request.auth.uid == userId` (the owner).
- **Create / update**: allowed only for the owner **and** when the written document passes field validation:
  - Only these fields may be present: `content`, `pinned`, `tagPinned`, `createdAt`, `updatedAt` (no other keys).
  - `content` is a string of at most **100,000** characters.
  - `pinned` and `tagPinned` are booleans; `createdAt` is a number; `updatedAt` is a timestamp or number.
- Writes that include unknown fields or oversized content are rejected with `permission-denied`.

### Write semantics (avoiding lost updates)
- A note's **content** is written with a full-document `setDoc` (create and content-edit). No write is issued when the note is created — only once the user types (see **Composing a Note**).
- **Metadata-only toggles** — `pinned` (`p`) and `tagPinned` (`Shift+P`) — are written with a **field-level `updateDoc`** that touches only the toggled field and `updatedAt`. They must **not** rewrite `content`. This prevents a stale in-memory snapshot in one tab/device from overwriting a concurrent content edit made elsewhere (lost update). See #74.
- **Tag-only content changes** — archive/unarchive (`Shift+Y`, `z`) and task-move (`t` → `m`) — go through `setNoteContent(uid, noteId, content)`, a field-level `updateDoc` of `content` + `updatedAt`. The caller owns the tag arithmetic; the helper writes exactly the content it is handed and nothing else. The predecessor `archiveNote()` appended `#archived` itself while its only caller had already appended it, so Firestore received `#archived` twice — invisible to the UI suite, which reads local state. See #118.

### Authentication bypass guard
- `NEXT_PUBLIC_SKIP_AUTH=true` renders the app without the sign-in screen for local development. This bypass is **disabled in production builds** (`NODE_ENV === "production"`), so a leaked or mis-set env var can never disable authentication on the deployed site.

### Security headers
Firebase Hosting serves these response headers on all routes (configured in `firebase.json`, since Next's `headers()` does not apply to a static export):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`

### MCP archive consistency
- The MCP `delete_note` tool performs a **soft archive** consistent with the app: it appends a `#archived` tag to the note's content (matching `Shift+Y`), rather than setting a separate field. This ensures notes archived via MCP are hidden in the app's Idle State exactly like notes archived in-app. It is idempotent — a note already tagged `#archived` is left unchanged.
