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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/notedude-n_d-icon-32.png" sizes="32x32" />
        <link rel="icon" href="/notedude-n_d-icon-16.png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/notedude-n_d-icon-180.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
