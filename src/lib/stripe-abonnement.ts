import { createAdminClient } from "@/lib/supabase/admin";
import { calculerDepassementsAppareilsFacturables } from "@/lib/facturation-appareils";
import { DUREE_ESSAI_JOURS, offreParCle, REDUCTION_ANNUELLE } from "@/lib/plateforme";

export const OFFRES_ABONNEMENT = ["essentiel", "pro", "premium"] as const;
export const PERIODICITES_ABONNEMENT = ["mensuel", "annuel"] as const;
export type OffreAbonnement = (typeof OFFRES_ABONNEMENT)[number];
export type PeriodiciteAbonnement = (typeof PERIODICITES_ABONNEMENT)[number];
export type StatutAbonnement = "essai" | "actif" | "suspendu" | "annule";

export const OCTETS_PAR_GO = 1_000_000_000;
export const TARIF_STOCKAGE_SUPPLEMENTAIRE_HT_PAR_GO = 0.5;

export function calculerFacturationStockage(params: {
  octetsUtilises: number;
  quotaGo: number;
  periodicite: PeriodiciteAbonnement;
}) {
  const utilisationGo = Math.max(0, params.octetsUtilises) / OCTETS_PAR_GO;
  const depassementExact = Math.max(0, utilisationGo - Math.max(0, params.quotaGo));
  const depassementGo = Math.ceil(depassementExact * 100) / 100;
  const nombreMois = params.periodicite === "annuel" ? 12 : 1;
  const montantHt = Math.round(depassementGo * TARIF_STOCKAGE_SUPPLEMENTAIRE_HT_PAR_GO * nombreMois * 100) / 100;
  return { utilisationGo, depassementGo, nombreMois, montantHt };
}

type StripeErreur = { error?: { message?: string } };
type StripeCustomer = { id: string };
type StripeSession = { id: string; url: string | null };
export type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  current_period_end?: number;
  trial_end?: number | null;
  cancel_at?: number | null;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ id: string; quantity?: number; price?: { id?: string } }> };
};

const VARIABLES_PRIX: Record<OffreAbonnement, Record<PeriodiciteAbonnement, string>> = {
  essentiel: {
    mensuel: "STRIPE_PRICE_ESSENTIEL_MENSUEL",
    annuel: "STRIPE_PRICE_ESSENTIEL_ANNUEL",
  },
  pro: {
    mensuel: "STRIPE_PRICE_PRO_MENSUEL",
    annuel: "STRIPE_PRICE_PRO_ANNUEL",
  },
  premium: {
    mensuel: "STRIPE_PRICE_PREMIUM_MENSUEL",
    annuel: "STRIPE_PRICE_PREMIUM_ANNUEL",
  },
};

const VARIABLES_PRIX_COMPTE_SUP: Record<OffreAbonnement, Record<PeriodiciteAbonnement, string>> = {
  essentiel: { mensuel: "STRIPE_PRICE_COMPTE_SUP_ESSENTIEL_MENSUEL", annuel: "STRIPE_PRICE_COMPTE_SUP_ESSENTIEL_ANNUEL" },
  pro: { mensuel: "STRIPE_PRICE_COMPTE_SUP_PRO_MENSUEL", annuel: "STRIPE_PRICE_COMPTE_SUP_PRO_ANNUEL" },
  premium: { mensuel: "STRIPE_PRICE_COMPTE_SUP_PREMIUM_MENSUEL", annuel: "STRIPE_PRICE_COMPTE_SUP_PREMIUM_ANNUEL" },
};

export const PALIERS_OPTION_IA = ["100", "300", "illimite"] as const;
export type PalierOptionIA = (typeof PALIERS_OPTION_IA)[number];
export function estPalierOptionIA(valeur: string): valeur is PalierOptionIA {
  return (PALIERS_OPTION_IA as readonly string[]).includes(valeur);
}

