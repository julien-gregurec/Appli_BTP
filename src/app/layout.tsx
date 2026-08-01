import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/lib/brand";

// La CSP à nonce exige un rendu par requête pour que Next transmette le nonce
// aux scripts générés. Cette décision privilégie la sécurité au cache statique.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: BRAND.urlPublique ? new URL(BRAND.urlPublique) : undefined,
  title: BRAND.nomApplication,
  description: BRAND.description,
  applicationName: BRAND.nomApplication,
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: BRAND.nomApplication,
    title: BRAND.nomApplication,
    description: BRAND.description,
  },
  appleWebApp: { capable: true, title: BRAND.nomApplication, statusBarStyle: "black-translucent" },
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
