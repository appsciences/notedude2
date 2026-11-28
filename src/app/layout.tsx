import type { Metadata } from "next";
import { gaConfig } from "@/lib/analytics";
import { nonProductionLabel, parseAppEnv } from "@/lib/firebaseConfig";

// Staging and development builds say so on every page and in the tab title (#171).
const envLabel = nonProductionLabel(parseAppEnv(process.env.NEXT_PUBLIC_APP_ENV));

export const metadata: Metadata = {
  title: envLabel ? `[${envLabel}] notedude` : "notedude",
  description: "Keyboard-driven note-taking app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "notedude",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

// Dark mode is the default. This runs before first paint and only switches the
// page background to light when the user has explicitly chosen light mode,
// preventing a light flash on load.
const themeScript = `try{document.documentElement.style.backgroundColor=localStorage.getItem('theme')==='light'?'#ffffff':'#1a1a1a';}catch(e){}`;

// The page is server-rendered, so it is on screen before the bundle has attached the app's
// keydown handler. This tiny script, which runs before anything else, remembers the plain keys
// pressed in that gap so the app can replay them once it is ready, instead of dropping them (#26).
// It skips modified keys, composition, keys typed into a field, and synthetic events (the
// replay and the phone keypad); the app ignores anything older than a few seconds.
const earlyKeysScript = `(function(){var q=[];window.__earlyKeys=q;function h(e){var t=e.target;if(!e.isTrusted||e.metaKey||e.ctrlKey||e.altKey||e.isComposing||e.repeat)return;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))return;if(q.length<8)q.push({key:e.key,code:e.code,shiftKey:e.shiftKey,t:Date.now()})}window.__earlyKeysStop=function(){window.removeEventListener('keydown',h,true)};window.addEventListener('keydown',h,true)})();`;

// The app is sized to the viewport and must never make the document scrollable — a
// scrolling page takes the account header out of view. The browser's default 8px body
// margin alone is enough to push a 100vh child past the bottom, so it has to go. There is
// no stylesheet in this project (everything else is inline styles), hence the inline
// <style>. See #124.
const resetStyles = `html,body{margin:0;padding:0;height:100%;overflow:hidden;}`;

// Opt-in: with no NEXT_PUBLIC_GA_MEASUREMENT_ID at build time (dev, tests, forks) nothing
// below renders and the app never contacts Google. See #207 and spec.md "Analytics".
const ga = gaConfig(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: "#1a1a1a" }} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: resetStyles }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: earlyKeysScript }} />
        <link rel="icon" href="/notedude-n_d-icon-32.png" sizes="32x32" />
        <link rel="icon" href="/notedude-n_d-icon-16.png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/notedude-n_d-icon-180.png" />
        {ga && <script async src={ga.src} />}
        {ga && <script dangerouslySetInnerHTML={{ __html: ga.bootstrap }} />}
      </head>
      <body>
        {children}
        {envLabel && (
          <div
            data-testid="env-badge"
            aria-label={`${envLabel} environment`}
            style={{
              position: "fixed",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2147483647,
              pointerEvents: "none",
              padding: "1px 8px",
              background: "#d97706",
              color: "#1a1a1a",
              font: "bold 11px/16px 'Fira Code', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              borderRadius: "0 0 4px 4px",
            }}
          >
            {envLabel}
          </div>
        )}
      </body>
    </html>
  );
}