const VARIABLES_PRIX_OPTION_IA: Record<PalierOptionIA, Record<PeriodiciteAbonnement, string>> = {
  "100": { mensuel: "STRIPE_PRICE_OPTION_IA_100_MENSUEL", annuel: "STRIPE_PRICE_OPTION_IA_100_ANNUEL" },
  "300": { mensuel: "STRIPE_PRICE_OPTION_IA_300_MENSUEL", annuel: "STRIPE_PRICE_OPTION_IA_300_ANNUEL" },
  illimite: { mensuel: "STRIPE_PRICE_OPTION_IA_ILLIMITE_MENSUEL", annuel: "STRIPE_PRICE_OPTION_IA_ILLIMITE_ANNUEL" },
};

export function prixOptionIAStripePour(palier: PalierOptionIA, periodicite: PeriodiciteAbonnement, environnement: NodeJS.ProcessEnv = process.env) {
  return environnement[VARIABLES_PRIX_OPTION_IA[palier][periodicite]] || null;
}

export function estOffreAbonnement(valeur: string): valeur is OffreAbonnement {
  return OFFRES_ABONNEMENT.includes(valeur as OffreAbonnement);
}

export function estPeriodiciteAbonnement(valeur: string): valeur is PeriodiciteAbonnement {
  return PERIODICITES_ABONNEMENT.includes(valeur as PeriodiciteAbonnement);
}

export function prixStripePour(
  offre: OffreAbonnement,
  periodicite: PeriodiciteAbonnement,
  environnement: NodeJS.ProcessEnv = process.env,
) {
  return environnement[VARIABLES_PRIX[offre][periodicite]] || null;
}

export function variablesStripeBillingManquantes(environnement: NodeJS.ProcessEnv = process.env) {
  const variables = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_ABONNEMENT_SECRET",
    "NEXT_PUBLIC_APP_URL",
    ...Object.values(VARIABLES_PRIX).flatMap((prix) => Object.values(prix)),
  ];
  return variables.filter((nom) => !environnement[nom]);
}

export function stripeBillingEstConfigure(environnement: NodeJS.ProcessEnv = process.env) {
  return variablesStripeBillingManquantes(environnement).length === 0;
}

export function statutAbonnementDepuisStripe(statut: string): StatutAbonnement {
  if (statut === "trialing") return "essai";
  if (statut === "active") return "actif";
  if (["past_due", "unpaid", "incomplete", "paused"].includes(statut)) return "suspendu";
  return "annule";
}

function secretStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("La clé secrète Stripe Billing n’est pas configurée");
  return secret;
}

async function requeteStripe<T>(
  chemin: string,
  options: { methode?: "GET" | "POST" | "DELETE"; corps?: URLSearchParams; idempotence?: string } = {},
) {
  const methode = options.methode ?? "POST";
  const reponse = await fetch(`https://api.stripe.com/v1/${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${secretStripe()}`,
      ...(options.corps ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.idempotence ? { "Idempotency-Key": options.idempotence } : {}),
    },
    body: options.corps,
    cache: "no-store",
  });
  const donnees = (await reponse.json()) as T & StripeErreur;
  if (!reponse.ok) throw new Error(donnees.error?.message || "Stripe a refusé l’opération");
  return donnees;
}

