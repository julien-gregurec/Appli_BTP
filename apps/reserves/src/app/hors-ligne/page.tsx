import type { Metadata } from "next";
import { CoquilleHorsLigne } from "@/components/offline/CoquilleHorsLigne";

export const metadata: Metadata = {
  title: "Hors ligne — ELSATIA Réserves",
  robots: { index: false, follow: false },
};

/**
 * Coquille de repli hors-ligne.
 *
 * Cette page est la SEULE de l'application à être entièrement statique et sans donnée :
 * c'est ce qui permet au service worker de la mettre en cache sans jamais y enfermer les
 * données d'une organisation. Tout ce qu'elle affiche est lu, au moment du rendu, dans la
 * base IndexedDB de l'identité connectée sur cet appareil.
 *
 * Conséquence directe et voulue : après une déconnexion, le pointeur d'identité est
 * effacé et cette page n'ouvre plus aucune base — elle n'a donc rien à montrer, quelle
 * que soit la session suivante.
 */
export default function PageHorsLigne() {
  return <CoquilleHorsLigne />;
}
