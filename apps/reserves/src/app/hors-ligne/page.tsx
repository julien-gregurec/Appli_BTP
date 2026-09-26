import type { Metadata } from "next";
import { CoquilleHorsLigne } from "@/components/offline/CoquilleHorsLigne";

/**
 * Rendu dynamique EXIGÉ par la politique de contenu.
 *
 * La CSP posée par le proxy repose sur un nonce tiré à chaque requête, et `'strict-dynamic'`
 * fait ignorer `'self'` aux navigateurs qui la comprennent : SEULS les scripts porteurs du
 * nonce s'exécutent. Or une page pré-rendue à la construction est un fichier figé — Next
 * n'a aucun moment où y inscrire le nonce du jour, et ses quinze balises de script
 * repartiraient sans. Le navigateur les bloquerait toutes, en silence côté serveur : la
 * page s'afficherait, sans jamais s'animer.
 *
 * Le rendu dynamique remet la page dans le flux qui porte le nonce. Le coût est nul à
 * l'échelle de cet écran, et il retire au passage un en-tête `s-maxage` d'un an qui
 * autorisait n'importe quel cache partagé à figer cette page pendant douze mois.
 */
export const dynamic = "force-dynamic";

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
