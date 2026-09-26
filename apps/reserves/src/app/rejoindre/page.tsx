import type { Metadata } from "next";
import Link from "next/link";
import { Marque } from "@/components/Marque";
import { getContexteReserves } from "@/lib/contexte";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Invitations en attente" };

export default async function PageInvitations() {
  const contexte = await getContexteReserves();
  const supabase = await createClient();
  const { data } = await supabase.rpc("reserves_invitations_en_attente");
  const invitations = (data ?? []) as { intervenant_id: string; nom: string }[];

  return (
    <div className="page-publique">
      <div className="carte-auth">
        <Marque />
        <h1>Invitations en attente</h1>
        <p className="sous-titre">{contexte.entrepriseNom}</p>
        {invitations.length === 0 ? (
          <>
            <p className="mention">
              Aucune intervention ne vous attend. Si un maître d’ouvrage vous a nommé sur
              un chantier, il doit d’abord ouvrir l’accès à votre organisation.
            </p>
            <div className="actions">
              <Link className="bouton secondaire" href="/login">Retour</Link>
            </div>
          </>
        ) : (
          <ul className="liste">
            {invitations.map((i) => (
              <li key={i.intervenant_id}>
                <Link className="reserve" href={`/rejoindre/${i.intervenant_id}`}>
                  <span className="reserve-titre">{i.nom}</span>
                  <span className="reserve-meta"><span>Rejoindre cette intervention</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
