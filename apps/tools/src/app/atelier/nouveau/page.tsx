import type { Metadata } from "next";
import { NouveauTraceWorkspace } from "@/components/NouveauTraceWorkspace";

export const metadata: Metadata = {
  title: "Nouveau tracé - ELSATIA Tools",
  description: "Décrivez l’ouvrage : type, nom, dimensions de pièce et modèle de départ.",
  // Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
  robots: { index: false, follow: false, nocache: true },
};

export default function NouveauTracePage() {
  return <NouveauTraceWorkspace />;
}
