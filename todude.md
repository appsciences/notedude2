# Quadrant — Product Specification

**Version:** 0.1 (Draft)
**Status:** In Progress

---

## Overview

Quadrant is an opinionated, keyboard-first task manager built around a single mental model: **tasks flow through four zones toward completion**. It is not a project manager, not a calendar, not a collaboration tool. It does one thing: help you decide what to do next, and stay honest about it.

---

## The Four Lists

| List | Purpose | Review Cadence |
|---|---|---|
| **Inbox** | Capture anything, fast. No decisions required. Voice/AI dumps land here. | When convenient |
| **Today** | Your active battlefield. Only tasks you intend to do *today*. | 2–3× per day |
| **Short Term** | Tasks for the coming days/weeks. The pipeline for Today. | Daily (morning) |
| **Long Term** | Someday/maybe, ongoing goals, back-burner items. | Weekly |

---

## The Daily Ritual

The app enforces a simple daily rhythm:

1. **Morning triage** — App prompts you to review Today. Incomplete tasks stay; completed ones get archived. You pull from Short Term to refill Today.
2. **Midday check** — Quick scan of Today only. Mark done, nothing else.
3. **Evening close** — Archive done tasks. Anything left on Today either stays or gets demoted to Short Term.

The app nudges this ritual but never blocks you.

---

## Keyboard-First Design

Every action must be achievable without touching the mouse.

| Key | Action |
|---|---|
| `N` | New task (in focused list) |
| `J / K` | Move selection down / up |
| `Enter` | Edit selected task |
| `Space` | Toggle complete |
| `Tab` | Cycle focus to next list (→) |
| `Shift+Tab` | Cycle focus to previous list (←) |
| `M` | Move task → pick destination list |
| `D` | Move task → Today |
| `S` | Move task → Short Term |
| `L` | Move task → Long Term |
| `I` | Move task → Inbox |
| `X` | Delete task (confirm prompt) |
| `U` | Undo last action |
| `/` | Search across all lists |
| `?` | Show keyboard shortcut help |
| `Esc` | Cancel / deselect |

---

## Task Model

A task is intentionally minimal:

```json
{
  "id": "uuid",
  "title": "string (required)",
  "notes": "string (optional, one level deep)",
  "list": "inbox | today | short | long",
  "created_at": "timestamp",
  "completed_at": "timestamp | null",
  "archived": "boolean",
  "position": "integer (manual sort order within list)",
  "reminder": { ... }
}
```

No due dates, no priorities, no tags in v1. **Ordering is manual.** The act of ordering *is* the prioritization.

---

## UI Layout

```
┌─────────┬─────────┬─────────┬─────────┐
│  INBOX  │  TODAY  │  SHORT  │  LONG   │
│         │         │  TERM   │  TERM   │
│  [ ]    │  [ ]    │  [ ]    │  [ ]    │
│  [ ]    │  [✓]    │  [ ]    │  [ ]    │
│  [ ]    │  [ ]    │  [ ]    │         │
│         │         │         │         │
└─────────┴─────────┴─────────┴─────────┘
```

- Four equal columns, always visible simultaneously on desktop
- Active/focused list has a visible highlight
- Completed tasks appear struck-through until archived
- A subtle task count badge on each column header
- Mobile: swipeable single-column view with a tab bar

---

## Reminder System

### Core Philosophy

Reminders exist to **prevent tasks from going silent**. A task on Short Term or Long Term that you never look at is a lie you're telling yourself. The reminder system surfaces tasks before they become forgotten, and learns how aggressive to be based on how you actually behave.

---

### Default Reminder Cadence

| List | Default Interval | Trigger |
|---|---|---|
| **Short Term** | Every 7 days | Per task, from date added to list |
| **Long Term** | Every 14 days | Per task, from date added to list |
| **Inbox** | One-time nudge at 48h | "You have X uncategorized tasks" |
| **Today** | No scheduled reminders | (Daily ritual handles this) |

