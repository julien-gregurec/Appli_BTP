import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_RESERVES_URL ?? "http://localhost:3020"),
  title: { default: "ELSATIA Réserves", template: "%s · ELSATIA Réserves" },
  description: "Réserves de chantier : constat, attribution, levée et validation",
  applicationName: "ELSATIA Réserves",
  // Application interne pré-commerciale : elle ne doit pas être indexée.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#10201f",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
