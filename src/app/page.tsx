"use client";

import App from "@/components/App";
import { useAuth } from "@/lib/useAuth";

export default function Page() {
  const { user, loading, login, logout } = useAuth();

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Fira Code', monospace" }}>loading...</div>;
  }

  if (!user) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Fira Code', monospace", gap: 16 }}>
        <div>notedude</div>
        <button onClick={login} style={{ padding: "8px 16px", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
          sign in with google
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
        <App uid={user.uid} />
      </div>
    </div>
  );
}
