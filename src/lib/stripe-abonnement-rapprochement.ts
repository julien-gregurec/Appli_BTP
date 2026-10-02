// P5 (train V9, Stripe readiness) — rapprochement quotidien des abonnements Stripe.
//
// V8 reprend les réservations d'événements orphelines (migration 808) mais ne relit
// jamais un abonnement dont AUCUN événement n'est arrivé (webhook perdu, endpoint
// indisponible au-delà des re-livraisons Stripe). Ce rapprochement, greffé sur
// /api/cron/abonnements (derrière FEATURE_CRONS_ENABLED), relit chaque subscription
// courante chez Stripe (source de vérité) et l'applique par la RPC ordonnée
// `synchroniser_abonnement_stripe_ordonne_service`, comme un webhook :
//   * filigrane d'accès : la relecture porte l'horloge du rapprochement ; un
//     événement Stripe plus ancien livré ensuite ne peut plus inverser le statut ;
//   * idempotent : un identifiant par subscription et par jour UTC
//     (`rapprochement:<subscription>:<AAAA-MM-JJ>`), un rejeu le même jour est
//     « deja_traite » ;
//   * jamais de réactivation d'un abonnement terminal : les entreprises « annule »
//     ne sont pas relues (seul un nouveau Checkout rend les droits, 801) ;
//   * corrections journalisées dans `stripe_evenements_ordre` (type
//     `rapprochement.subscription`, états avant / après) ;
//   * lecture seule côté Stripe (aucune écriture, aucune facture) ; état
//     commercial par application (804) traité par la même RPC que les webhooks.
import { createAdminClient } from "@/lib/supabase/admin";
import { rapprocherAbonnementLectureSeule, type EvenementOrdonne } from "@/lib/stripe-abonnement-synchronisation";

type Admin = ReturnType<typeof createAdminClient>;

export const TYPE_EVENEMENT_RAPPROCHEMENT = "rapprochement.subscription";
export const STATUTS_RAPPROCHES = ["essai", "actif", "suspendu"] as const;

export function evenementRapprochement(subscriptionId: string, maintenant: Date): EvenementOrdonne {
  return {
    id: `rapprochement:${subscriptionId}:${maintenant.toISOString().slice(0, 10)}`,
    type: TYPE_EVENEMENT_RAPPROCHEMENT,
    created: Math.floor(maintenant.getTime() / 1000),
    objetType: "subscription",
    objetId: subscriptionId,
  };
}

export type ResultatRapprochement = {
  entrepriseId: string;
  statutAvant: string | null;
  statut: string | null;
  corrige: boolean;
  raison?: string;
};

export async function rapprocherAbonnementsStripe(
  admin: Admin,
  maintenant: Date = new Date(),
  rapprocher: typeof rapprocherAbonnementLectureSeule = rapprocherAbonnementLectureSeule,
): Promise<{ traitees: number; corrigees: number; resultats: ResultatRapprochement[] } | { erreur: string }> {
  const { data, error } = await admin
    .from("entreprises")
    .select("id,stripe_subscription_id,abonnement_statut")
    .not("stripe_subscription_id", "is", null)
    .in("abonnement_statut", [...STATUTS_RAPPROCHES]);
  if (error) return { erreur: "Lecture des abonnements impossible" };
  const resultats: ResultatRapprochement[] = [];
  for (const ligne of (data ?? []) as Array<{ id: string; stripe_subscription_id: string; abonnement_statut: string | null }>) {
    try {
      const statut = await rapprocher(admin, ligne.id, ligne.stripe_subscription_id, evenementRapprochement(ligne.stripe_subscription_id, maintenant));
      resultats.push({ entrepriseId: ligne.id, statutAvant: ligne.abonnement_statut, statut, corrige: statut !== null && statut !== ligne.abonnement_statut });
    } catch (erreur) {
      resultats.push({
        entrepriseId: ligne.id, statutAvant: ligne.abonnement_statut, statut: null, corrige: false,
        raison: erreur instanceof Error ? erreur.message : "Erreur",
      });
    }
  }
  return { traitees: resultats.length, corrigees: resultats.filter((r) => r.corrige).length, resultats };
}
