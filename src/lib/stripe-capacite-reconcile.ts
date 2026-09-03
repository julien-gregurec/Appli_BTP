import { createAdminClient } from "@/lib/supabase/admin";
import {
  allowlistPrixBase,
  allowlistPrixOptionIA,
  recupererAbonnementStripe,
  requeteStripe,
  type StripeSubscription,
} from "@/lib/stripe-abonnement";
import {
  allowlistPrixCapacite,
  classifierItemsAbonnement,
  construireIdempotencyKey,
  evenementStripeEstApplicable,
  itemsDeSubscription,
  payloadSwapPrixCapacite,
  prixCapacitePersonnePour,
  resoudrePlanPeriodicite,
  validerQuantiteCapacite,
} from "@/lib/stripe-capacite-personnes";

/**
 * ELSATIA-CAPACITY-STRIPE-R2-B — réconciliation DB → Stripe de la capacité
 * personnes, exécutée SANS session (webhook `customer.subscription.*`, cron).
 *
 * Règles :
 *  - autorité métier = DB ELSATIA (`entreprises.capacite_personnes_supplementaire`) ;
 *  - jamais `items.data[0]` : le classifieur identifie chaque item par allowlist
 *    de Price IDs résolue serveur ;
 *  - classification non fiable (2 items capacité, Price inconnu, quantité invalide)
 *    → FAIL-CLOSED, aucune mutation ;
 *  - toute mutation Stripe est suivie d'une RE-LECTURE Stripe : un HTTP 200 seul
 *    ne vaut pas preuve ; la DB n'est écrite qu'après observation cohérente ;
 *  - échec DB après Stripe → opération `needs_reconcile` (le cron converge) ;
 *  - échec Stripe → `failed`, aucune capacité accordée ;
 *  - baisse → planifiée (effet fin de période) ; hausse → immédiate.
 *
 * Stripe TEST uniquement. Aucun objet Live.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export type RequeteStripeMinimal = (
  chemin: string,
  options?: { methode?: "GET" | "POST" | "DELETE"; corps?: URLSearchParams; idempotence?: string },
) => Promise<unknown>;

export type DepsReconcileCapacite = {
  admin: AdminClient;
  recupererAbonnement: (subscriptionId: string) => Promise<StripeSubscription>;
  requete: RequeteStripeMinimal;
  env: Record<string, string | undefined>;
};

/** Résout les dépendances : celles fournies (tests) priment, le reste est réel (lazy). */
function resoudreDeps(partiel?: Partial<DepsReconcileCapacite>): DepsReconcileCapacite {
  return {
    admin: partiel?.admin ?? createAdminClient(),
    recupererAbonnement: partiel?.recupererAbonnement ?? recupererAbonnementStripe,
    requete: partiel?.requete ?? requeteStripe,
    env: partiel?.env ?? process.env,
  };
}

export type ActionCapacite = "aucune" | "creation" | "mise_a_jour" | "swap_prix" | "suppression";

export type ResultatReconcileCapacite =
  | {
      synchronise: false;
      raison:
        | "abonnement_absent"
        | "plan_invalide"
        | "prix_capacite_absent"
        | "classification_non_fiable"
        | "evenement_perime"
        | "stripe_erreur"
        | "db_needs_reconcile";
      anomalies?: string[];
      detail?: string;
    }
  | {
      synchronise: true;
      action: ActionCapacite;
      quantiteAvant: number;
      quantiteApres: number;
      operationId: string | null;
      stripeItemId: string | null;
    };

type LigneEntreprise = {
  stripe_subscription_id: string | null;
  abonnement_offre: string | null;
  abonnement_periodicite: string | null;
  capacite_personnes_supplementaire: number | null;
  capacite_personnes_supplementaire_planifiee: number | null;
  capacite_personnes_planifiee_effet_at: string | null;
  capacite_stripe_sync_evenement_at: string | null;
};

function resumeStripe(sub: StripeSubscription, itemCapacite: { id: string; quantity?: number; price?: { id?: string } } | null) {
  return {
    subscription: sub.id,
    status: sub.status,
    item: itemCapacite?.id ?? null,
    quantity: itemCapacite?.quantity ?? null,
    price: itemCapacite?.price?.id ?? null,
  };
}

