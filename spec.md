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
IS → 'Esc'                  → IS    (message filter cleared)

ES → 'Esc'                  → IS    (edits saved)
ES → 'Cmd/Ctrl + Enter'     → IS    (edits saved)

SS → 'Enter'                → IS    (message filter applied with current query)
SS → 'Esc'                  → IS    (message filter cleared)
```

## Keyboard Shortcuts

| Shortcut         | From State | Action                                      |
|------------------|------------|---------------------------------------------|
| `c`              | IS         | Create new blank note, enter editing state  |
| `Enter`          | IS         | Edit selected note, cursor at end of content|
| `/`              | IS         | Focus search bar, enter search state        |
| `Esc`            | IS         | Clear message filter                        |
| `Esc`            | ES         | Save edits, return to idle                  |
| `Cmd/Ctrl+Enter` | ES         | Save edits, return to idle                  |
| `Enter`          | SS         | Apply filter, return to idle                |
| `Esc`            | SS         | Clear filter, return to idle                |

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

## Behaviors

- **Note selection**: In IS, the selected note's content is displayed in the Content Pane
- **New note**: Created with blank content; Content Pane starts empty for fresh typing
- **Filter**: When a message filter is active, only matching notes appear in the List Pane
- **Filter clear**: Pressing Esc in IS or SS clears the filter and shows all notes
- **Pinning**: Pinned notes always appear at the top of the List Pane
- **Auto-save**: Edits are saved automatically on state transition out of ES