export async function creerOuRecupererClientStripe(params: {
  entrepriseId: string;
  email: string;
}) {
  const admin = createAdminClient();
  const { data: entreprise, error } = await admin
    .from("entreprises")
    .select("id,nom,raison_sociale,adresse,code_postal,ville,stripe_customer_id")
    .eq("id", params.entrepriseId)
    .single();
  if (error || !entreprise) throw new Error("Entreprise introuvable");
  if (entreprise.stripe_customer_id) return entreprise.stripe_customer_id as string;

  const corps = new URLSearchParams({
    name: entreprise.raison_sociale || entreprise.nom,
    email: params.email,
    "metadata[entreprise_id]": entreprise.id,
  });
  if (entreprise.adresse) corps.set("address[line1]", entreprise.adresse);
  if (entreprise.code_postal) corps.set("address[postal_code]", entreprise.code_postal);
  if (entreprise.ville) corps.set("address[city]", entreprise.ville);
  corps.set("address[country]", "FR");

  const client = await requeteStripe<StripeCustomer>("customers", {
    corps,
    idempotence: `abonnement-client-${entreprise.id}`,
  });
  const { error: miseAJourErreur } = await admin
    .from("entreprises")
    .update({ stripe_customer_id: client.id, updated_at: new Date().toISOString() })
    .eq("id", entreprise.id)
    .is("stripe_customer_id", null);
  if (miseAJourErreur) throw new Error(miseAJourErreur.message);
  return client.id;
}

export async function creerSessionAbonnementStripe(params: {
  entrepriseId: string;
  customerId: string;
  offre: OffreAbonnement;
  periodicite: PeriodiciteAbonnement;
}) {
  const prix = prixStripePour(params.offre, params.periodicite);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!prix || !baseUrl) throw new Error("Les tarifs Stripe Billing ne sont pas encore configurés");
  const corps = new URLSearchParams({
    mode: "subscription",
    customer: params.customerId,
    payment_method_collection: "always",
    success_url: `${baseUrl}/paiement/abonnement/succes?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/paiement/abonnement/annule`,
    client_reference_id: params.entrepriseId,
    allow_promotion_codes: "true",
    "line_items[0][price]": prix,
    "line_items[0][quantity]": "1",
    "metadata[entreprise_id]": params.entrepriseId,
    "metadata[offre]": params.offre,
    "metadata[periodicite]": params.periodicite,
    "subscription_data[trial_period_days]": String(DUREE_ESSAI_JOURS),
    "subscription_data[metadata][entreprise_id]": params.entrepriseId,
    "subscription_data[metadata][offre]": params.offre,
    "subscription_data[metadata][periodicite]": params.periodicite,
  });
  if (process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true") {
    corps.set("automatic_tax[enabled]", "true");
  }
  return requeteStripe<StripeSession>("checkout/sessions", {
    corps,
    idempotence: `abonnement-checkout-${params.entrepriseId}-${params.offre}-${params.periodicite}`,
  });
}

export async function creerSessionPortailStripe(customerId: string, returnUrl: string) {
  return requeteStripe<StripeSession>("billing_portal/sessions", {
    corps: new URLSearchParams({ customer: customerId, return_url: returnUrl }),
    idempotence: `abonnement-portail-${customerId}-${Date.now()}`,
  });
}

export const DUREES_REMISE = ["once", "repeating", "forever"] as const;
export type DureeRemise = (typeof DUREES_REMISE)[number];
export const TYPES_REMISE = ["montant", "pourcentage"] as const;
export type TypeRemise = (typeof TYPES_REMISE)[number];

type StripeCoupon = { id: string; name?: string | null };

// Geste commercial ponctuel (avoir en euros ou pourcentage, avec duree) applique sur
// l'abonnement de base d'une entreprise cliente. Un coupon par entreprise a la fois :
// en appliquer un nouveau remplace l'ancien cote Stripe (comportement natif de
// `subscriptions.update` avec le parametre coupon).
export async function creerCouponRemise(params: { type: TypeRemise; valeur: number; duree: DureeRemise; dureeMois?: number; nom: string }) {
  const corps = new URLSearchParams({ name: params.nom, duration: params.duree });
  if (params.type === "montant") {
    corps.set("amount_off", String(Math.round(params.valeur * 100)));
    corps.set("currency", "eur");
  } else {
    corps.set("percent_off", String(params.valeur));
  }
  if (params.duree === "repeating") {
    if (!params.dureeMois || params.dureeMois < 1) throw new Error("Le nombre de mois est obligatoire pour une remise limitée dans le temps");
    corps.set("duration_in_months", String(params.dureeMois));
  }
  return requeteStripe<StripeCoupon>("coupons", { corps, idempotence: `remise-coupon-${Date.now()}-${Math.random().toString(36).slice(2)}` });
}

