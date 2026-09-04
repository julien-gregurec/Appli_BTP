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
  // Application privée/authentifiée : jamais indexée par défaut. Le site
  // marketing public (elsatia.fr) porte le référencement de la marque et des
  // tarifs ; app.elsatia.fr reste hors des résultats de recherche, y compris
  // ses pages non authentifiées (connexion, tarifs, mentions légales…) pour
  // éviter tout contenu dupliqué. Une page individuelle peut redéfinir
  // `robots` si elle doit un jour être indexée — aucune ne le fait ici.
  robots: { index: false, follow: false, nocache: true },
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
