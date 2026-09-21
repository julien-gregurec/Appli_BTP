import type { Metadata } from "next";
import { AtelierFreePreviewWorkspace } from "@/components/AtelierFreePreviewWorkspace";

/**
 * Route interne / non cataloguée du tracé libre (ATELIER-FREE-DRAWING-FOUNDATION-V1 §14/§16).
 * Absente du sitemap et de la navigation ; explicitement `noindex`, `nofollow`, `nocache`.
 */
export const metadata: Metadata = {
  title: "Preview — Tracé libre Atelier (interne)",
  robots: { index: false, follow: false, nocache: true },
};

export default function AtelierFreePreviewPage() {
  return <AtelierFreePreviewWorkspace />;
}
