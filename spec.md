# notedude - Specification

## Overview

A keyboard-driven note-taking app combining Google Keep's keyboard navigation with Apple Notes' layout and features. Built with Next.js.

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

IS → 'c'                    → ES    (new note created, content blank, title "New Note")
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
| `c`              | IS         | Create new blank note, enter editing state  |
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
| `d` then `d`     | IS         | Open `https://notedude.app/donate` in a new browser tab    |
| `r` then `r`     | IS         | Open `mailto:issues20260531@notedude.app` to report an issue |
| `d` then `m`     | IS         | Toggle dark/light mode                                      |
| `l` then `l`     | IS         | Log out the current user                                    |
| `Shift+Y`        | IS         | Archive the selected note (appends `#archived` tag, hidden in idle mode); select next note |
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
- Archived notes are **hidden in Idle State** (not shown in the list)
- In Search State, archived notes that match the query appear at the **bottom of the list**, below a labelled divider (`data-testid="archived-divider"`)
- Archived notes are displayed at 50% opacity to distinguish them from active notes
- After archiving, the next note in the displayed list is selected (or previous if it was the last)

## Dark Mode

- Pressing `d` then `m` in Idle State toggles between dark and light mode
- Preference persists across sessions via `localStorage` key `theme`
- The app root element carries `data-theme="dark"` or `data-theme="light"` reflecting the current mode
- Dark mode inverts the color scheme: dark background, light text, adjusted borders and highlights

## Note List Item Display (Apple Notes Style)

Each note in the List Pane displays two lines:

| Line | Content | Fallback |
|------|---------|----------|
| **Line 1 — Title** | First line of note content | `"New Note"` (just created, blank) / `"No Text Entered"` (content deleted) |
| **Line 2 — Metadata** | Creation timestamp + abbreviated first line of content | Timestamp + `"No Content"` (when blank) |

### Display rules
- **New note** (created via `c`, content is blank): Title = `"New Note"`, metadata = `<timestamp> No Content`, Content Pane is empty
- **Note with content**: Title = first line of content, metadata = `<timestamp> <abbreviated first line>`
- **Note with all content deleted** (while editing): Title = `"No Text Entered"`, metadata = `<timestamp> No Content`. A note left empty when editing exits is **discarded** (removed from the list) rather than kept — see Behaviors.

## Tags

### Definition
A **tag** is any word in a note's content preceded by `#` (e.g., `#work`, `#todo`). Tags are case-insensitive for matching purposes.

### Tag Search in Search State (SS)
When the user types `#` as the first character in the search bar:
1. A **tag dropdown** (`data-testid="tag-dropdown"`) appears below the search bar, listing all tags found across all notes
2. Tags are ordered: **recently used first** (by most recent `updatedAt` of any note containing the tag), then **alphabetically** for the rest
3. Typing additional characters after `#` incrementally filters the tag list (e.g., `#wo` shows `#work` but not `#todo`)
4. Each tag in the dropdown is a selectable item (`data-testid="tag-item"`)
5. Arrow Up/Down keys navigate the tag list, highlighting the selected tag (`data-selected="true"`)
6. Pressing Enter when a tag is highlighted applies it directly as a filter — same as clicking
7. Clicking a tag applies it directly as a filter — only notes containing that tag are shown in the List Pane
6. The tag dropdown disappears when:
   - A tag is selected
   - The `#` is removed from the search bar
   - The user presses Escape (returns to IS, clears filter)

### Tag Filtering
When a tag filter is active, the List Pane shows only notes whose content contains the selected tag (matched as `#tagname` with word boundary).

## Help Overlay

Pressing `?` in Idle State shows a full-screen overlay listing all keyboard shortcuts. The overlay:
- Has `data-testid="help-overlay"`
- Is dismissed by pressing any key or clicking anywhere
- Is not accessible from Editing or Search state

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
- **New note**: Created with blank content; Content Pane starts empty for fresh typing
- **Click to edit**: In IS, clicking anywhere in the Content Pane enters Editing State for the selected note (clicking a link in the content opens the link instead)
- **Discard empty note**: When editing exits and the note's content is empty, the note is discarded (removed from the list) rather than kept as a blank entry
- **Filter**: When a message filter is active, only matching notes appear in the List Pane. Filtering is incremental — the note list updates live as the user types in the search bar
- **Filter clear**: Pressing Esc twice (within 500ms) in IS or SS clears the filter and shows all notes
- **Pinning**: Pinned notes appear at the top of the List Pane in idle mode. In search/filter mode they behave like regular notes
- **Tag-pinning**: Tag-pinned notes appear at the top of filtered results when their first tag matches the active search query
- **Auto-save**: Edits are saved automatically on state transition out of ES
- **Welcome note**: On first login (Firestore returns zero notes), a welcome note is automatically created with content `"Greetings\nPress ? for keyboard shortcuts."`. It is created only once — subsequent logins with existing notes do not re-create it. The welcome note appears at the top of the note list.

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