Reminders are **per-task**, not per-list. Each task carries its own reminder schedule, which evolves independently.

---

### Reminder Actions

When a reminder surfaces a task, the user gets exactly four options:

| Action | Meaning | Effect on Schedule |
|---|---|---|
| **Done** | Task is complete | Archived, no more reminders |
| **Not yet** | Still relevant, not ready | Reminder resets to default interval |
| **Move up** | Promote to a more active list | Task moves; interval inherits new list default |
| **Snooze** | Not relevant right now | Interval doubles (subject to AI adjustment) |

---

### AI-Driven Interval Adjustment

The AI observes behavioral signals over time and adjusts reminder intervals **per task** and **per user pattern**. It never adjusts silently — it proposes changes and asks for confirmation.

#### Signals Tracked

| Signal | Interpretation |
|---|---|
| User consistently hits "Not yet" | Task may be stuck; shorten interval and flag as blocked |
| User repeatedly snoozes | Task may not be real; lengthen interval or suggest deleting |
| Task moves from Long → Short Term quickly | User is more active than defaults assume; shorten Long Term intervals generally |
| Task sits in Short Term > 3 weeks untouched | Suggest demotion to Long Term |
| User completes tasks shortly after reminders | Cadence is working; no change |
| User ignores reminders (no action taken) | Notification channel may be wrong; prompt to adjust delivery |

#### AI Adjustment Proposals (examples)

> *"You've snoozed 'Redesign portfolio' 4 times. Want me to move it to Long Term and remind you monthly instead?"*

> *"You tend to act on Short Term tasks within 2 days of a reminder. I can tighten your Short Term cadence to every 4 days — try it?"*

> *"3 Long Term tasks haven't been touched in 6 weeks. Want a review session now?"*

User can: **Accept**, **Decline**, or **Adjust manually**. The AI never changes intervals without explicit confirmation.

---

### AI Adjustment Timing

The AI runs an analysis pass:

- **After every 3 reminder interactions** on a given task
- **Weekly**, across all tasks, looking for macro patterns
- **On-demand** — user can ask *"Review my reminder settings"*

The AI never adjusts more than once per task per week, to avoid over-tuning on noise.

---

### Reminder Delivery

| Channel | Status |
|---|---|
| In-app notification panel | v1 |
| Push notifications (mobile/desktop) | v2 |
| Email digest (daily or weekly summary) | v2 |
| AI assistant hook (surfaces in Inbox with context) | v2 |

Delivery channel is configurable per-list and per-task.

---

### Extended Task Model (Reminder Fields)

```json
"reminder": {
  "enabled": "boolean",
  "interval_days": "integer (current active interval)",
  "default_interval_days": "integer (original list default)",
  "last_reminded_at": "timestamp | null",
  "next_reminder_at": "timestamp",
  "snooze_count": "integer",
  "action_history": [
    { "action": "done | not_yet | move_up | snooze", "at": "timestamp" }
  ],
  "ai_suggested_interval": "integer | null",
  "ai_suggestion_reason": "string | null",
  "ai_suggestion_pending": "boolean"
}
```

---

## AI / Voice Integration (v2)

- A global capture endpoint: anything sent via API or voice assistant goes straight to **Inbox**
- Optional: AI triage suggestions ("this looks like a Short Term task")
- User always confirms moves — AI never auto-sorts

---

## Storage

| Layer | Status |
|---|---|
| Local-first (localStorage or IndexedDB) | v1 |
| Full JSON export | v1 |
| Cloud sync (account-based) | v2 |

---

## Out of Scope (v1)

- Due dates and time-based reminders
- Time-of-day reminder scheduling (reminders fire at next app open)
- Recurring tasks
- Collaboration and sharing
- Labels or tags
- Sub-tasks beyond one level of notes
- Calendar integration
- SMS delivery
- Reminder delegation

---

*End of Quadrant Spec v0.1*
