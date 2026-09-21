import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MOTIF_APPARTENANCE } from "@/lib/messages-refus";
import type { RoleApplicationColors } from "@elsatia/application-access";

export type ContexteColors = {
  userId: string;
  email: string | null;
  prenom: string | null;
  entrepriseId: string | null;
  entrepriseNom: string;
  estAdminPlateforme: boolean;
  roleColors: RoleApplicationColors | null;
};

type ContexteApplicationCourant = {
  utilisateur_id: string;
  prenom: string | null;
  entreprise_id: string | null;
  entreprise_nom: string;
  est_admin_plateforme: boolean;
};

export const ENTREPRISE_PAR_DEFAUT = "Votre organisation";

export const getContexteColors = cache(async (): Promise<ContexteColors> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("contexte_application_courant").maybeSingle();
  if (error) throw new Error("Contexte ELSATIA indisponible");
  const contexte = data as ContexteApplicationCourant | null;
  if (!contexte || contexte.utilisateur_id !== user.id) {
    redirect(`/acces-refuse?motif=${MOTIF_APPARTENANCE}`);
  }
  if (!contexte.entreprise_id && !contexte.est_admin_plateforme) redirect(`/acces-refuse?motif=${MOTIF_APPARTENANCE}`);

  return {
    userId: user.id,
    email: user.email ?? null,
    prenom: contexte.prenom,
    entrepriseId: contexte.entreprise_id,
    entrepriseNom: contexte.entreprise_nom || ENTREPRISE_PAR_DEFAUT,
    estAdminPlateforme: contexte.est_admin_plateforme === true,
    roleColors: null,
  };
});

export type ContexteRefus = {
  /** Une session Supabase valide est présente. */
  authentifie: boolean;
  /**
   * Raison sociale connue, ou `null` lorsque le contrat canonique ne rattache
   * la personne à aucune organisation exploitable.
   */
  entrepriseNom: string | null;
};

/**
 * Lecture de contexte **sans aucune redirection**.
 *
 * `getContexteColors` renvoie vers `/acces-refuse` dès que le contrat canonique
 * ne rattache pas la personne à une organisation. Les pages de refus ne peuvent
 * donc pas s'appuyer dessus : `/acces-refuse` qui appelle `getContexteColors`
 * se redirige vers lui-même indéfiniment pour exactement la population qu'il
 * est censé accueillir. Cette lecture-ci ne redirige jamais et constitue le
 * seul contexte admissible sur une page terminale. Volontairement hors `cache`
 * de React : une page terminale ne la lit qu'une fois.
 */
export async function lireContexteRefus(): Promise<ContexteRefus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { authentifie: false, entrepriseNom: null };

  const { data } = await supabase.rpc("contexte_application_courant").maybeSingle();
  const contexte = data as ContexteApplicationCourant | null;
  if (!contexte || contexte.utilisateur_id !== user.id) {
    return { authentifie: true, entrepriseNom: null };
  }
  return { authentifie: true, entrepriseNom: contexte.entreprise_nom || null };
}