export async function appliquerCouponAbonnement(subscriptionId: string, couponId: string) {
  return requeteStripe<StripeSubscription>(`subscriptions/${encodeURIComponent(subscriptionId)}`, {
    corps: new URLSearchParams({ coupon: couponId }),
    idempotence: `remise-application-${subscriptionId}-${couponId}`,
  });
}

export async function retirerCouponAbonnement(subscriptionId: string) {
  return requeteStripe<StripeSubscription>(`subscriptions/${encodeURIComponent(subscriptionId)}/discount`, {
    methode: "DELETE",
    idempotence: `remise-suppression-${subscriptionId}-${Date.now()}`,
  });
}

export async function recupererAbonnementStripe(subscriptionId: string) {
  return requeteStripe<StripeSubscription>(`subscriptions/${encodeURIComponent(subscriptionId)}`, {
    methode: "GET",
  });
}

export async function changerOffreStripe(
  subscriptionId: string,
  offre: OffreAbonnement,
  periodicite: PeriodiciteAbonnement,
) {
  const abonnement = await recupererAbonnementStripe(subscriptionId);
  const itemId = abonnement.items?.data?.[0]?.id;
  const prix = prixStripePour(offre, periodicite);
  if (!itemId || !prix) throw new Error("La ligne d’abonnement Stripe est introuvable");
  return requeteStripe<StripeSubscription>(`subscriptions/${encodeURIComponent(subscriptionId)}`, {
    corps: new URLSearchParams({
      [`items[0][id]`]: itemId,
      [`items[0][price]`]: prix,
      proration_behavior: "create_prorations",
      "metadata[offre]": offre,
      "metadata[periodicite]": periodicite,
    }),
    idempotence: `abonnement-changement-${subscriptionId}-${offre}-${periodicite}`,
  });
}

export async function reconcilierAbonnementStripe(entrepriseId: string) {
  const admin = createAdminClient();
  const { data: entreprise } = await admin.from("entreprises").select("stripe_subscription_id,abonnement_offre,abonnement_periodicite").eq("id", entrepriseId).maybeSingle();
  const offre = String(entreprise?.abonnement_offre ?? "");
  const periodicite = String(entreprise?.abonnement_periodicite ?? "");
  if (!entreprise?.stripe_subscription_id || !estOffreAbonnement(offre) || !estPeriodiciteAbonnement(periodicite)) {
    return { synchronise: false, raison: "abonnement_absent" } as const;
  }
  const prixSupplement = process.env[VARIABLES_PRIX_COMPTE_SUP[offre][periodicite]];
  if (!prixSupplement) return { synchronise: false, raison: "prix_supplement_absent" } as const;
  const { count } = await admin.from("employes").select("id", { count: "exact", head: true }).eq("entreprise_id", entrepriseId).in("compte_application_statut", ["actif", "pause"]);
  const quantite = Math.max(0, Number(count ?? 0) - offreParCle(offre).comptesInclus);
  const abonnement = await recupererAbonnementStripe(entreprise.stripe_subscription_id);
  const item = abonnement.items?.data?.find((ligne) => ligne.price?.id === prixSupplement);
  if (item && quantite === 0) {
    await requeteStripe(`subscription_items/${encodeURIComponent(item.id)}`, { methode: "DELETE", corps: new URLSearchParams({ proration_behavior: "create_prorations" }), idempotence: `abonnement-suppression-comptes-${entrepriseId}-${Date.now()}` });
  } else if (item) {
    await requeteStripe(`subscription_items/${encodeURIComponent(item.id)}`, { corps: new URLSearchParams({ quantity: String(quantite), proration_behavior: "create_prorations" }), idempotence: `abonnement-comptes-${entrepriseId}-${quantite}` });
  } else if (quantite > 0) {
    await requeteStripe(`subscription_items`, { corps: new URLSearchParams({ subscription: entreprise.stripe_subscription_id, price: prixSupplement, quantity: String(quantite), proration_behavior: "create_prorations" }), idempotence: `abonnement-ajout-comptes-${entrepriseId}-${quantite}` });
  }
  return { synchronise: true, quantite } as const;
}

