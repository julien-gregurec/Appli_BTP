import type { Metadata } from "next";
import { ReleveFicheWorkspace } from "@/components/releve/ReleveFicheWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Fiche relevé",
  description: "Chantiers et versions d'un relevé.",
  path: "/releves/fiche",
  index: false,
});

// Route statique (export natif Capacitor) : le relevé arrive en paramètre `?id=`, lu côté client.
export default function FicheRelevePage() { return <ReleveFicheWorkspace />; }
