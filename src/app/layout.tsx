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
      <head>
        {/* Écrans de lancement iOS.
            Android fabrique le sien à partir du manifeste ; iOS ne le fait pas et
            affiche un rectangle blanc pendant tout le démarrage sans ces balises.
            La media query doit correspondre EXACTEMENT aux dimensions logiques et à
            la densité de l'appareil : une taille manquante et le blanc revient.
            Générées par scripts/mobile/generer-ecrans-lancement.mjs. */}
        {/* iPhone SE, 8 */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-375x667@2x.png"
          media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPhone 8 Plus */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-414x736@3x.png"
          media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone X, XS, 11 Pro */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-375x812@3x.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone XR, 11 */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-414x896@2x.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPhone XS Max, 11 Pro Max */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-414x896@3x.png"
          media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 12, 13, 14 */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-390x844@3x.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 12/13 Pro Max, 14 Plus */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-428x926@3x.png"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14 Pro, 15, 16 */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-393x852@3x.png"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPhone 14/15/16 Pro Max */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-430x932@3x.png"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        {/* iPad 10.2 */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-810x1080@2x.png"
          media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPad Pro 11 */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-834x1194@2x.png"
          media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        {/* iPad Pro 12.9 */}
        <link rel="apple-touch-startup-image" href="/ecrans-lancement/lancement-1024x1366@2x.png"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
