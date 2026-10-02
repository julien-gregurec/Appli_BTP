import { createHmac } from "node:crypto";
import type { StripePrice, StripeSubscription } from "@/lib/stripe-abonnement";

// Simulateur Stripe minimal pour les tests : l'état des abonnements et factures est
// tenu en mémoire et servi via un `fetch` simulé, comme le ferait l'API Stripe.
// Les webhooks sont signés exactement comme Stripe (t=…,v1=HMAC-SHA256).

export type AppelStripe = { methode: string; chemin: string; corps: URLSearchParams | null; idempotence: string | null };

export const PRIX_TEST: Record<string, StripePrice> = {
  price_mini_m: { id: "price_mini_m", unit_amount: 7_900, currency: "eur", recurring: { interval: "month" } },
  price_mini_a: { id: "price_mini_a", unit_amount: 79_000, currency: "eur", recurring: { interval: "year" } },
  price_pro_m: { id: "price_pro_m", unit_amount: 24_900, currency: "eur", recurring: { interval: "month" } },
  price_pro_a: { id: "price_pro_a", unit_amount: 249_000, currency: "eur", recurring: { interval: "year" } },
  price_business_m: { id: "price_business_m", unit_amount: 44_900, currency: "eur", recurring: { interval: "month" } },
  price_business_a: { id: "price_business_a", unit_amount: 449_000, currency: "eur", recurring: { interval: "year" } },
  price_entreprise_m: { id: "price_entreprise_m", unit_amount: 59_900, currency: "eur", recurring: { interval: "month" } },
  price_entreprise_a: { id: "price_entreprise_a", unit_amount: 599_000, currency: "eur", recurring: { interval: "year" } },
  // Ancien Price annuel (grille 12 mois) conservé pour un contrat historique.
  price_pro_a_v2: { id: "price_pro_a_v2", unit_amount: 298_800, currency: "eur", recurring: { interval: "year" }, metadata: { liria_offre: "pro", liria_periodicite: "annuel", liria_version_tarif: "2" } },
  price_inconnu: { id: "price_inconnu", unit_amount: 1_000, currency: "eur", recurring: { interval: "month" } },
};

export const ENV_PRIX_TEST = {
  STRIPE_PRICE_MINI_MENSUEL: "price_mini_m",
  STRIPE_PRICE_MINI_ANNUEL: "price_mini_a",
  STRIPE_PRICE_PRO_MENSUEL: "price_pro_m",
  STRIPE_PRICE_PRO_ANNUEL: "price_pro_a",
  STRIPE_PRICE_BUSINESS_MENSUEL: "price_business_m",
  STRIPE_PRICE_BUSINESS_ANNUEL: "price_business_a",
  STRIPE_PRICE_ENTREPRISE_MENSUEL: "price_entreprise_m",
  STRIPE_PRICE_ENTREPRISE_ANNUEL: "price_entreprise_a",
};

export class FakeStripe {
  subscriptions = new Map<string, StripeSubscription>();
  invoices = new Map<string, Record<string, unknown>>();
  appels: AppelStripe[] = [];
  panne = false;
  private compteur = 0;

  abonnement(params: { id: string; customer: string; prix: string; statut: string; entrepriseId?: string; metadata?: Record<string, string>; trialEnd?: number | null }) {
    const maintenant = Math.floor(Date.now() / 1000);
    const abonnement: StripeSubscription = {
      id: params.id,
      object: "subscription",
      customer: params.customer,
      status: params.statut,
      created: maintenant,
      trial_end: params.trialEnd ?? null,
      cancel_at_period_end: false,
      cancel_at: null,
      metadata: { ...(params.entrepriseId ? { entreprise_id: params.entrepriseId } : {}), ...params.metadata },
      // Forme API 2025-03-31 (basil) : les périodes sont portées par les lignes.
      items: { data: [{ id: `si_${params.id}`, quantity: 1, price: PRIX_TEST[params.prix], current_period_start: maintenant, current_period_end: maintenant + 30 * 86_400 }] },
    };
    this.subscriptions.set(params.id, abonnement);
    return abonnement;
  }

