import type { Metadata } from "next";
import Link from "next/link";
import { Marque } from "@/components/Marque";
import { deconnexionAction } from "@/app/actions";

export const metadata: Metadata = { title: "Accès refusé" };

export default async function PageAccesRefuse({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const appartenance = params.motif === "appartenance";
  return (
    <div className="page-publique">
      <div className="carte-auth">
        <Marque />
        <h1>Accès non habilité</h1>
        <p className="sous-titre">
          {appartenance
            ? "Votre compte ELSATIA n’est rattaché à aucune organisation active."
            : "Votre organisation dispose de Réserves, mais votre compte n’y est pas encore habilité."}
        </p>
        <p className="mention">
          L’habilitation à une application ELSATIA est propre à cette application : elle ne
          se déduit ni d’un poste, ni d’un droit détenu dans Gestion Pro ou Colors.
          Demandez-la à l’administrateur de votre organisation.
        </p>
        <div className="actions">
          <Link className="bouton secondaire" href="/rejoindre">Voir mes invitations</Link>
          {/* /login renvoie une session valide vers /dashboard, donc ici : seule une déconnexion est une sortie. */}
          <form action={deconnexionAction}><button className="bouton secondaire" type="submit">Se déconnecter</button></form>
        </div>
      </div>
    </div>
  );
}
