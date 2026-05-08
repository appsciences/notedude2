"use client";

import App from "@/components/App";
import { useAuth } from "@/lib/useAuth";
import { useEffect, useState } from "react";

const SKIP_AUTH = process.env.NEXT_PUBLIC_SKIP_AUTH === "true";

export default function Page() {
  const { user, loading, login, logout } = useAuth();
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    if (loading || user || demoMode) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "d") setDemoMode(true);
      if (e.key === "Enter") login();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [loading, user, demoMode, login]);

  if (SKIP_AUTH) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1 }}>
          <App />
        </div>
      </div>
    );
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Fira Code', monospace" }}>loading...</div>;
  }

  if (demoMode) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 8px", fontSize: 12, fontFamily: "'Fira Code', monospace", color: "#888" }}>
          demo mode —{" "}
          <button onClick={() => setDemoMode(false)} style={{ marginLeft: 6, fontFamily: "inherit", fontSize: "inherit", cursor: "pointer", background: "none", border: "none", textDecoration: "underline", color: "#888" }}>
            sign in
          </button>
        </div>
        <div style={{ flex: 1 }}>
          <App demo />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Fira Code', monospace", gap: 16 }}>
        <div>notedude</div>
        <button onClick={login} style={{ padding: "8px 16px", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
          ⏎ sign in with google
        </button>
        <button onClick={() => setDemoMode(true)} style={{ padding: "8px 16px", fontFamily: "inherit", fontSize: 14, cursor: "pointer", background: "none", border: "1px solid #ccc", color: "#666" }}>
          <u>d</u>emo mode
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 8px", fontSize: 12, fontFamily: "'Fira Code', monospace", color: "#666" }}>
        {user.email} <button onClick={logout} style={{ marginLeft: 8, fontFamily: "inherit", fontSize: "inherit", cursor: "pointer", background: "none", border: "none", textDecoration: "underline", color: "#666" }}>logout</button>
      </div>
      <div style={{ flex: 1 }}>
        <App uid={user.uid} onLogout={logout} />
      </div>
    </div>
  );
}
