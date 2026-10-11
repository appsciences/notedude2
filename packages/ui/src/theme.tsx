"use client";

import React, { createContext, useContext, useMemo } from "react";
import { colors, type ThemedColor, tokens } from "./tokens";

export type ThemeName = "dark" | "light";

/**
 * `colors` with every dark/light pair collapsed to the string for the active theme, so a
 * component writes `c.bg.app` instead of re-deciding `darkMode ? ... : ...` at each use.
 */
export type ResolvedColors = {
  [Group in keyof typeof colors]: {
    [Name in keyof (typeof colors)[Group]]: string;
  };
};

function resolve(theme: ThemeName): ResolvedColors {
  const out = {} as Record<string, Record<string, string>>;
  for (const [group, entries] of Object.entries(colors)) {
    out[group] = Object.fromEntries(
      Object.entries(entries as Record<string, ThemedColor>).map(([name, value]) => [
        name,
        value[theme],
      ])
    );
  }
  return out as ResolvedColors;
}

export interface Theme {
  name: ThemeName;
  /** True when `name === "dark"`. Kept for the few places that genuinely branch on it. */
  isDark: boolean;
  /** Theme-resolved colours. */
  c: ResolvedColors;
  /** Everything theme-independent: type scale, spacing, radii, z-indices. */
  t: typeof tokens;
}

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  theme: ThemeName;
  children: React.ReactNode;
}

/**
 * Supplies the active theme to every component below it.
 *
 * Components are unstyled without it — `useTheme` throws rather than silently falling back
 * to dark, because a wrong-but-plausible theme is far harder to notice than a crash.
 */
export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  const value = useMemo<Theme>(
    () => ({ name: theme, isDark: theme === "dark", c: resolve(theme), t: tokens }),
    [theme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a <ThemeProvider>. Wrap your tree in one.");
  }
  return ctx;
}
