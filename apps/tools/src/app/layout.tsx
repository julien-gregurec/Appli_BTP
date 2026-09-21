import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { NativeRuntimeBridge } from "@/components/NativeRuntimeBridge";
import { AccountProvider } from "@/components/AccountProvider";
import { getPublicUrl, SITE } from "@/lib/site";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, OG_IMAGE, OG_LOCALE, TITLE_TEMPLATE } from "@/lib/seo";
import "./globals.css";

const publicUrl = getPublicUrl();

/*
 * Socle commun. `metadataBase` rend les chemins relatifs (`/og-tools.png`) absolus ; l'URL
 * canonique n'est PAS posée ici : chaque page déclare la sienne via `pageMetadata`, sinon toutes
 * les routes hériteraient de la canonique de l'accueil.
 */
export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  title: { default: DEFAULT_TITLE, template: TITLE_TEMPLATE },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE.productName,
  manifest: "/manifest.webmanifest",
  // iOS ignore le manifeste : sans ce lien il fabrique une icone d'ecran d'accueil a partir d'une capture.
  icons: { apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Tools" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: OG_LOCALE,
    siteName: SITE.productName,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: OG_IMAGE.path, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt, type: OG_IMAGE.type }],
  },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, images: [OG_IMAGE.path] },
};

export const viewport: Viewport = { themeColor: "#f5aa22", colorScheme: "light", viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><AccountProvider>{children}</AccountProvider><NativeRuntimeBridge /><ServiceWorkerRegister /><OfflineIndicator /></body></html>;
}