// Option IA payante : ajoute/retire une ligne d'abonnement Stripe dediee, au meme
// intervalle de facturation (mensuel/annuel) que l'offre de base, en suivant le meme
// principe que le supplement de comptes (VARIABLES_PRIX_COMPTE_SUP) : plusieurs prix sur
// un seul abonnement Stripe, tant qu'ils partagent le meme intervalle de facturation.
export async function ajouterOptionIAAbonnement(subscriptionId: string, palier: PalierOptionIA, periodicite: PeriodiciteAbonnement) {
  const prix = prixOptionIAStripePour(palier, periodicite);
  if (!prix) throw new Error("Le tarif Stripe de l'option IA n'est pas configuré pour ce palier");
  const item = await requeteStripe<{ id: string }>("subscription_items", {
    corps: new URLSearchParams({ subscription: subscriptionId, price: prix, quantity: "1", proration_behavior: "create_prorations" }),
    idempotence: `option-ia-ajout-${subscriptionId}-${palier}-${Date.now()}`,
  });
  return item;
}

export async function retirerOptionIAAbonnement(subscriptionItemId: string) {
  return requeteStripe<{ id: string }>(`subscription_items/${encodeURIComponent(subscriptionItemId)}`, {
    methode: "DELETE",
    corps: new URLSearchParams({ proration_behavior: "create_prorations" }),
    idempotence: `option-ia-suppression-${subscriptionItemId}`,
  });
}

export async function calculerDepassementAppareils(entrepriseId: string) {
  const admin = createAdminClient();
  const [{ data: appareils }, { data: employes }, { data: postes }, { data: entreprise }] = await Promise.all([
    admin.from("appareils_comptes").select("utilisateur_id").eq("entreprise_id", entrepriseId).is("revoque_at", null),
    admin.from("employes").select("utilisateur_id,prenom,nom,poste_id,compte_application_statut").eq("entreprise_id", entrepriseId).in("compte_application_statut", ["actif", "pause"]),
    admin.from("postes").select("id,nom,tarif_compte_mensuel").eq("entreprise_id", entrepriseId),
    admin.from("entreprises").select("abonnement_periodicite").eq("id", entrepriseId).maybeSingle(),
  ]);
  const mensuel = calculerDepassementsAppareilsFacturables({
    appareils: appareils ?? [],
    employes: employes ?? [],
    postes: postes ?? [],
  }).reduce((total, ligne) => total + ligne.supplementMensuelHt, 0);
  return entreprise?.abonnement_periodicite === "annuel" ? Math.round(mensuel * 12 * (1 - REDUCTION_ANNUELLE) * 100) / 100 : mensuel;
}

export async function ajouterDepassementAppareilsFacture(params: { entrepriseId: string; customerId: string; invoiceId: string; montantHt: number }) {
  if (params.montantHt <= 0) return null;
  return requeteStripe<{ id: string }>("invoiceitems", {
    corps: new URLSearchParams({ customer: params.customerId, invoice: params.invoiceId, amount: String(Math.round(params.montantHt * 100)), currency: "eur", description: "Dépassement de la limite de 2 appareils par compte", "metadata[entreprise_id]": params.entrepriseId }),
    idempotence: `abonnement-appareils-${params.invoiceId}`,
  });
}

