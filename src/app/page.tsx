"use client";

import App, { type AppCommands } from "@/components/App";
import { useAuth } from "@/lib/useAuth";
import { DEV_MODE_LABEL, skipAuthEnabled } from "@/lib/devMode";
import { useEffect, useRef, useState } from "react";
import {
  AccountHeader,
  AppShell,
  AppSlot,
  Button,
  LoadingScreen,
  LoginScreen,
  ThemeProvider,
  space,
} from "@notedude/ui";

// Local-dev convenience only — auth can never be bypassed in a production build,
// even if NEXT_PUBLIC_SKIP_AUTH leaks into the deployed environment.
const SKIP_AUTH = skipAuthEnabled(process.env.NEXT_PUBLIC_SKIP_AUTH, process.env.NODE_ENV);

// Dark mode is the default for the pre-app screens too; only switch to light if
// the user has explicitly chosen it.
//
// This is read once on mount and is deliberately independent of the theme App keeps for
// itself: toggling dark mode with `d → m` inside the app repaints the app, not this
// chrome, until the next load. That has always been the behaviour.
function useDarkMode(): boolean {
  const [darkMode, setDarkMode] = useState(true);
  useEffect(() => {
    if (localStorage.getItem("theme") === "light") setDarkMode(false);
  }, []);
  return darkMode;
}

export default function Page() {
  const { user, loading, error, login, logout } = useAuth();
  const [demoMode, setDemoMode] = useState(false);
  const darkMode = useDarkMode();
  // Lets the header's export / import links reach into the app (#16).
  const commandsRef = useRef<AppCommands | null>(null);

  // The pointer route to Export / Import; the keyboard route is Shift+E / Shift+I.
  const backupLinks = (
    <>
      <Button
        variant="link"
        data-testid="export-link"
        style={{ marginLeft: space.md }}
        onClick={() => commandsRef.current?.exportNotes()}
      >
        export
      </Button>
      <Button
        variant="link"
        data-testid="import-link"
        style={{ marginLeft: space.sm }}
        onClick={() => commandsRef.current?.importNotes()}
      >
        import
      </Button>
    </>
  );

  useEffect(() => {
    if (loading || user || demoMode) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "d") setDemoMode(true);
      if (e.key === "Enter") login();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [loading, user, demoMode, login]);

  const theme = darkMode ? "dark" : "light";

  const body = () => {
    if (SKIP_AUTH) {
      return (
        <AppShell>
          {/* Labelled so the bypass is not mistaken for a broken sign-in (#230). */}
          <AccountHeader>
            <span data-testid="dev-mode-banner">{DEV_MODE_LABEL}</span>
          </AccountHeader>
          <AppSlot>
            <App />
          </AppSlot>
        </AppShell>
      );
    }

    if (loading) return <LoadingScreen />;

    if (demoMode) {
      return (
        <AppShell>
          <AccountHeader>
            demo mode —{" "}
            <Button
              variant="link"
              style={{ marginLeft: space.sm }}
              onClick={() => setDemoMode(false)}
            >
              sign in
            </Button>
            {backupLinks}
          </AccountHeader>
          <AppSlot>
            <App demo onLogout={() => setDemoMode(false)} commandsRef={commandsRef} />
          </AppSlot>
        </AppShell>
      );
    }

    if (!user) {
      return (
        <LoginScreen onSignIn={login} onDemo={() => setDemoMode(true)} error={error} />
      );
    }

    return (
      <AppShell>
        <AccountHeader>
          {user.email}
          {backupLinks}
          <Button variant="link" style={{ marginLeft: space.md }} onClick={logout}>
            logout
          </Button>
        </AccountHeader>
        <AppSlot>
          <App uid={user.uid} onLogout={logout} commandsRef={commandsRef} />
        </AppSlot>
      </AppShell>
    );
  };

  return <ThemeProvider theme={theme}>{body()}</ThemeProvider>;
}
