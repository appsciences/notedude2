"use client";

import React from "react";
import { useTheme } from "./theme";

export interface AppShellProps {
  children: React.ReactNode;
}

/**
 * The page frame: exactly one viewport tall, never scrolling.
 *
 * `overflow: hidden` is what keeps the account header from being pushed off screen — a flex
 * item's default `min-height: auto` resolves to its content's height, so without this the
 * page grew taller than the viewport and scrolled (#124).
 */
export function AppShell({ children }: AppShellProps) {
  const { c } = useTheme();
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: c.bg.app,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export interface AppSlotProps {
  children: React.ReactNode;
}

/**
 * The region the app itself occupies inside the shell. `minHeight: 0` lets it shrink to the
 * space actually left over rather than being sized by its own content (#124).
 */
export function AppSlot({ children }: AppSlotProps) {
  return <div style={{ flex: 1, minHeight: 0 }}>{children}</div>;
}

export interface AccountHeaderProps {
  children: React.ReactNode;
}

/** The right-aligned identity strip above the app. Never compressed, never scrolled away. */
export function AccountHeader({ children }: AccountHeaderProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="account-header"
      style={{
        display: "flex",
        justifyContent: "flex-end",
        padding: `${t.space.xs}px ${t.space.md}px`,
        fontSize: t.fontSizes.sm,
        fontFamily: t.fonts.mono,
        color: c.fg.dim,
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}
