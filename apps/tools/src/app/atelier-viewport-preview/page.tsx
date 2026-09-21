import type { Metadata } from "next";
import { AtelierViewportPreviewWorkspace } from "@/components/AtelierViewportPreviewWorkspace";

/**
 * Route interne / non cataloguée du viewport Atelier (§12).
 * Absente du sitemap et de la navigation ; explicitement `noindex`, `nofollow`, `nocache`.
 */
export const metadata: Metadata = {
  title: "Preview — Viewport Atelier (interne)",
  robots: { index: false, follow: false, nocache: true },
};

export default function AtelierViewportPreviewPage() {
  return <AtelierViewportPreviewWorkspace />;
}
