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

### Sign-in on mobile

`signInWithPopup` cannot reliably hand a credential back to an installed PWA — on iOS standalone the popup opens in a detached context that never returns. Clients in standalone display mode, or whose **primary** pointer is coarse, use `signInWithRedirect` instead; desktop browsers keep the popup, where it avoids a full page reload. The redirect result is claimed on mount before the auth listener is attached, so a returning user is not flashed the login screen.

### Install appearance

`background_color` and `theme_color` in the manifest are `#1a1a1a`, matching the app's dark default. They previously described a white/black app, which made the generated launch splash flash white on every cold start of the installed PWA (#109).

## UI Layout

The app consists of three panes:

### Top Pane (Search Bar)
- Contains a search/filter input field (similar to Google Keep)
- Used to filter the message list

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
| `d` then `d`     | IS         | Open `https://notedude.app/donate` in a new browser tab    |
| `r` then `r`     | IS         | Open `mailto:issues20260531@notedude.app` to report an issue |
| `d` then `m`     | IS         | Toggle dark/light mode                                      |
| `l` then `l`     | IS         | Log out the current user                                    |
| `Shift+Y`        | IS         | Archive the selected note (appends `#archived` tag, moves it to the archived section at the end of the list); select next active note |
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
- Tags that appear only on archived notes are not offered as suggestions — see Tags

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
| **Line 1 — Title** | First line of note content | `"New Note"` (just created, blank) / `"No Text Entered"` (content deleted) |
| **Line 2 — Metadata** | Creation timestamp + abbreviated first line of content | Timestamp + `"No Content"` (when blank) |

Each item carries `data-testid="note-item"` plus state attributes: `data-selected`, `data-pinned`, `data-tagpinned`, `data-flash`, and `data-archived`.

### Display rules
- **New note** (created via `c` / `Shift+C`, holding no text beyond any inherited tags): Title = `"New Note"`, metadata = `<timestamp> No Content`. A note seeded with the active filter's tags counts as new until the user types — the tags show in the Content Pane but not in the list placeholders
- **Note with content**: Title = first line of content, metadata = `<timestamp> <abbreviated first line>`
- **Note with all content deleted** (while editing): Title = `"No Text Entered"`, metadata = `<timestamp> No Content`. A note left empty when editing exits is **discarded** (removed from the list) rather than kept — see Behaviors.

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
- **Auto-save**: Edits are saved automatically on state transition out of ES
- **Welcome note**: On first login (Firestore returns zero notes), a welcome note is automatically created with content `"Greetings\nPress ⌘/ (Ctrl+/) for keyboard shortcuts."`. It is created only once — subsequent logins with existing notes do not re-create it. The welcome note appears at the top of the note list and opens in **read (idle) mode**, never edit mode.

## Persistence & Security

### Deployment model
- The web app is a **static export** (`output: "export"`) served by Firebase Hosting. There is no Next.js server runtime, so the app has **no API routes** — all reads/writes go directly from the browser to Firestore via the Firebase client SDK, authorized by Firestore Security Rules.
- The only privileged/server-side surface is the **MCP server** (`mcp/`), which uses the Firebase Admin SDK with a service account and bypasses Security Rules. It is run locally by the note owner, not exposed to the public.

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
- The MCP `delete_note` tool performs a **soft archive** consistent with the app: it appends a `#archived` tag to the note's content (matching `Shift+Y` / `archiveNote()`), rather than setting a separate field. This ensures notes archived via MCP are hidden in the app's Idle State exactly like notes archived in-app. It is idempotent — a note already tagged `#archived` is left unchanged.
