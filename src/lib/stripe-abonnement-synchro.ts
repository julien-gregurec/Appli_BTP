import { createAdminClient } from "@/lib/supabase/admin";
import {
  ligneOffreAbonnement,
  periodeAbonnement,
  recupererAbonnementStripe,
  statutAbonnementDepuisStripe,
  statutStripeTerminal,
  type OffreAbonnement,
  type PeriodiciteAbonnement,
  type StatutAbonnement,
  type StripeSubscription,
} from "@/lib/stripe-abonnement";

// Synchronisation des droits Gestion Pro depuis Stripe Billing.
//
// Principe : un webhook n'est qu'un signal. L'état appliqué est toujours celui de
// l'abonnement relu auprès de l'API Stripe au moment du traitement. Un événement
// dupliqué, rejoué, tardif ou reçu dans le désordre converge donc vers le même état
// final, et un ancien événement ne peut pas réactiver un abonnement résilié.

export type EtatLocalAbonnement = {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
};

export type DecisionSynchronisation =
  | {
      action: "appliquer";
      raison: "abonnement_courant" | "nouvel_abonnement";
      statut: StatutAbonnement;
      offre: OffreAbonnement | null;
      periodicite: PeriodiciteAbonnement | null;
      prixFactureHt: number | null;
      priceId: string | null;
      metadonneesPrix: Record<string, string>;
    }
  | { action: "ignorer"; raison: "ancien_abonnement" | "abonnement_concurrent" | "client_incoherent" }
  | { action: "erreur"; raison: "prix_non_reconnu" };

function identifiantClient(abonnement: StripeSubscription) {
  return typeof abonnement.customer === "string" ? abonnement.customer : abonnement.customer?.id ?? null;
}

export function deciderSynchronisation(params: {
  local: EtatLocalAbonnement;
  abonnement: StripeSubscription;
  // Statut Stripe actuel de l'abonnement enregistré localement, lorsqu'il diffère
  // de l'abonnement reçu (null si inconnu ou identique).
  statutStripeAbonnementCourant: string | null;
  environnement?: NodeJS.ProcessEnv;
}): DecisionSynchronisation {
  const { local, abonnement } = params;
  const client = identifiantClient(abonnement);
  if (local.stripe_customer_id && client && local.stripe_customer_id !== client) {
    return { action: "ignorer", raison: "client_incoherent" };
  }

  let raison: "abonnement_courant" | "nouvel_abonnement" = "abonnement_courant";
  if (local.stripe_subscription_id && local.stripe_subscription_id !== abonnement.id) {
    // Un ancien abonnement (résilié avant une réactivation) ne modifie plus rien.
    if (statutStripeTerminal(abonnement.status)) return { action: "ignorer", raison: "ancien_abonnement" };
    // Deux abonnements vivants pour la même entreprise : aucun basculement
    // automatique, traitement manuel (remboursement / résiliation du doublon).
    if (params.statutStripeAbonnementCourant === null || !statutStripeTerminal(params.statutStripeAbonnementCourant)) {
      return { action: "ignorer", raison: "abonnement_concurrent" };
    }
    raison = "nouvel_abonnement";
  }

  const statut = statutAbonnementDepuisStripe(abonnement.status);
  const ligne = ligneOffreAbonnement(abonnement, params.environnement);
  if (!ligne) {
    // Un abonnement terminé coupe les droits même si son Price n'est plus configuré.
    if (statut === "annule") {
      return { action: "appliquer", raison, statut, offre: null, periodicite: null, prixFactureHt: null, priceId: null, metadonneesPrix: {} };
    }
    return { action: "erreur", raison: "prix_non_reconnu" };
  }
  const montant = ligne.ligne.price?.unit_amount;
  return {
    action: "appliquer",
    raison,
    statut,
    offre: ligne.offre.offre,
    periodicite: ligne.offre.periodicite,
    prixFactureHt: typeof montant === "number" ? montant / 100 : null,
    priceId: ligne.ligne.price?.id ?? null,
    metadonneesPrix: ligne.ligne.price?.metadata ?? {},
  };
}

