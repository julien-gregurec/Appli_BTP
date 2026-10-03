import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ASSETS_MARQUE, MARQUE } from "@/lib/branding";

export const metadata: Metadata = {
  title: MARQUE.nomVersion,
  description: `${MARQUE.nomVersion} — Gestion quotidienne des entreprises du BTP`,
  applicationName: MARQUE.nomVersion,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: ASSETS_MARQUE.icone192, sizes: "192x192", type: "image/png" },
      { url: ASSETS_MARQUE.icone512, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: ASSETS_MARQUE.appleTouch, sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: MARQUE.nomVersion, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: MARQUE.couleurFond };

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
