import type { Metadata } from "next";
import { AtelierModelesWorkspace } from "@/components/AtelierModelesWorkspace";
import { pageMetadata } from "@/lib/seo";

/*
 * Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
 *
 * La bibliothèque serait pourtant la page la plus indexable de l'Atelier — c'est du contenu
 * public, sans donnée personnelle, qui décrit ce que l'outil sait tracer. Elle reste néanmoins
 * en `noindex` : l'ouverture publique de l'Atelier est une décision commerciale, pas une
 * conséquence technique de sa mise en ligne interne (WORKSHOP-UI-CANONICAL §3).
 */
export const metadata: Metadata = pageMetadata({
  title: "Modèles ELSATIA",
  description: "La bibliothèque de tracés paramétriques de l’Atelier : aperçus générés par le moteur géométrique.",
  path: "/atelier/modeles",
  index: false,
});

export default function AtelierModelesPage() {
  return <AtelierModelesWorkspace />;
}
