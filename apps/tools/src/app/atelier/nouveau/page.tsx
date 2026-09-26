import type { Metadata } from "next";
import { NouveauTraceWorkspace } from "@/components/NouveauTraceWorkspace";
import { pageMetadata } from "@/lib/seo";

// Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
export const metadata: Metadata = pageMetadata({
  title: "Nouveau tracé",
  description: "Décrivez l’ouvrage : type, nom, dimensions de pièce et modèle de départ.",
  path: "/atelier/nouveau",
  index: false,
});

export default function NouveauTracePage() {
  return <NouveauTraceWorkspace />;
}
