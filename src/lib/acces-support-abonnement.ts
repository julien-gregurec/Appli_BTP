import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Source unique : qui peut gérer l'abonnement (portail Stripe, réabonnement)
// d'une entreprise, y compris suspendue ou annulée. Utilisé à la fois par les
// actions (contrôle réel avant d'ouvrir le portail ou un Checkout) et par les
// pages /abonnement-suspendu et /abonnement (n'affichent les boutons qu'à ceux
// qui pourront réellement s'en servir) — GP-EXTERNAL-PILOT-CLOSURE-V1 :
// dupliquer cette logique aurait pu la faire diverger silencieusement.
//
// ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1 : la RLS (`est_membre_actif`) masque
// l'entreprise ET les permissions de poste dès que l'abonnement est suspendu ou
// annulé. La règle (membre actif avec `gerer_parametres`, ou accès support) est
// donc évaluée en base par `etat_reabonnement_entreprise`, qui n'expose aucun
// identifiant Stripe.

export type EtatReabonnementEntreprise = {
  abonnement_statut: string | null;
  subscription_rattachee: boolean;
  annulation_prevue_at: string | null;
  derniere_facture_statut: string | null;
  derniere_facture_url: string | null;
  peut_gerer: boolean;
};

export async function etatReabonnementEntreprise(
  supabase: SupabaseClient,
  entrepriseId: string,
): Promise<EtatReabonnementEntreprise | null> {
  const { data, error } = await supabase.rpc("etat_reabonnement_entreprise", { p_entreprise_id: entrepriseId }).maybeSingle();
  if (error || !data) return null;
  return data as EtatReabonnementEntreprise;
}

export async function peutGererAbonnementSuspendu(
  supabase: SupabaseClient,
  _utilisateurId: string,
  entrepriseId: string,
): Promise<boolean> {
  return (await etatReabonnementEntreprise(supabase, entrepriseId))?.peut_gerer === true;
}