function dateDepuisUnix(valeur?: number | null) {
  return valeur ? new Date(valeur * 1000).toISOString().slice(0, 10) : null;
}

function instantDepuisUnix(valeur?: number | null) {
  return valeur ? new Date(valeur * 1000).toISOString() : null;
}

export async function entreprisePourAbonnement(abonnement: StripeSubscription) {
  const admin = createAdminClient();
  const depuisMetadonnees = abonnement.metadata?.entreprise_id;
  if (depuisMetadonnees) return depuisMetadonnees;
  const { data: parAbonnement } = await admin.from("entreprises").select("id").eq("stripe_subscription_id", abonnement.id).maybeSingle();
  if (parAbonnement?.id) return parAbonnement.id as string;
  const client = identifiantClient(abonnement);
  if (client) {
    const { data: parClient } = await admin.from("entreprises").select("id").eq("stripe_customer_id", client).maybeSingle();
    if (parClient?.id) return parClient.id as string;
  }
  return null;
}

export type ResultatSynchronisation = { statutResultant: string; decision: DecisionSynchronisation };

export async function synchroniserDepuisStripe(entrepriseId: string, abonnement: StripeSubscription): Promise<ResultatSynchronisation> {
  const admin = createAdminClient();
  const { data: local, error: lectureErreur } = await admin
    .from("entreprises")
    .select("id,stripe_subscription_id,stripe_customer_id,abonnement_offre,abonnement_periodicite,abonnement_statut")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (lectureErreur) throw new Error(lectureErreur.message);
  if (!local) throw new Error("Entreprise Stripe introuvable");

  let statutCourant: string | null = null;
  if (local.stripe_subscription_id && local.stripe_subscription_id !== abonnement.id && !statutStripeTerminal(abonnement.status)) {
    statutCourant = (await recupererAbonnementStripe(local.stripe_subscription_id)).status;
  }
  const decision = deciderSynchronisation({
    local: { stripe_subscription_id: local.stripe_subscription_id ?? null, stripe_customer_id: local.stripe_customer_id ?? null },
    abonnement,
    statutStripeAbonnementCourant: statutCourant,
  });
  if (decision.action === "erreur") {
    throw new Error(`Price Stripe non reconnu pour l’abonnement ${abonnement.id} : configurez STRIPE_PRICE_* ou les métadonnées liria_offre/liria_periodicite`);
  }
  if (decision.action === "ignorer") return { statutResultant: `ignore:${decision.raison}`, decision };

  const periode = periodeAbonnement(abonnement);
  const maintenant = new Date().toISOString();
  const miseAJour: Record<string, unknown> = {
    stripe_subscription_id: abonnement.id,
    stripe_customer_id: identifiantClient(abonnement),
    abonnement_statut: decision.statut,
    abonnement_echeance: dateDepuisUnix(periode.fin),
    abonnement_essai_fin: dateDepuisUnix(abonnement.trial_end),
    abonnement_annulation_prevue_at: abonnement.cancel_at_period_end || abonnement.cancel_at
      ? instantDepuisUnix(abonnement.cancel_at || periode.fin)
      : null,
    updated_at: maintenant,
  };
  if (decision.offre) miseAJour.abonnement_offre = decision.offre;
  if (decision.periodicite) miseAJour.abonnement_periodicite = decision.periodicite;
  const { error } = await admin.from("entreprises").update(miseAJour).eq("id", entrepriseId);
  if (error) throw new Error(error.message);

  if (decision.offre && decision.periodicite) {
    await synchroniserContrat(entrepriseId, abonnement, decision, {
      offre: local.abonnement_offre ?? null,
      periodicite: local.abonnement_periodicite ?? null,
    });
  } else {
    const { error: contratErreur } = await admin
      .from("abonnements_entreprises")
      .update({ statut: "annule", updated_at: maintenant })
      .eq("entreprise_id", entrepriseId);
    if (contratErreur) throw new Error(contratErreur.message);
  }
  return { statutResultant: decision.statut, decision };
}

