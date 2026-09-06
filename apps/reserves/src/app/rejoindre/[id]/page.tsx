import type { Metadata } from "next";
import Link from "next/link";
import { Marque } from "@/components/Marque";
import { getContexteReserves } from "@/lib/contexte";
import { createClient } from "@/lib/supabase/server";
import { rejoindreInterventionAction } from "@/app/actions";

export const metadata: Metadata = { title: "Rejoindre une intervention" };

/**
 * Cette page vit HORS de la coquille protégée, et c'est délibéré : au moment où
 * l'entreprise invitée arrive ici, son organisation a bien reçu l'accès applicatif mais
 * la personne n'a encore aucune habilitation. Exiger l'habilitation pour accéder à la
 * page qui l'accorde serait une impasse.
 */
export default async function PageRejoindre({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const contexte = await getContexteReserves();
  const erreur = typeof query.error === "string" ? query.error : null;

  // Lecture volontairement minimale : l'invitée ne doit rien apprendre du chantier avant
  // d'avoir rejoint. La RLS de `reserves_intervenants` ne lui montrera de toute façon
  // rien tant qu'elle n'est pas active.
  const supabase = await createClient();
  const { data } = await supabase
    .from("reserves_intervenants")
    .select("id, nom, statut")
    .eq("id", id)
    .maybeSingle();

  return (
    <div className="page-publique">
      <div className="carte-auth">
        <Marque />
        <h1>Rejoindre une intervention</h1>
        <p className="sous-titre">
          Vous êtes connecté comme <b>{contexte.entrepriseNom}</b>.
        </p>
        {erreur && <div className="message erreur">{erreur}</div>}

        <p className="mention">
          En rejoignant, votre entreprise obtient un accès Réserves gratuit, strictement
          limité aux réserves qui lui sont attribuées : ni les autres corps d’état, ni les
          données du maître d’ouvrage. Vous pourrez accepter ou refuser une responsabilité,
          joindre des photos, échanger et demander la levée.
        </p>

        {data?.statut === "active" ? (
          <>
            <div className="message">Cette intervention a déjà été rejointe.</div>
            <div className="actions">
              <Link className="bouton" href="/dashboard">Ouvrir Réserves</Link>
            </div>
          </>
        ) : (
          <form action={rejoindreInterventionAction}>
            <input type="hidden" name="intervenant_id" value={id} />
            <div className="actions">
              <button className="bouton" type="submit">Rejoindre l’intervention</button>
              <Link className="bouton secondaire" href="/login">Changer de compte</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
