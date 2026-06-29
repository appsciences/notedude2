"use client";

import App from "@/components/App";
import { useAuth } from "@/lib/useAuth";
import { useEffect, useState } from "react";

// Local-dev convenience only — auth can never be bypassed in a production build,
// even if NEXT_PUBLIC_SKIP_AUTH leaks into the deployed environment.
const SKIP_AUTH =
  process.env.NEXT_PUBLIC_SKIP_AUTH === "true" && process.env.NODE_ENV !== "production";

function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile|webOS/i.test(navigator.userAgent));
  }, []);
  return isMobile;
}

// Dark mode is the default for the pre-app screens too; only switch to light if
// the user has explicitly chosen it (mirrors the logic in App.tsx).
function useDarkMode(): boolean {
  const [darkMode, setDarkMode] = useState(true);
  useEffect(() => {
    if (localStorage.getItem("theme") === "light") setDarkMode(false);
  }, []);
  return darkMode;
}

export default function Page() {
  const { user, loading, login, logout } = useAuth();
  const [demoMode, setDemoMode] = useState(false);
  const isMobile = useIsMobile();
  const darkMode = useDarkMode();

  useEffect(() => {
    if (loading || user || demoMode) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "d") setDemoMode(true);
      if (e.key === "Enter") login();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [loading, user, demoMode, login]);

  const bg = darkMode ? "#1a1a1a" : "#ffffff";
  const fg = darkMode ? "#e8e8e8" : "#000000";
  const muted = darkMode ? "#888" : "#666";
  const border = darkMode ? "#444" : "#ccc";

  if (SKIP_AUTH) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: bg }}>
        <div style={{ flex: 1 }}>
          <App />
        </div>
      </div>
    );
  }

  if (loading || isMobile === null) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Fira Code', monospace", background: bg, color: fg }}>loading...</div>;
  }

  if (isMobile) {
    return (
      <div data-testid="mobile-block" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Fira Code', monospace", padding: 32, textAlign: "center", background: bg, color: fg }}>
        notedude is a keyboard-driven app and does not support mobile browsers.
      </div>
    );
  }

  if (demoMode) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: bg }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 8px", fontSize: 12, fontFamily: "'Fira Code', monospace", color: muted }}>
          demo mode —{" "}
          <button onClick={() => setDemoMode(false)} style={{ marginLeft: 6, fontFamily: "inherit", fontSize: "inherit", cursor: "pointer", background: "none", border: "none", textDecoration: "underline", color: muted }}>
            sign in
          </button>
        </div>
        <div style={{ flex: 1 }}>
          <App demo onLogout={() => setDemoMode(false)} />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div data-testid="login-screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Fira Code', monospace", gap: 16, background: bg, color: fg }}>
        <div>notedude</div>
        <button onClick={login} style={{ padding: "8px 16px", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
          ⏎ sign in with google
        </button>
        <button onClick={() => setDemoMode(true)} style={{ padding: "8px 16px", fontFamily: "inherit", fontSize: 14, cursor: "pointer", background: "none", border: `1px solid ${border}`, color: muted }}>
          <u>d</u>emo mode
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: bg }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 8px", fontSize: 12, fontFamily: "'Fira Code', monospace", color: muted }}>
        {user.email} <button onClick={logout} style={{ marginLeft: 8, fontFamily: "inherit", fontSize: "inherit", cursor: "pointer", background: "none", border: "none", textDecoration: "underline", color: muted }}>logout</button>
      </div>
      <div style={{ flex: 1 }}>
        <App uid={user.uid} onLogout={logout} />
      </div>
    </div>
  );
}
