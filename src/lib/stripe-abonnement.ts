import { createAdminClient } from "@/lib/supabase/admin";
import { DUREE_ESSAI_JOURS, offreParCle, REDUCTION_ANNUELLE } from "@/lib/plateforme";

export const OFFRES_ABONNEMENT = ["essentiel", "pro", "premium"] as const;
export const PERIODICITES_ABONNEMENT = ["mensuel", "annuel"] as const;
export type OffreAbonnement = (typeof OFFRES_ABONNEMENT)[number];
export type PeriodiciteAbonnement = (typeof PERIODICITES_ABONNEMENT)[number];
export type StatutAbonnement = "essai" | "actif" | "suspendu" | "annule";

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

export async function calculerDepassementAppareils(entrepriseId: string) {
  const admin = createAdminClient();
  const [{ data: appareils }, { data: employes }, { data: postes }, { data: entreprise }] = await Promise.all([
    admin.from("appareils_comptes").select("utilisateur_id").eq("entreprise_id", entrepriseId).is("revoque_at", null),
    admin.from("employes").select("utilisateur_id,poste_id").eq("entreprise_id", entrepriseId),
    admin.from("postes").select("id,tarif_compte_mensuel").eq("entreprise_id", entrepriseId),
    admin.from("entreprises").select("abonnement_periodicite").eq("id", entrepriseId).maybeSingle(),
  ]);
  const nombres = new Map<string, number>();
  for (const appareil of appareils ?? []) nombres.set(appareil.utilisateur_id, (nombres.get(appareil.utilisateur_id) ?? 0) + 1);
  const mensuel = [...nombres].filter(([, nombre]) => nombre > 2).reduce((total, [utilisateurId]) => {
    const employe = (employes ?? []).find((item) => item.utilisateur_id === utilisateurId);
    const poste = (postes ?? []).find((item) => item.id === employe?.poste_id);
    return total + Number(poste?.tarif_compte_mensuel ?? 0);
  }, 0);
  return entreprise?.abonnement_periodicite === "annuel" ? Math.round(mensuel * 12 * (1 - REDUCTION_ANNUELLE) * 100) / 100 : mensuel;
}

export async function ajouterDepassementAppareilsFacture(params: { entrepriseId: string; customerId: string; invoiceId: string; montantHt: number }) {
  if (params.montantHt <= 0) return null;
  return requeteStripe<{ id: string }>("invoiceitems", {
    corps: new URLSearchParams({ customer: params.customerId, invoice: params.invoiceId, amount: String(Math.round(params.montantHt * 100)), currency: "eur", description: "Dépassement de la limite de 2 appareils par compte", "metadata[entreprise_id]": params.entrepriseId }),
    idempotence: `abonnement-appareils-${params.invoiceId}`,
  });
}
