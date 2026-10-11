"use client";

import React from "react";
import { useTheme } from "./theme";

export interface FooterProps {
  children?: React.ReactNode;
}

/**
 * The credit line at the bottom of the app. Deliberately the same grey in both themes — it
 * should recede equally against black and white.
 */
export function Footer({ children }: FooterProps) {
  const { c, t } = useTheme();
  return (
    <div
      style={{
        padding: t.space.md,
        textAlign: "center",
        fontSize: t.fontSizes.sm,
        color: c.fg.subtle,
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {children ?? (
        <>
          notedude &bull; an{" "}
          <a
            href="https://nbino.tech"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: c.fg.subtle, textDecoration: "underline" }}
          >
            nbino
          </a>{" "}
          production
        </>
      )}
    </div>
  );
}
