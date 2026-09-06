import type { Metadata } from "next";
import Link from "next/link";
import { Marque } from "@/components/Marque";

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
