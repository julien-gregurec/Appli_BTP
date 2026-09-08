import type { Metadata } from "next";
import Link from "next/link";
import { Marque } from "@/components/Marque";

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

export const metadata: Metadata = { title: "Réserves non activé" };

export default function PageAbonnementRequis() {
  return (
    <div className="page-publique">
      <div className="carte-auth">
        <Marque />
        <h1>Réserves n’est pas activé</h1>
        <p className="sous-titre">
          ELSATIA Réserves n’est pas encore ouvert pour votre organisation.
        </p>
        <p className="mention">
          Si vous intervenez sur le chantier d’un client, c’est lui qui vous invite depuis
          son espace : vous recevez alors un accès intervenant gratuit, limité aux réserves
          qui vous sont attribuées.
        </p>
        <div className="actions">
          <Link className="bouton secondaire" href="/login">Retour à la connexion</Link>
        </div>
      </div>
    </div>
  );
}
