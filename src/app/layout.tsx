import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LIRIA CONCEPT — Gestion BTP",
  description: "LIRIA CONCEPT — Concevoir, aménager, réaliser",
  applicationName: "LIRIA Gestion BTP",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/liria-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/liria-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icons/liria-apple-touch.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "LIRIA BTP", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0d1b2a" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
