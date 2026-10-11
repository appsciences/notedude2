import { JWT } from "google-auth-library";
import { listToText } from "./convert.ts";
import type { KeepClient, KeepNote } from "./types.ts";

/**
 * Google Keep REST client.
 *
 * The Keep API is Workspace-only and has no update method — see spec.md
 * § Constraints imposed by the Keep API. This client therefore exposes exactly
 * list / create / delete, which is the whole write surface available to us.
 */

const KEEP_API = "https://keep.googleapis.com/v1";
export const KEEP_SCOPE = "https://www.googleapis.com/auth/keep";

interface RawListItem {
  text?: { text?: string };
  checked?: boolean;
}

interface RawNote {
  name?: string;
  title?: string;
  body?: { text?: { text?: string }; list?: { listItems?: RawListItem[] } };
  updateTime?: string;
  trashed?: boolean;
  trashTime?: string;
  attachments?: unknown[];
}

/** Normalise the API's note shape, flattening checklists to markdown checkboxes. */
export function normaliseNote(raw: RawNote): KeepNote {
  const list = raw.body?.list?.listItems;
  const isList = Array.isArray(list);
  return {
    name: raw.name ?? "",
    title: raw.title ?? "",
    body: isList ? listToText(list) : raw.body?.text?.text ?? "",
    updateTime: raw.updateTime ? Date.parse(raw.updateTime) : 0,
    // trashTime is set even when `trashed` is absent from the payload.
    trashed: raw.trashed === true || Boolean(raw.trashTime),
    isList,
    hasAttachments: Array.isArray(raw.attachments) && raw.attachments.length > 0,
  };
}

export interface GoogleKeepClientOptions {
  /** Service account JSON key path. Needs domain-wide delegation for KEEP_SCOPE. */
  keyFile: string;
  /** Workspace user to impersonate — the owner of the notes. */
  subject: string;
}

export class GoogleKeepClient implements KeepClient {
  private readonly auth: JWT;

  constructor({ keyFile, subject }: GoogleKeepClientOptions) {
    // Domain-wide delegation: the service account acts *as* the user, which is
    // the only way to reach a Workspace user's own Keep notes.
    this.auth = new JWT({ keyFile, scopes: [KEEP_SCOPE], subject });
  }

  async listNotes(): Promise<KeepNote[]> {
    const notes: KeepNote[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${KEEP_API}/notes`);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await this.auth.request<{ notes?: RawNote[]; nextPageToken?: string }>({
        url: url.toString(),
        method: "GET",
      });
      for (const raw of res.data.notes ?? []) notes.push(normaliseNote(raw));
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    return notes;
  }

  async createNote(title: string, body: string): Promise<KeepNote> {
    const res = await this.auth.request<RawNote>({
      url: `${KEEP_API}/notes`,
      method: "POST",
      data: { title, body: { text: { text: body } } },
    });
    return normaliseNote(res.data);
  }

  /**
   * Permanent. The API offers no trash operation — "removes the resource
   * immediately and cannot be undone". Callers must have created the
   * replacement first.
   */
  async deleteNote(name: string): Promise<void> {
    await this.auth.request({ url: `${KEEP_API}/${name}`, method: "DELETE" });
  }
}
