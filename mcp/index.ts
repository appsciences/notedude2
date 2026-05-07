import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import admin from "firebase-admin";

// ── Firebase init ──────────────────────────────────────────────────────────────

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const uid = process.env.NOTEDUDE_USER_UID;

if (!serviceAccountPath) {
  console.error("Missing GOOGLE_APPLICATION_CREDENTIALS in .env");
  process.exit(1);
}
if (!uid) {
  console.error("Missing NOTEDUDE_USER_UID in .env");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "notedude2",
});

const db = admin.firestore();
const notesCol = () => db.collection("users").doc(uid!).collection("notes");

// ── Helpers ────────────────────────────────────────────────────────────────────

interface Note {
  id: string;
  content: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

async function fetchAllNotes(): Promise<Note[]> {
  const snap = await notesCol().orderBy("updatedAt", "desc").get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      content: data.content ?? "",
      pinned: data.pinned ?? false,
      createdAt: data.createdAt ?? 0,
      updatedAt: data.updatedAt instanceof admin.firestore.Timestamp
        ? data.updatedAt.toMillis()
        : data.updatedAt ?? 0,
    };
  });
}

function noteTitle(note: Note): string {
  return note.content.split("\n")[0] || "No Text Entered";
}

function formatNote(note: Note): string {
  return [
    `id: ${note.id}`,
    `title: ${noteTitle(note)}`,
    `pinned: ${note.pinned}`,
    `updatedAt: ${new Date(note.updatedAt).toISOString()}`,
    `---`,
    note.content,
  ].join("\n");
}

// ── MCP server ─────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "notedude",
  version: "1.0.0",
});

server.tool(
  "list_notes",
  "List all notedude notes, optionally filtered by a search query or tag (e.g. #work).",
  { query: z.string().optional().describe("Text or #tag to filter by") },
  async ({ query }) => {
    const notes = await fetchAllNotes();
    const filtered = query
      ? notes.filter((n) => {
          const q = query.toLowerCase();
          return n.content.toLowerCase().includes(q);
        })
      : notes;
    if (filtered.length === 0) return { content: [{ type: "text", text: "No notes found." }] };
    const lines = filtered.map(
      (n) => `[${n.id}] ${n.pinned ? "● " : ""}${noteTitle(n)} (updated ${new Date(n.updatedAt).toLocaleDateString()})`
    );
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "get_note",
  "Get the full content of a note by its id.",
  { id: z.string().describe("Note id") },
  async ({ id }) => {
    const doc = await notesCol().doc(id).get();
    if (!doc.exists) return { content: [{ type: "text", text: `Note ${id} not found.` }] };
    const data = doc.data()!;
    const note: Note = {
      id: doc.id,
      content: data.content ?? "",
      pinned: data.pinned ?? false,
      createdAt: data.createdAt ?? 0,
      updatedAt: data.updatedAt instanceof admin.firestore.Timestamp
        ? data.updatedAt.toMillis()
        : data.updatedAt ?? 0,
    };
    return { content: [{ type: "text", text: formatNote(note) }] };
  }
);

server.tool(
  "search_notes",
  "Search notes by text query or #tag. Returns matching notes with full content.",
  { query: z.string().describe("Text or #tag to search for") },
  async ({ query }) => {
    const notes = await fetchAllNotes();
    const q = query.toLowerCase().trim();
    const matched = notes.filter((n) => {
      if (q.startsWith("#")) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`${escaped}(?=[\\s,.]|$)`, "i").test(n.content);
      }
      return n.content.toLowerCase().includes(q);
    });
    if (matched.length === 0) return { content: [{ type: "text", text: "No matching notes." }] };
    return { content: [{ type: "text", text: matched.map(formatNote).join("\n\n═══\n\n") }] };
  }
);

server.tool(
  "create_note",
  "Create a new note with the given content.",
  {
    content: z.string().describe("Note content (first line becomes the title)"),
    pinned: z.boolean().optional().describe("Whether to pin the note (default false)"),
  },
  async ({ content, pinned = false }) => {
    const now = Date.now();
    const ref = notesCol().doc();
    await ref.set({
      content,
      pinned,
      createdAt: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { content: [{ type: "text", text: `Created note ${ref.id}: "${content.split("\n")[0]}"` }] };
  }
);

server.tool(
  "update_note",
  "Update an existing note's content and/or pin status.",
  {
    id: z.string().describe("Note id"),
    content: z.string().optional().describe("New content (omit to keep existing)"),
    pinned: z.boolean().optional().describe("New pin status (omit to keep existing)"),
  },
  async ({ id, content, pinned }) => {
    const ref = notesCol().doc(id);
    const doc = await ref.get();
    if (!doc.exists) return { content: [{ type: "text", text: `Note ${id} not found.` }] };
    const updates: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (content !== undefined) updates.content = content;
    if (pinned !== undefined) updates.pinned = pinned;
    await ref.update(updates);
    return { content: [{ type: "text", text: `Updated note ${id}.` }] };
  }
);

server.tool(
  "delete_note",
  "Archive a note by id (soft-delete — sets archived:true, hidden from the app but not permanently removed).",
  { id: z.string().describe("Note id to archive") },
  async ({ id }) => {
    const ref = notesCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists) return { content: [{ type: "text", text: `Note ${id} not found.` }] };
    const title = (snap.data()?.content ?? "").split("\n")[0] || "untitled";
    await ref.update({ archived: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { content: [{ type: "text", text: `Archived note ${id}: "${title}"` }] };
  }
);

// ── Start ──────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
