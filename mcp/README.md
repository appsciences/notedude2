# notedude MCP Server

Exposes your notedude notes to Claude via the Model Context Protocol.

## Setup

### 1. Firebase service account key

1. Go to [Firebase Console → Project Settings → Service accounts](https://console.firebase.google.com/project/notedude2/settings/serviceaccounts/adminsdk)
2. Click **Generate new private key** → download the JSON file
3. Save it somewhere safe (e.g. `~/.secrets/notedude2-service-account.json`)

### 2. Find your user UID

1. Go to [Firebase Console → Authentication → Users](https://console.firebase.google.com/project/notedude2/authentication/users)
2. Copy your UID (the long string in the User UID column)

### 3. Create `.env`

```bash
cp .env.example .env
```

Edit `.env`:
```
GOOGLE_APPLICATION_CREDENTIALS=/Users/you/.secrets/notedude2-service-account.json
NOTEDUDE_USER_UID=your-uid-here
```

### 4. Register with Claude Code

The MCP server is already registered in `.claude/settings.json`. Restart Claude Code (or run `/mcp` to reload) — you should see `notedude` listed.

## Available tools

| Tool | Description |
|------|-------------|
| `list_notes` | List all notes, optionally filtered |
| `get_note` | Fetch full content of a note by id |
| `search_notes` | Search by text or `#tag` |
| `create_note` | Create a new note |
| `update_note` | Edit content or pin status |
| `delete_note` | Permanently delete a note |
| `sync_keep` | Two-way sync with Google Keep — see below |

## Example prompts

- *"Show me all my #tasks-today notes"*
- *"Create a note: Meeting with Alex\nDiscuss Q3 roadmap #work"*
- *"Find my note about the Firebase setup and summarise it"*
- *"Do a dry-run Keep sync and show me what would change"*

## Google Keep sync

Two-way sync of every note **not** tagged `#tasks-*`. See spec.md § Google Keep Sync and #142.

### Requirements — read this first

The Keep API is **Google Workspace only**. It does **not** work with personal `@gmail.com` accounts, and there is no way for an individual to self-enable it. You need a Workspace domain and admin console access.

Two API limits shape how sync behaves, and neither is something this implementation can work around:

- **There is no update method.** Keep exposes only `create`, `get`, `list` and `delete`. Pushing a notedude edit to Keep therefore means *delete + recreate*, which mints a new Keep note id and **loses Keep-side labels, reminders, collaborators, colour and pin state**.
- **`notes.delete` is permanent.** There is no trash, and collaborators lose access immediately.

Because of that, sync is deliberately conservative:

| Situation | What happens |
|-----------|--------------|
| Note edited in notedude | Replacement created **first**, then the old Keep note deleted — an interrupted run leaves a duplicate, never a hole |
| Note edited in Keep | Updated in notedude (no destructive step; Firestore supports real updates) |
| Both edited | notedude wins; Keep's version is saved as a new `#sync-conflict` note **before** the old one is deleted |
| Note deleted in Keep | notedude note is **archived** (`#archived`), never hard-deleted |
| Note gains `#tasks-*`, or is archived | Mapping is tombstoned; the Keep note is **left in place** unless you opt into `--on-leave-scope=delete` |
| Keep note has attachments | Never replaced or deleted — the API cannot re-upload media, so the attachment would be unrecoverable |
| Note over 20,000 chars | Skipped and reported, never truncated (notedude allows 100,000, Keep 20,000) |

### 1. Enable the API and create a delegated service account

1. In the [Google Cloud console](https://console.cloud.google.com/apis/library/keep.googleapis.com), enable the **Google Keep API** for your project.
2. Create a service account and generate a JSON key.
3. On the service account, enable **domain-wide delegation** and note its **client ID**.
4. In the [Workspace admin console](https://admin.google.com) → *Security* → *Access and data control* → *API controls* → *Domain-wide delegation*, add the client ID with this scope:

   ```
   https://www.googleapis.com/auth/keep
   ```

### 2. Configure

Add to `.env`:

```
GOOGLE_KEEP_SUBJECT=you@yourdomain.com
# Only if the delegated key differs from your Firebase one:
# GOOGLE_KEEP_SERVICE_ACCOUNT=/path/to/keep-delegated-service-account.json
```

### 3. Run it

Always dry-run first — it prints the plan and touches nothing:

```bash
npm run sync:keep -- --dry-run
```

Then for real:

```bash
npm run sync:keep
```

Or ask Claude to run the `sync_keep` tool.

Flags: `--dry-run`, and `--on-leave-scope=unlink|delete` (default `unlink`).

### 4. Sync on a schedule

A sample launchd agent is in [`keep/com.notedude.keepsync.plist.sample`](keep/com.notedude.keepsync.plist.sample) — it runs a sync every 30 minutes:

```bash
sed "s|__REPO__|$PWD|g" keep/com.notedude.keepsync.plist.sample \
  > ~/Library/LaunchAgents/com.notedude.keepsync.plist
launchctl load ~/Library/LaunchAgents/com.notedude.keepsync.plist
```

The equivalent crontab line:

```
*/30 * * * * cd /path/to/notedude2/mcp && /usr/bin/env node keep/cli.ts >> /tmp/notedude-keepsync.log 2>&1
```

A run exits non-zero if any operation failed, so cron mail surfaces problems.

### Tests

The sync planner is a pure function, so the whole diff — conflicts, scope changes, the duplication loops — is tested without touching a network:

```bash
npm test          # in mcp/
npm run typecheck
```
