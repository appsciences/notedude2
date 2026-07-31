import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "notedude",
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

// The app is sized to the viewport and must never make the document scrollable — a
// scrolling page takes the account header out of view. The browser's default 8px body
// margin alone is enough to push a 100vh child past the bottom, so it has to go. There is
// no stylesheet in this project (everything else is inline styles), hence the inline
// <style>. See #124.
const resetStyles = `html,body{margin:0;padding:0;height:100%;overflow:hidden;}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: "#1a1a1a" }} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: resetStyles }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href="/notedude-n_d-icon-32.png" sizes="32x32" />
        <link rel="icon" href="/notedude-n_d-icon-16.png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/notedude-n_d-icon-180.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
