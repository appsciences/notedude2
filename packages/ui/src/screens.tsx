"use client";

import React from "react";
import { useTheme } from "./theme";
import { Button } from "./Button";

/** Shared centring for the two full-viewport pre-app screens. */
function centered(extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    ...extra,
  };
}

export interface LoadingScreenProps {
  label?: string;
}

/** Shown while auth resolves, before we know which screen is next. */
export function LoadingScreen({ label = "loading..." }: LoadingScreenProps) {
  const { c, t } = useTheme();
  return (
    <div
      style={centered({
        fontFamily: t.fonts.mono,
        background: c.bg.app,
        color: c.fg.default,
      })}
    >
      {label}
    </div>
  );
}

export interface LoginScreenProps {
  onSignIn: () => void;
  onDemo: () => void;
  /** A failed sign-in used to look identical to no sign-in at all (#132). */
  error?: string | null;
  title?: string;
}

/** The signed-out screen: brand, the two ways in, and any sign-in failure. */
export function LoginScreen({ onSignIn, onDemo, error, title = "notedude" }: LoginScreenProps) {
  const { c, t } = useTheme();
  return (
    <div
      data-testid="login-screen"
      style={centered({
        flexDirection: "column",
        fontFamily: t.fonts.mono,
        gap: t.space.lg,
        background: c.bg.app,
        color: c.fg.default,
      })}
    >
      <div>{title}</div>
      <Button onClick={onSignIn}>⏎ sign in with google</Button>
      <Button variant="outline" onClick={onDemo}>
        <u>d</u>emo mode
      </Button>
      {error && (
        <div
          data-testid="login-error"
          role="alert"
          style={{
            fontSize: t.fontSizes.sm,
            maxWidth: 380,
            textAlign: "center",
            color: c.fg.danger,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
