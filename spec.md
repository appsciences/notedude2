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
| `Esc`            | ES         | Save edits, return to idle                  |
| `Cmd/Ctrl+Enter` | ES         | Save edits, return to idle                  |
| `Enter`          | SS         | Apply filter, return to idle                |
| `Esc`            | SS         | Return to idle, keep filter                 |
| `Esc Esc`        | SS         | Clear filter, return to idle                |

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

## Behaviors

- **Note selection**: In IS, the selected note's content is displayed in the Content Pane
- **New note**: Created with blank content; Content Pane starts empty for fresh typing
- **Filter**: When a message filter is active, only matching notes appear in the List Pane
- **Filter clear**: Pressing Esc twice (within 500ms) in IS or SS clears the filter and shows all notes
- **Pinning**: Pinned notes always appear at the top of the List Pane
- **Auto-save**: Edits are saved automatically on state transition out of ES
