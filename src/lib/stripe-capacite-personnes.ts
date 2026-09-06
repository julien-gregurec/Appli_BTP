import { createAdminClient } from "@/lib/supabase/admin";
import { acquerirVerrouRemise, libererVerrouRemise } from "@/lib/stripe-discount-server";
import {
  estOffreAbonnement,
  estPeriodiciteAbonnement,
  identifierItemsCapacitePersonnes,
  prixCapacitePersonneStripePour,
  recupererAbonnementStripe,
  requeteStripe,
  type StripeSubscription,
} from "@/lib/stripe-abonnement";

type Admin = ReturnType<typeof createAdminClient>;

export const TARIF_CAPACITE_PERSONNE_MENSUEL_HT = {
  mini: 15,
  pro: 12,
  business: 9,
  entreprise: 9,
} as const;

function exigerModeStripeTest() {
  if (process.env.STRIPE_WEBHOOK_EXPECTED_MODE !== "test" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("La capacité personnes R2 est limitée à Stripe TEST");
  }
}

function quantiteObservee(abonnement: StripeSubscription, prixAttendu: string) {
  const items = identifierItemsCapacitePersonnes(abonnement);
  if (items.length > 1) throw new Error("Lignes de capacité Stripe dupliquées");
  const item = items[0] ?? null;
  if (item && item.price?.id !== prixAttendu) throw new Error("Price de capacité incohérent avec le forfait");
  const quantite = item ? Number(item.quantity ?? 0) : 0;
  if (!Number.isInteger(quantite) || quantite < 0 || quantite > 100000) throw new Error("Quantité Stripe de capacité invalide");
  return { item, quantite };
}

export async function synchroniserCapacitePersonnesDepuisStripe(
  admin: Admin,
  entrepriseId: string,
  abonnement: StripeSubscription,
  referenceEvenement: string,
) {
  const offre = String(abonnement.metadata?.offre ?? "");
  const periodicite = String(abonnement.metadata?.periodicite ?? "");
  if (!estOffreAbonnement(offre) || !estPeriodiciteAbonnement(periodicite)) {
    throw new Error("Métadonnées de forfait Stripe invalides");
  }
  const prixAttendu = prixCapacitePersonneStripePour(offre, periodicite);
  if (!prixAttendu) throw new Error("Price de capacité absent");
  const observation = quantiteObservee(abonnement, prixAttendu);
  const { error } = await admin.rpc("plateforme_synchroniser_capacite_personnes_stripe_serveur", {
    p_entreprise_id: entrepriseId,
    p_stripe_subscription_id: abonnement.id,
    p_stripe_item_id: observation.item?.id ?? null,
    p_stripe_price_id: observation.item?.price?.id ?? null,
    p_quantite: observation.quantite,
    p_reference_evenement: referenceEvenement,
    p_subscription_status: abonnement.status,
  });
  if (error) throw new Error("Synchronisation de capacité refusée");
  return observation;
}

async function appliquerQuantiteStripe(
  abonnement: StripeSubscription,
  prixAttendu: string,
  quantite: number,
  operationId: string,
  immediat: boolean,
) {
  const observation = quantiteObservee(abonnement, prixAttendu);
  const corps = new URLSearchParams({
    proration_behavior: immediat ? "always_invoice" : "none",
    payment_behavior: immediat ? "pending_if_incomplete" : "allow_incomplete",
  });
  if (observation.item) {
    corps.set("items[0][id]", observation.item.id);
    if (quantite === 0) corps.set("items[0][deleted]", "true");
    else {
      corps.set("items[0][price]", prixAttendu);
      corps.set("items[0][quantity]", String(quantite));
    }
  } else if (quantite > 0) {
    corps.set("items[0][price]", prixAttendu);
    corps.set("items[0][quantity]", String(quantite));
  } else return abonnement;
  return requeteStripe<StripeSubscription>(`subscriptions/${encodeURIComponent(abonnement.id)}`, {
    corps,
    idempotence: `capacite-personnes-${operationId}`,
  });
}

