import type { Metadata } from "next";
import { AtelierModelesWorkspace } from "@/components/AtelierModelesWorkspace";

export const metadata: Metadata = {
  title: "Modèles ELSATIA - ELSATIA Tools",
  description: "La bibliothèque de tracés paramétriques de l’Atelier : aperçus générés par le moteur géométrique.",
  // Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
  robots: { index: false, follow: false, nocache: true },
};

export default function AtelierModelesPage() {
  return <AtelierModelesWorkspace />;
}
