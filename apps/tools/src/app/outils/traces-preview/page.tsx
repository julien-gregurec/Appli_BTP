import type { Metadata } from "next";
import { TracesPreviewWorkspace } from "@/components/TracesPreviewWorkspace";

// Route interne/preview (FIRST-FUNCTIONAL-LOT-V1 §13) : chemin littéral "/outils/traces-preview",
// prioritaire sur la route dynamique "/outils/[id]" (convention Next.js App Router — un segment
// littéral l'emporte toujours sur un segment dynamique du même niveau). Absente de
// generateStaticParams (catalog.ts), absente du sitemap (sitemap.ts n'énumère que activeTools),
// et explicitement exclue de l'indexation ici. Aucun lien de navigation ne pointe vers cette
// page : accessible uniquement en connaissant l'URL exacte.
export const metadata: Metadata = {
  title: "Prévisualisation technique interne — non publiée",
  robots: { index: false, follow: false, nocache: true },
};

export default function TracesPreviewPage() {
  return <TracesPreviewWorkspace />;
}