export async function modifierCapacitePersonnesStripe(params: {
  entrepriseId: string;
  nouvelleQuantite: number;
  acteurId: string;
  source?: "utilisateur" | "cron";
}) {
  exigerModeStripeTest();
  if (!Number.isInteger(params.nouvelleQuantite) || params.nouvelleQuantite < 0 || params.nouvelleQuantite > 100000) {
    throw new Error("Quantité de capacité invalide");
  }
  const admin = createAdminClient();
  const { data: entreprise, error } = await admin.from("entreprises")
    .select("stripe_subscription_id,abonnement_offre,abonnement_periodicite,capacite_personnes_supplementaire,abonnement_echeance")
    .eq("id", params.entrepriseId).maybeSingle();
  if (error || !entreprise?.stripe_subscription_id) throw new Error("Abonnement Stripe introuvable");
  const offre = String(entreprise.abonnement_offre ?? "");
  const periodicite = String(entreprise.abonnement_periodicite ?? "");
  if (!estOffreAbonnement(offre) || periodicite !== "mensuel") {
    throw new Error("La capacité supplémentaire annuelle attend encore une décision commerciale");
  }
  const prix = prixCapacitePersonneStripePour(offre, "mensuel");
  if (!prix) throw new Error("Price mensuel de capacité non configuré");
  const ancienneQuantite = Number(entreprise.capacite_personnes_supplementaire ?? 0);
  if (ancienneQuantite === params.nouvelleQuantite) return { statut: "sans_changement" as const };
  const baisse = params.nouvelleQuantite < ancienneQuantite;
  const operationId = crypto.randomUUID();
  const dateEffet = baisse ? entreprise.abonnement_echeance : null;
  if (baisse && !dateEffet) throw new Error("Échéance de l’abonnement introuvable");
  const { data: operation, error: operationError } = await admin.rpc("plateforme_commencer_operation_capacite_stripe_serveur", {
    p_operation_id: operationId,
    p_entreprise_id: params.entrepriseId,
    p_nouvelle_quantite: params.nouvelleQuantite,
    p_stripe_subscription_id: entreprise.stripe_subscription_id,
    p_stripe_price_id: prix,
    p_source: params.source ?? "utilisateur",
    p_acteur_id: params.acteurId,
    p_effective_at: dateEffet,
  });
  if (operationError || !operation) throw new Error("Une modification de capacité est déjà en cours");
  if (baisse) return { statut: "planifiee" as const, dateEffet };

  let verrou: string | null = null;
  try {
    verrou = await acquerirVerrouRemise(admin, entreprise.stripe_subscription_id, `capacity:${operationId}`);
    const abonnement = await recupererAbonnementStripe(entreprise.stripe_subscription_id);
    await appliquerQuantiteStripe(abonnement, prix, params.nouvelleQuantite, operationId, true);
    const confirme = await recupererAbonnementStripe(entreprise.stripe_subscription_id);
    const observation = quantiteObservee(confirme, prix);
    if (observation.quantite !== params.nouvelleQuantite) {
      await admin.rpc("plateforme_transition_operation_capacite_stripe_serveur", { p_operation_id: operationId, p_statut: "paiement_en_attente", p_stripe_item_id: observation.item?.id ?? null });
      return { statut: "paiement_en_attente" as const };
    }
    await synchroniserCapacitePersonnesDepuisStripe(admin, params.entrepriseId, confirme, `operation:${operationId}`);
    return { statut: "appliquee" as const };
  } catch (erreur) {
    await admin.rpc("plateforme_transition_operation_capacite_stripe_serveur", { p_operation_id: operationId, p_statut: "reconciliation_requise", p_stripe_item_id: null });
    throw erreur;
  } finally {
    if (verrou) await libererVerrouRemise(admin, entreprise.stripe_subscription_id, verrou);
  }
}

export async function traiterBaissesCapacitePersonnesEchues(admin: Admin = createAdminClient()) {
  if (process.env.STRIPE_WEBHOOK_EXPECTED_MODE !== "test" || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) return [];
  const { data, error } = await admin.rpc("plateforme_lister_operations_capacite_stripe_echues_serveur");
  if (error) throw new Error("Lecture des baisses de capacité impossible");
  const resultats: Array<{ id: string; ok: boolean }> = [];
  for (const operation of (data ?? []) as Array<{ id: string; entreprise_id: string; stripe_subscription_id: string; nouvelle_quantite: number; stripe_price_id: string }>) {
    let verrou: string | null = null;
    try {
      verrou = await acquerirVerrouRemise(admin, operation.stripe_subscription_id, `capacity-due:${operation.id}`);
      const abonnement = await recupererAbonnementStripe(operation.stripe_subscription_id);
      await appliquerQuantiteStripe(abonnement, operation.stripe_price_id, operation.nouvelle_quantite, operation.id, false);
      const confirme = await recupererAbonnementStripe(operation.stripe_subscription_id);
      await synchroniserCapacitePersonnesDepuisStripe(admin, operation.entreprise_id, confirme, `operation:${operation.id}`);
      resultats.push({ id: operation.id, ok: true });
    } catch {
      await admin.rpc("plateforme_transition_operation_capacite_stripe_serveur", { p_operation_id: operation.id, p_statut: "reconciliation_requise", p_stripe_item_id: null });
      resultats.push({ id: operation.id, ok: false });
    } finally {
      if (verrou) await libererVerrouRemise(admin, operation.stripe_subscription_id, verrou);
    }
  }
  return resultats;
}
