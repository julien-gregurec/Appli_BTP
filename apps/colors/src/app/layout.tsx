import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ROBOTS_PRECOMMERCIAL } from "@/lib/seo/indexation";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_COLORS_URL ?? "http://localhost:3010"),
  title: { default: "ELSATIA Colors", template: "%s · ELSATIA Colors" },
  description: "Gestion intelligente des stocks et des teintes de peinture",
  applicationName: "ELSATIA Colors",
  manifest: "/manifest.webmanifest",
  // Phase précommerciale : aucune route de Colors n'est indexable.
  // Hérité par toutes les pages, aucune ne le redéclare.
  robots: ROBOTS_PRECOMMERCIAL,
  icons: {
    icon: [
      { url: "/icons/colors-icon.svg", type: "image/svg+xml" },
      { url: "/icons/colors-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS ne lit pas une icône SVG : sans ce PNG, « Sur l'écran d'accueil »
    // remplace l'icône par une capture de la page.
    apple: { url: "/icons/colors-apple-touch.png", sizes: "180x180", type: "image/png" },
  },
};

export const viewport: Viewport = {
  themeColor: "#44264d",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