/**
 * Réconcilie la capacité personnes d'une entreprise entre la DB (autorité) et sa
 * subscription Stripe. Idempotent.
 */
export async function reconcilierCapacitePersonnesStripe(params: {
  entrepriseId: string;
  /** Horodatage `event.created` (epoch secondes) quand appelé depuis un webhook. */
  evenementCreatedAt?: number | null;
  source?: "webhook" | "cron" | "systeme";
  deps?: Partial<DepsReconcileCapacite>;
}): Promise<ResultatReconcileCapacite> {
  const deps = resoudreDeps(params.deps);
  const source = params.source ?? "webhook";
  const { admin } = deps;

  const { data: entreprise } = await admin
    .from("entreprises")
    .select(
      "stripe_subscription_id,abonnement_offre,abonnement_periodicite,capacite_personnes_supplementaire,capacite_personnes_supplementaire_planifiee,capacite_personnes_planifiee_effet_at,capacite_stripe_sync_evenement_at",
    )
    .eq("id", params.entrepriseId)
    .maybeSingle();
  const ent = entreprise as LigneEntreprise | null;

  if (!ent?.stripe_subscription_id) return { synchronise: false, raison: "abonnement_absent" };

  const pp = resoudrePlanPeriodicite(ent.abonnement_offre, ent.abonnement_periodicite);
  if (!pp) return { synchronise: false, raison: "plan_invalide" };

  // Garde out-of-order : un événement plus ancien que le dernier appliqué est ignoré.
  if (params.evenementCreatedAt != null) {
    const dernier = ent.capacite_stripe_sync_evenement_at
      ? Math.floor(new Date(ent.capacite_stripe_sync_evenement_at).getTime() / 1000)
      : null;
    if (!evenementStripeEstApplicable({ evenementCreatedAt: params.evenementCreatedAt, dernierEvenementTraiteAt: dernier })) {
      return { synchronise: false, raison: "evenement_perime" };
    }
  }

  const cible = validerQuantiteCapacite(ent.capacite_personnes_supplementaire ?? 0);
  const prixCapaciteAttendu = prixCapacitePersonnePour(pp.plan, pp.periodicite, deps.env);
  if (!prixCapaciteAttendu && cible > 0) {
    return { synchronise: false, raison: "prix_capacite_absent" };
  }

  const sub = await deps.recupererAbonnement(ent.stripe_subscription_id);
  const classification = classifierItemsAbonnement(itemsDeSubscription(sub), {
    prixBaseAttendus: allowlistPrixBase(deps.env),
    prixCapaciteAttendus: allowlistPrixCapacite(deps.env),
    prixAutresConnus: allowlistPrixOptionIA(deps.env),
  });
  // FAIL-CLOSED : classification non fiable (deux items capacité, quantité
  // invalide) OU présence d'items dont le Price n'est pas dans une allowlist
  // serveur. On ne mute jamais une subscription qui porte une ligne inexpliquée.
  if (!classification.fiable || classification.inconnus.length > 0) {
    return { synchronise: false, raison: "classification_non_fiable", anomalies: classification.anomalies };
  }

  const itemCapacite = classification.capacite;
  const quantiteStripe = itemCapacite?.quantity ?? 0;
  const prixActuel = itemCapacite?.price?.id ?? null;

  // ── Décision ────────────────────────────────────────────────────────────────
  let action: ActionCapacite = "aucune";
  let typeOperation: "hausse" | "baisse" | "swap_prix" | "synchronisation" | "suppression" = "synchronisation";
  if (!itemCapacite && cible > 0) {
    action = "creation";
    typeOperation = "hausse";
  } else if (itemCapacite && cible === 0) {
    action = "suppression";
    typeOperation = "suppression";
  } else if (itemCapacite && prixCapaciteAttendu && prixActuel !== prixCapaciteAttendu) {
    action = "swap_prix";
    typeOperation = "swap_prix";
  } else if (itemCapacite && quantiteStripe !== cible) {
    action = "mise_a_jour";
    typeOperation = cible > quantiteStripe ? "hausse" : "baisse";
  }

  if (action === "aucune") {
    if (params.evenementCreatedAt != null) {
      await admin
        .from("entreprises")
        .update({ capacite_stripe_sync_evenement_at: new Date(params.evenementCreatedAt * 1000).toISOString() })
        .eq("id", params.entrepriseId);
    }
    return { synchronise: true, action, quantiteAvant: quantiteStripe, quantiteApres: quantiteStripe, operationId: null, stripeItemId: itemCapacite?.id ?? null };
  }

  const idempotencyKey = construireIdempotencyKey({
    entrepriseId: params.entrepriseId,
    type: typeOperation === "synchronisation" ? "synchronisation" : typeOperation,
    cible,
    subscriptionId: ent.stripe_subscription_id,
    periodeReference: sub.current_period_start ?? null,
  });

  // ── Baisse : effet fin de période (aucune mutation Stripe immédiate ici) ────
  const estBaisse = typeOperation === "baisse" && cible < quantiteStripe;
  if (estBaisse) {
    const finPeriode = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    const op = await deps.admin.rpc("synchroniser_capacite_stripe_service", {
      p_entreprise_id: params.entrepriseId,
      p_type_operation: "baisse",
      p_ancienne_capacite: quantiteStripe,
      p_nouvelle_capacite: cible,
      p_plan_code: pp.plan,
      p_periodicite: pp.periodicite,
      p_price_id: prixCapaciteAttendu,
      p_stripe_subscription_id: ent.stripe_subscription_id,
      p_stripe_item_id: itemCapacite?.id ?? null,
      p_idempotency_key: idempotencyKey,
      p_statut_final: "completed",
      p_stripe_etat_observe: resumeStripe(sub, itemCapacite),
      p_date_effet_souhaitee: finPeriode,
      p_evenement_at: params.evenementCreatedAt != null ? new Date(params.evenementCreatedAt * 1000).toISOString() : null,
      p_source: source,
    });
    if (op.error) return { synchronise: false, raison: "db_needs_reconcile", detail: op.error.message };
    return { synchronise: true, action, quantiteAvant: quantiteStripe, quantiteApres: cible, operationId: (op.data as string) ?? null, stripeItemId: itemCapacite?.id ?? null };
  }

  // ── Hausse / update / swap / suppression : mutation Stripe puis re-observation ──
  let stripeMutationOk = false;
  let erreurStripe: string | null = null;
  try {
    if (action === "creation") {
      await deps.requete("subscription_items", {
        corps: new URLSearchParams({
          subscription: ent.stripe_subscription_id,
          price: prixCapaciteAttendu!,
          quantity: String(cible),
          proration_behavior: "always_invoice",
        }),
        idempotence: `capacite-creation-${idempotencyKey}`,
      });
    } else if (action === "suppression") {
      await deps.requete(`subscription_items/${encodeURIComponent(itemCapacite!.id)}`, {
        methode: "DELETE",
        corps: new URLSearchParams({ proration_behavior: "create_prorations" }),
        idempotence: `capacite-suppression-${idempotencyKey}`,
      });
    } else if (action === "swap_prix") {
      const p = payloadSwapPrixCapacite({ itemId: itemCapacite!.id, nouveauPrixId: prixCapaciteAttendu!, quantite: cible, proration: "create_prorations" });
      await deps.requete(p.path, { corps: new URLSearchParams(p.body), idempotence: `capacite-swap-${idempotencyKey}` });
    } else {
      // mise_a_jour (hausse de quantité)
      await deps.requete(`subscription_items/${encodeURIComponent(itemCapacite!.id)}`, {
        corps: new URLSearchParams({ quantity: String(cible), proration_behavior: "always_invoice" }),
        idempotence: `capacite-maj-${idempotencyKey}`,
      });
    }
    stripeMutationOk = true;
  } catch (e) {
    erreurStripe = e instanceof Error ? e.message : "Stripe a refusé l’opération";
  }

  if (!stripeMutationOk) {
    await deps.admin.rpc("synchroniser_capacite_stripe_service", {
      p_entreprise_id: params.entrepriseId,
      p_type_operation: typeOperation,
      p_ancienne_capacite: quantiteStripe,
      p_nouvelle_capacite: cible,
      p_plan_code: pp.plan,
      p_periodicite: pp.periodicite,
      p_price_id: prixCapaciteAttendu,
      p_stripe_subscription_id: ent.stripe_subscription_id,
      p_stripe_item_id: itemCapacite?.id ?? null,
      p_idempotency_key: idempotencyKey,
      p_statut_final: "failed",
      p_erreur_courte: erreurStripe,
      p_source: source,
    });
    return { synchronise: false, raison: "stripe_erreur", detail: erreurStripe ?? undefined };
  }

  // Re-observation : la mutation seule ne prouve rien.
  const subApres = await deps.recupererAbonnement(ent.stripe_subscription_id);
  const classApres = classifierItemsAbonnement(itemsDeSubscription(subApres), {
    prixBaseAttendus: allowlistPrixBase(deps.env),
    prixCapaciteAttendus: allowlistPrixCapacite(deps.env),
    prixAutresConnus: allowlistPrixOptionIA(deps.env),
  });
  const itemApres = classApres.capacite;
  const coherent =
    action === "suppression"
      ? classApres.fiable && !itemApres
      : classApres.fiable &&
        !!itemApres &&
        (itemApres.quantity ?? -1) === cible &&
        (!prixCapaciteAttendu || itemApres.price?.id === prixCapaciteAttendu);

  const statutFinal = coherent ? "completed" : "needs_reconcile";
  const rpc = await deps.admin.rpc("synchroniser_capacite_stripe_service", {
    p_entreprise_id: params.entrepriseId,
    p_type_operation: typeOperation,
    p_ancienne_capacite: quantiteStripe,
    p_nouvelle_capacite: cible,
    p_plan_code: pp.plan,
    p_periodicite: pp.periodicite,
    p_price_id: prixCapaciteAttendu,
    p_stripe_subscription_id: ent.stripe_subscription_id,
    p_stripe_item_id: itemApres?.id ?? itemCapacite?.id ?? null,
    p_idempotency_key: idempotencyKey,
    p_statut_final: statutFinal,
    p_stripe_etat_observe: resumeStripe(subApres, itemApres),
    p_erreur_courte: coherent ? null : "observation Stripe incohérente après mutation",
    p_evenement_at: params.evenementCreatedAt != null ? new Date(params.evenementCreatedAt * 1000).toISOString() : null,
    p_source: source,
  });

  if (rpc.error || !coherent) {
    return { synchronise: false, raison: "db_needs_reconcile", detail: rpc.error?.message };
  }
  return {
    synchronise: true,
    action,
    quantiteAvant: quantiteStripe,
    quantiteApres: cible,
    operationId: (rpc.data as string) ?? null,
    stripeItemId: itemApres?.id ?? null,
  };
}

