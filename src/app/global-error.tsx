"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// React render errors that escape every boundary land here; without this they are never
// reported. A no-op when Sentry was not initialised (no DSN). #206
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" style={{ backgroundColor: "#1a1a1a" }}>
      <body style={{ margin: 0, padding: 24, color: "#ddd", fontFamily: "monospace" }}>
        <p>Something went wrong. Reload the page to continue.</p>
      </body>
    </html>
  );
}
