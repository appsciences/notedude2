"use client";

import React from "react";
import { useTheme } from "./theme";

export interface FooterProps {
  children?: React.ReactNode;
  /** Product name in the default credit line — the two build variants differ only here (#151). */
  brand?: string;
}

/**
 * The credit line at the bottom of the app. Deliberately the same grey in both themes — it
 * should recede equally against black and white.
 */
export function Footer({ children, brand = "notedude" }: FooterProps) {
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
          {brand} &bull; an{" "}
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