/**
 * Cron : reprend les opérations `needs_reconcile` et applique les baisses
 * `scheduled` arrivées à échéance. Idempotent, ne retouche jamais une opération
 * terminale.
 */
export async function reprendreOperationsCapaciteStripe(params?: {
  limite?: number;
  deps?: Partial<DepsReconcileCapacite>;
}): Promise<{ traitees: number; details: Array<{ entrepriseId: string; type: string; resultat: string }> }> {
  const deps = resoudreDeps(params?.deps);
  const { data, error } = await deps.admin.rpc("capacite_stripe_operations_a_reprendre", {
    p_limite: params?.limite ?? 50,
  });
  if (error || !Array.isArray(data)) return { traitees: 0, details: [] };

  const details: Array<{ entrepriseId: string; type: string; resultat: string }> = [];
  for (const ligne of data as Array<{ entreprise_id: string; type_operation: string; statut: string }>) {
    if (ligne.statut === "scheduled") {
      const r = await deps.admin.rpc("appliquer_baisse_capacite_planifiee_service", { p_entreprise_id: ligne.entreprise_id });
      details.push({ entrepriseId: ligne.entreprise_id, type: "baisse_planifiee", resultat: r.error ? "erreur" : r.data ? "appliquee" : "pas_a_echeance" });
    } else {
      const r = await reconcilierCapacitePersonnesStripe({ entrepriseId: ligne.entreprise_id, source: "cron", deps: params?.deps });
      details.push({ entrepriseId: ligne.entreprise_id, type: "needs_reconcile", resultat: r.synchronise ? `ok:${r.action}` : `ko:${r.raison}` });
    }
  }
  return { traitees: details.length, details };
}