  changerPrix(subscriptionId: string, prix: string) {
    const abonnement = this.subscriptions.get(subscriptionId)!;
    abonnement.items!.data![0] = { ...abonnement.items!.data![0], price: PRIX_TEST[prix] };
  }

  modifier(subscriptionId: string, champs: Partial<StripeSubscription>) {
    Object.assign(this.subscriptions.get(subscriptionId)!, champs);
  }

  facture(params: { id: string; customer: string; subscription: string; statut: string; total: number; created?: number; billingReason?: string }) {
    const facture = {
      id: params.id,
      object: "invoice",
      customer: params.customer,
      // Forme basil : l'abonnement est sous parent.subscription_details.
      parent: { subscription_details: { subscription: params.subscription } },
      status: params.statut,
      total: params.total,
      subtotal_excluding_tax: params.total,
      total_taxes: [],
      currency: "eur",
      number: `TEST-${params.id}`,
      created: params.created ?? Math.floor(Date.now() / 1000),
      billing_reason: params.billingReason ?? "subscription_cycle",
      hosted_invoice_url: `https://invoice.stripe.test/${params.id}`,
      invoice_pdf: `https://invoice.stripe.test/${params.id}.pdf`,
      status_transitions: { paid_at: params.statut === "paid" ? Math.floor(Date.now() / 1000) : null },
    };
    this.invoices.set(params.id, facture);
    return facture;
  }

  appelsVers(prefixe: string, methode = "POST") {
    return this.appels.filter((appel) => appel.methode === methode && appel.chemin.startsWith(prefixe));
  }

  fetch = async (entree: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url);
    const chemin = url.pathname.replace(/^\/v1\//, "");
    const methode = init?.method ?? "GET";
    const corps = init?.body instanceof URLSearchParams ? init.body : null;
    const entetes = new Headers(init?.headers);
    this.appels.push({ methode, chemin, corps, idempotence: entetes.get("Idempotency-Key") });
    const repondre = (donnees: unknown, statut = 200) => new Response(JSON.stringify(donnees), { status: statut, headers: { "Content-Type": "application/json" } });
    if (this.panne) return repondre({ error: { message: "Stripe indisponible (simulation)" } }, 503);

    const [ressource, id, sousRessource] = chemin.split("/");
    if (ressource === "subscriptions" && id && methode === "GET") {
      const abonnement = this.subscriptions.get(decodeURIComponent(id));
      return abonnement ? repondre(structuredClone(abonnement)) : repondre({ error: { message: "No such subscription" } }, 404);
    }
    if (ressource === "invoices" && id && methode === "GET") {
      const facture = this.invoices.get(decodeURIComponent(id));
      return facture ? repondre(structuredClone(facture)) : repondre({ error: { message: "No such invoice" } }, 404);
    }
    if (ressource === "invoices" && id && methode === "POST" && !sousRessource) {
      const facture = this.invoices.get(decodeURIComponent(id)) ?? { id };
      if (corps?.get("auto_advance")) facture.auto_advance = corps.get("auto_advance") === "true";
      return repondre(facture);
    }
    this.compteur += 1;
    if (ressource === "checkout") return repondre({ id: `cs_test_${this.compteur}`, url: `https://checkout.stripe.test/${this.compteur}` });
    if (ressource === "billing_portal") return repondre({ id: `bps_${this.compteur}`, url: `https://billing.stripe.test/${this.compteur}` });
    if (ressource === "customers") return repondre({ id: id ? decodeURIComponent(id) : `cus_test_${this.compteur}` });
    return repondre({ id: `${ressource}_${this.compteur}` });
  };
}

export function signerWebhook(payload: string, secret: string, horodatage = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${horodatage}.${payload}`, "utf8").digest("hex");
  return `t=${horodatage},v1=${signature}`;
}
