"use client";

import { useEffect } from "react";
import { PENDING_SHARE_KEY, composeSharedNote } from "@/lib/share";

/**
 * Landing route for the Web Share Target declared in manifest.json (#110).
 *
 * Parks the shared payload and bounces to the app, which turns it into a note. Uses
 * `replace` so the share URL does not sit in history — a back press from the note should
 * leave the app, not re-trigger the share.
 */
export default function SharePage() {
  useEffect(() => {
    const content = composeSharedNote(new URLSearchParams(window.location.search));
    try {
      if (content) localStorage.setItem(PENDING_SHARE_KEY, content);
    } catch {
      // Nothing useful to do — fall through to the app rather than trapping the user here.
    }
    window.location.replace("/");
  }, []);

  return (
    <div
      data-testid="share-landing"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "'Fira Code', monospace",
        background: "#1a1a1a",
        color: "#e8e8e8",
      }}
    >
      saving to notedude...
    </div>
  );
}
