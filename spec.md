# NoteDude - Specification

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
| pinned    | boolean  | Whether the note is pinned to top    |
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
IS → '/'                    → SS    (search bar focused)
IS → 'Esc Esc'              → IS    (message filter cleared)

ES → 'Esc'                  → IS    (edits saved)
ES → 'Cmd/Ctrl + Enter'     → IS    (edits saved)

SS → 'Enter'                → IS    (message filter applied with current query)
SS → 'Esc'                  → IS    (return to idle, filter kept)
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
| `p`              | IS         | Toggle pin on selected note                                 |
| `?`              | IS         | Show keyboard shortcuts help overlay                        |
| `d` then `d`     | IS         | Open `https://notedude.app/donate` in a new browser tab    |
| `d` then `m`     | IS         | Toggle dark/light mode                                      |
| `l` then `l`     | IS         | Log out the current user                                    |
| `Esc`            | ES         | Save edits, return to idle                  |
| `Cmd/Ctrl+Enter` | ES         | Save edits, return to idle                  |
| `Enter`          | SS         | Apply filter, return to idle                |
| `Esc`            | SS         | Return to idle, keep filter                 |
| `Esc Esc`        | SS         | Clear filter, return to idle                |

## Tag Search Keyboard Shortcuts

From Idle State, pressing `t` arms a tag-shortcut prefix. A second key within 1500ms selects a preset tag filter:

| Second key | Tag applied      |
|------------|------------------|
| `i`        | `#tasks-inbox`   |
| `t`        | `#tasks-today`   |
| `n`        | `#tasks-nearterm`|
| `l`        | `#tasks-longterm`|

- The filter is applied immediately and the first matching note is selected
- If the second key is not one of the above, the prefix is cancelled silently
- Shortcuts only fire from Idle State

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
- **Note with all content deleted**: Title = `"No Text Entered"`, metadata = `<timestamp> No Content`

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
6. Pressing Enter when a tag is highlighted inserts the tag into the search box (replacing the `#...` prefix) followed by a space, allowing the user to add additional search terms
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

Each note item in the List Pane shows a bullet character before its title when pinned:

| Condition | Bullet | Character |
|-----------|--------|-----------|
| Pinned, no active tag filter (or filter doesn't match first tag) | Circle | `○` |
| Tag-pinned for the active tag filter (pinned + first tag matches) | Black Point | `●` |
| Not pinned | _(none)_ | |

- `●` replaces `○` — a note shows at most one bullet at a time
- The bullet is part of the title line display only; it does not affect note content

## Tag-Pinning

When a note is pinned (via `p`) and a tag filter is active, the note sorts to the **top of filtered results** if its **first tag** matches the active filter tag.

- **First tag** = the first `#word` token in the note's content
- A note is "tag-pinned for tag X" when: `pinned === true` AND `firstTag === X`
- In a tag-filtered list, tag-pinned notes appear before all others; ties broken by `updatedAt` descending
- Outside of tag filtering (no filter, or plain-text filter), sort order is unchanged: pinned notes above unpinned, newest first within each group
- One note can be tag-pinned for at most one tag (its first tag) — deliberate primary-context authorship

### Example
A note `#client-acme Status update...` that is pinned will appear first when the filter is `#client-acme`, but not when filtering by `#meeting` even if `#meeting` also appears in the note.

## Behaviors

- **Note selection**: In IS, the selected note's content is displayed in the Content Pane
- **New note**: Created with blank content; Content Pane starts empty for fresh typing
- **Filter**: When a message filter is active, only matching notes appear in the List Pane. Filtering is incremental — the note list updates live as the user types in the search bar
- **Filter clear**: Pressing Esc twice (within 500ms) in IS or SS clears the filter and shows all notes
- **Pinning**: Pinned notes always appear at the top of the List Pane
- **Auto-save**: Edits are saved automatically on state transition out of ES
- **Welcome note**: On first login (Firestore returns zero notes), a welcome note is automatically created with content `"Greetings\nPress ? for keyboard shortcuts."`. It is created only once — subsequent logins with existing notes do not re-create it. The welcome note appears at the top of the note list.
