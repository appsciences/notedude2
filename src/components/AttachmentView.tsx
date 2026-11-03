"use client";

import React, { useEffect, useState } from "react";
import { AttachmentChip, type AttachmentRef } from "@notedude/ui";
import type { AttachmentStore } from "../lib/attachments";

/**
 * One attachment in the read view. A file is a chip; an image is drawn inline once its URL
 * resolves, and shows as a chip until then (or if it never does — a deleted object must not
 * leave a hole in the note). Clicking either opens the file in a new tab.
 */
export function AttachmentView({
  attachment,
  store,
  onOpen,
}: {
  attachment: AttachmentRef;
  store: AttachmentStore | null;
  onOpen: (id: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!attachment.image || !store) return;
    let cancelled = false;
    store.url(attachment.id).then(
      (url) => { if (!cancelled) setSrc(url); },
      () => { if (!cancelled) setSrc(null); },
    );
    return () => { cancelled = true; };
  }, [attachment.id, attachment.image, store]);

  const open = () => onOpen(attachment.id);

  if (attachment.image && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={attachment.name}
        data-testid="attachment-image"
        onClick={(e) => { e.stopPropagation(); open(); }}
        style={{ display: "block", maxWidth: "100%", cursor: "pointer" }}
      />
    );
  }
  return <AttachmentChip name={attachment.name} onOpen={open} />;
}
