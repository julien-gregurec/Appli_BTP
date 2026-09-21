import type { Metadata } from "next";
import { HomeDashboard } from "@/components/HomeDashboard";
import { DEFAULT_DESCRIPTION, jsonLdScript, pageMetadata, softwareApplicationJsonLd, websiteJsonLd } from "@/lib/seo";

/* `title: null` : l'accueil garde le titre par défaut du layout, sans suffixe de marque doublé. */
export const metadata: Metadata = pageMetadata({ title: null, description: DEFAULT_DESCRIPTION, path: "/" });

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(softwareApplicationJsonLd()) }} />
      <HomeDashboard />
    </>
  );
}
