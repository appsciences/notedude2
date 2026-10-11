"use client";

import React from "react";
import { useTheme } from "./theme";

export type ButtonVariant = "default" | "outline" | "toolbar" | "link";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `default` — native button chrome; the primary sign-in action.
   * `outline` — bordered and transparent, in muted text; the demo-mode entry point.
   * `toolbar` — bordered and transparent, in body text, stretched; the mobile toolbar (#108).
   * `link`    — underlined text with no box; logout, and returning from demo mode.
   */
  variant?: ButtonVariant;
}

/**
 * The app's four button treatments. Every one inherits the monospace face from its container
 * rather than restating it, so a button always matches the text around it.
 */
export function Button({ variant = "default", style, children, ...rest }: ButtonProps) {
  const { c, t } = useTheme();

  const byVariant: Record<ButtonVariant, React.CSSProperties> = {
    default: {
      padding: `${t.space.md}px ${t.space.lg}px`,
      fontSize: t.fontSizes.md,
    },
    outline: {
      padding: `${t.space.md}px ${t.space.lg}px`,
      fontSize: t.fontSizes.md,
      background: "none",
      border: `1px solid ${c.border.default}`,
      color: c.fg.dim,
    },
    toolbar: {
      flex: 1,
      padding: `${t.space.touch}px ${t.space.lg}px`,
      fontSize: t.fontSizes.md,
      background: "transparent",
      border: `1px solid ${c.border.default}`,
      color: "inherit",
    },
    link: {
      fontSize: "inherit",
      background: "none",
      border: "none",
      textDecoration: "underline",
      color: c.fg.dim,
    },
  };

  return (
    <button
      {...rest}
      style={{ fontFamily: "inherit", cursor: "pointer", ...byVariant[variant], ...style }}
    >
      {children}
    </button>
  );
}
