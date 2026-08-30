import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { NativeRuntimeBridge } from "@/components/NativeRuntimeBridge";
import { getPublicUrl, SITE } from "@/lib/site";
import "./globals.css";

const publicUrl = getPublicUrl();

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: { default: "ELSATIA Tools — La boîte à outils numérique du chantier", template: "%s | ELSATIA Tools" },
  description: "Calculateurs et tracés BTP gratuits : équerrage, pentes, surfaces, répartitions, cercles et arches. Sans compte.",
  applicationName: SITE.productName,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Tools" },
  formatDetection: { telephone: false },
  openGraph: { title: SITE.productName, description: SITE.tagline, type: "website", locale: "fr_FR" },
};

export const viewport: Viewport = { themeColor: "#f5aa22", colorScheme: "light", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}<NativeRuntimeBridge /><ServiceWorkerRegister /></body></html>;
}
