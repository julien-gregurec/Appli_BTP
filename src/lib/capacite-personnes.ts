import { createClient } from "@/lib/supabase/server";
import { CODE_ERREUR_CAPACITE_PERSONNES, estErreurCapacitePersonnes } from "@/lib/erreurs-utilisateur";
import { abonnementsPublicsOuverts } from "@/lib/commercialisation-abonnements";
import { resoudreUrlContactCommercial } from "@/lib/brand";
import { OFFRES_ABONNEMENT_COMMERCIALISEES } from "@/lib/stripe-abonnement";
import { messageLimiteAtteinte, type ContexteQuotaPersonnes } from "@/lib/quota-personnes-message";

/**
 * Plafond DUR de personnes actives (ELSATIA-ACTIVE-PERSON-CAPACITY-R1).
 *
 * La source de vérité est côté base : la fonction SQL
 * `compter_personnes_actives_entreprise` (contrat "personne active" = fiche
 * `employes` avec `statut <> 'sorti'` ET `compte_application_statut <> 'ferme'`)
 * et le garde-fou infranchissable est le trigger `trg_capacite_personnes_actives`
 * sur `public.employes`, qui couvre TOUS les chemins d'écriture (création
 * manuelle, self-service, import, réactivation, duplication, RPC, PostgREST).
 *
 * Ce module n'est qu'une aide applicative : pré-contrôle pour afficher un message
 * clair avant mutation, et lecture de l'état pour l'UI d'abonnement.
 */

export type EtatCapacitePersonnes = "ok" | "limite_atteinte" | "over_capacity";

export type CapacitePersonnes = {
  personnesActives: number;
  capaciteBase: number;
  capaciteSupplementaire: number;
  capaciteTotale: number;
  etat: EtatCapacitePersonnes;
  restant: number;
};

export { CODE_ERREUR_CAPACITE_PERSONNES };

/** Forme brute renvoyée par la RPC `capacite_personnes_entreprise`. */
export type LigneCapacitePersonnes = {
  personnes_actives?: number | null;
  capacite_base?: number | null;
  capacite_supplementaire?: number | null;
  capacite_totale?: number | null;
  etat?: string | null;
};

/** Lit l'état de capacité consolidé pour l'entreprise (ou null si indisponible). */
export async function lireCapacitePersonnes(entrepriseId: string): Promise<CapacitePersonnes | null> {
  const supabase = await createClient();
  const { data: brut, error } = await supabase
    .rpc("capacite_personnes_entreprise", { p_entreprise_id: entrepriseId })
    .maybeSingle();
  const data = brut as LigneCapacitePersonnes | null;
  if (error || !data) {
    if (error) console.error("lireCapacitePersonnes", error);
    return null;
  }
  const base = Number(data.capacite_base ?? 0);
  const sup = Number(data.capacite_supplementaire ?? 0);
  const totale = Number(data.capacite_totale ?? base + sup);
  const actives = Number(data.personnes_actives ?? 0);
  return {
    personnesActives: actives,
    capaciteBase: base,
    capaciteSupplementaire: sup,
    capaciteTotale: totale,
    etat: (data.etat as EtatCapacitePersonnes) ?? "ok",
    restant: Math.max(0, totale - actives),
  };
}

export type ResultatVerification = { ok: true } | { ok: false; message: string };

/**
 * Contexte commercial réel de l'entreprise, pour ne jamais proposer une action
 * impossible dans un message de quota (ELSATIA-GP-TRIAL-SOCLE-ACCESS-AND-
 * CAPACITY-FIX-V1 §7). Lecture seule, aucune écriture, aucune migration.
 */
export async function contexteQuotaPersonnes(entrepriseId: string): Promise<ContexteQuotaPersonnes> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprises")
    .select("abonnement_offre,abonnement_periodicite,stripe_subscription_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  const offre = data?.abonnement_offre ?? null;
  return {
    abonnementOffre: offre,
    abonnementsOuverts: abonnementsPublicsOuverts(),
    // Mêmes conditions que le bloc libre-service de /abonnement : sans
    // abonnement Stripe mensuel sur une offre commercialisée, « ajouter de la
    // capacité » n'existe pas.
    capaciteAutogerable:
      Boolean(data?.stripe_subscription_id)
      && (OFFRES_ABONNEMENT_COMMERCIALISEES as readonly string[]).includes(String(offre ?? ""))
      && data?.abonnement_periodicite === "mensuel",
    urlContact: resoudreUrlContactCommercial(),
  };
}

/**
 * Pré-contrôle applicatif : `p_delta` personnes actives supplémentaires
 * rentrent-elles dans la capacité ? En cas d'erreur non liée à la capacité, on
 * laisse passer (le trigger reste le garde-fou), on ne bloque pas sur un incident
 * transitoire.
 */
export async function verifierCapacitePersonnes(
  entrepriseId: string,
  delta = 1,
): Promise<ResultatVerification> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verifier_capacite_personnes", {
    p_entreprise_id: entrepriseId,
    p_delta: delta,
  });
  if (!error) return { ok: true };
  if (estErreurCapacitePersonnes(error)) {
    return { ok: false, message: messageLimiteAtteinte(await contexteQuotaPersonnes(entrepriseId)) };
  }
  console.error("verifierCapacitePersonnes", error);
  return { ok: true };
}
