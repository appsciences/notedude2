# NoteDude MCP Server

Exposes your NoteDude notes to Claude via the Model Context Protocol.

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

## Example prompts

- *"Show me all my #tasks-today notes"*
- *"Create a note: Meeting with Alex\nDiscuss Q3 roadmap #work"*
- *"Find my note about the Firebase setup and summarise it"*