export async function ajouterDepassementStockageFacture(params: {
  entrepriseId: string;
  customerId: string;
  invoiceId: string;
}) {
  const admin = createAdminClient();
  const { data: releveExistant } = await admin
    .from("abonnement_stockage_releves")
    .select("stripe_invoice_item_id,montant_ht")
    .eq("stripe_invoice_id", params.invoiceId)
    .maybeSingle();
  if (releveExistant?.stripe_invoice_item_id || Number(releveExistant?.montant_ht ?? 0) === 0 && releveExistant) {
    return releveExistant;
  }

  const [{ data: entreprise, error: entrepriseErreur }, { data: utilisation, error: utilisationErreur }] = await Promise.all([
    admin
      .from("entreprises")
      .select("abonnement_offre,abonnement_periodicite")
      .eq("id", params.entrepriseId)
      .single(),
    admin.rpc("utilisation_stockage_entreprise", { p_entreprise_id: params.entrepriseId }),
  ]);
  if (entrepriseErreur || !entreprise) throw new Error("Offre de l’entreprise introuvable");
  if (utilisationErreur) throw new Error(utilisationErreur.message);

  const offreBrute = String(entreprise.abonnement_offre ?? "essentiel");
  const periodiciteBrute = String(entreprise.abonnement_periodicite ?? "mensuel");
  const offre: OffreAbonnement = estOffreAbonnement(offreBrute) ? offreBrute : "essentiel";
  const periodicite: PeriodiciteAbonnement = estPeriodiciteAbonnement(periodiciteBrute) ? periodiciteBrute : "mensuel";
  const ligneUtilisation = Array.isArray(utilisation) ? utilisation[0] : utilisation;
  const octetsUtilises = Number(ligneUtilisation?.octets_utilises ?? 0);
  const fichiers = Number(ligneUtilisation?.fichiers ?? 0);
  const quotaGo = offreParCle(offre).stockageGoInclus;
  const calcul = calculerFacturationStockage({ octetsUtilises, quotaGo, periodicite });

  const { error: releveErreur } = await admin.from("abonnement_stockage_releves").upsert({
    entreprise_id: params.entrepriseId,
    stripe_invoice_id: params.invoiceId,
    offre,
    periodicite,
    octets_utilises: octetsUtilises,
    fichiers,
    quota_go: quotaGo,
    depassement_go: calcul.depassementGo,
    tarif_go_ht: TARIF_STOCKAGE_SUPPLEMENTAIRE_HT_PAR_GO,
    nombre_mois: calcul.nombreMois,
    montant_ht: calcul.montantHt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_invoice_id" });
  if (releveErreur) throw new Error(releveErreur.message);
  if (calcul.montantHt <= 0) return { montant_ht: 0, stripe_invoice_item_id: null };

  const suffixePeriode = calcul.nombreMois === 12 ? " · période annuelle de 12 mois" : "";
  const ligne = await requeteStripe<{ id: string }>("invoiceitems", {
    corps: new URLSearchParams({
      customer: params.customerId,
      invoice: params.invoiceId,
      amount: String(Math.round(calcul.montantHt * 100)),
      currency: "eur",
      description: `Stockage supplémentaire : ${calcul.depassementGo.toLocaleString("fr-FR")} Go au-delà de ${quotaGo} Go inclus${suffixePeriode}`,
      "metadata[entreprise_id]": params.entrepriseId,
      "metadata[usage_octets]": String(octetsUtilises),
      "metadata[quota_go]": String(quotaGo),
      "metadata[depassement_go]": String(calcul.depassementGo),
    }),
    idempotence: `abonnement-stockage-${params.invoiceId}`,
  });
  const { error: miseAJourErreur } = await admin
    .from("abonnement_stockage_releves")
    .update({ stripe_invoice_item_id: ligne.id, updated_at: new Date().toISOString() })
    .eq("stripe_invoice_id", params.invoiceId);
  if (miseAJourErreur) throw new Error(miseAJourErreur.message);
  return ligne;
}