async function synchroniserContrat(
  entrepriseId: string,
  abonnement: StripeSubscription,
  decision: Extract<DecisionSynchronisation, { action: "appliquer" }>,
  avant: { offre: string | null; periodicite: string | null },
) {
  const admin = createAdminClient();
  const offre = decision.offre!;
  const periodicite = decision.periodicite!;
  const [{ data: plan }, { data: contrat }] = await Promise.all([
    admin.from("plans_abonnement").select("id,version,prix_mensuel_ht,prix_annuel_ht").eq("code", offre).eq("actif", true).maybeSingle(),
    admin.from("abonnements_entreprises").select("id,code_offre,periodicite,prix_contractuel_ht,version_tarif").eq("entreprise_id", entrepriseId).maybeSingle(),
  ]);
  const prixGrille = plan ? Number(periodicite === "annuel" ? plan.prix_annuel_ht : plan.prix_mensuel_ht) : null;
  const memeContrat = contrat?.code_offre === offre && contrat?.periodicite === periodicite;
  // Le prix contractuel est celui du Price réellement facturé par Stripe. Un
  // ancien contrat reste donc à son prix historique tant que son Price ne change
  // pas : une nouvelle grille ne le réécrit jamais.
  const prixContractuel = decision.prixFactureHt
    ?? (memeContrat && contrat?.prix_contractuel_ht != null ? Number(contrat.prix_contractuel_ht) : prixGrille);
  const versionMetadonnees = Number(decision.metadonneesPrix.liria_version_tarif);
  const versionTarif = Number.isInteger(versionMetadonnees) && versionMetadonnees >= 0
    ? versionMetadonnees
    : prixGrille !== null && prixContractuel === prixGrille
      ? plan!.version
      : memeContrat ? contrat?.version_tarif ?? plan?.version ?? null : plan?.version ?? null;
  if (prixContractuel == null || versionTarif == null) return;

  const periode = periodeAbonnement(abonnement);
  const statutContrat = decision.statut;
  const { error } = await admin.from("abonnements_entreprises").upsert({
    entreprise_id: entrepriseId,
    plan_id: prixGrille !== null && prixContractuel === prixGrille ? plan!.id : null,
    code_offre: offre,
    version_tarif: versionTarif,
    periodicite,
    prix_contractuel_ht: prixContractuel,
    statut: statutContrat,
    debut_periode: instantDepuisUnix(periode.debut),
    fin_periode: instantDepuisUnix(periode.fin),
    stripe_subscription_id: abonnement.id,
    stripe_customer_id: identifiantClient(abonnement),
    updated_at: new Date().toISOString(),
  }, { onConflict: "entreprise_id" });
  if (error) throw new Error(error.message);

  const changement = avant.offre !== offre || avant.periodicite !== periodicite
    || (contrat?.prix_contractuel_ht != null && Number(contrat.prix_contractuel_ht) !== prixContractuel);
  if (changement) {
    // Trace d'audit : un upgrade/downgrade via le portail modifie les droits
    // uniquement à partir du Price facturé, et chaque bascule est historisée.
    const { error: historiqueErreur } = await admin.from("historique_tarification").insert({
      entreprise_id: entrepriseId,
      action: "synchronisation_stripe",
      ancien: { offre: avant.offre, periodicite: avant.periodicite, prix_contractuel_ht: contrat?.prix_contractuel_ht ?? null },
      nouveau: { offre, periodicite, prix_contractuel_ht: prixContractuel, price_id: decision.priceId, subscription_id: abonnement.id },
      motif: "Changement constaté sur l’abonnement Stripe",
    });
    if (historiqueErreur) throw new Error(historiqueErreur.message);
  }
}
