import type { Metadata } from "next";
import { ConseilsPreviewWorkspace } from "@/components/ConseilsPreviewWorkspace";

/**
 * Route interne / non cataloguée pour prévisualiser le module Conseils & Techniques.
 * Absente du sitemap et de la navigation ; explicitement `noindex`.
 */
export const metadata: Metadata = {
  title: "Preview — Conseils & Techniques (interne)",
  robots: { index: false, follow: false, nocache: true },
};

export default function ConseilsPreviewPage() {
  return <ConseilsPreviewWorkspace />;
}
