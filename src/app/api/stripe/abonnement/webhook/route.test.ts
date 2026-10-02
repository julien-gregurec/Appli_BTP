import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/test/fake-supabase";
import { ENV_PRIX_TEST, FakeStripe, signerWebhook } from "@/test/fake-stripe";

// Qualification locale du parcours Stripe Billing → droits Gestion Pro.
// Chaque scénario passe par la vraie route webhook (signature, journal
// d'idempotence, relecture Stripe, synchronisation) avec Stripe et Supabase simulés.

const etat = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => etat.db }));

import { POST } from "./route";
import { GET as cron } from "@/app/api/cron/abonnements/route";

const SECRET_WEBHOOK = "whsec_fictif";
const ENTREPRISE = "ent_1";
const CLIENT = "cus_1";

let db: FakeSupabase;
let stripe: FakeStripe;
let numeroEvenement = 0;

function evenement(type: string, objet: Record<string, unknown>, options: { id?: string; livemode?: boolean } = {}) {
  numeroEvenement += 1;
  return { id: options.id ?? `evt_${numeroEvenement}`, type, livemode: options.livemode ?? false, data: { object: objet } };
}

async function livrer(evt: ReturnType<typeof evenement>) {
  const corps = JSON.stringify(evt);
  const reponse = await POST(new Request("http://localhost/api/stripe/abonnement/webhook", {
    method: "POST",
    headers: { "stripe-signature": signerWebhook(corps, SECRET_WEBHOOK) },
    body: corps,
  }));
  return { statut: reponse.status, corps: await reponse.json() as Record<string, unknown> };
}

function entreprise() {
  return db.table("entreprises").find((ligne) => ligne.id === ENTREPRISE)!;
}

function contrat() {
  return db.table("abonnements_entreprises").find((ligne) => ligne.entreprise_id === ENTREPRISE);
}

// Copie figée de l'objet Stripe au moment de l'émission de l'événement.
function instantane(subscriptionId: string) {
  return structuredClone(stripe.subscriptions.get(subscriptionId)!) as unknown as Record<string, unknown>;
}

beforeEach(() => {
  numeroEvenement = 0;
  db = new FakeSupabase({ abonnement_evenements: ["stripe_event_id"], factures_abonnement: ["stripe_invoice_id"] });
  db.seed("entreprises", [{ id: ENTREPRISE, nom: "BTP Test", stripe_customer_id: CLIENT, stripe_subscription_id: null, abonnement_statut: "essai", abonnement_offre: null, abonnement_periodicite: null }]);
  db.seed("plans_abonnement", [
    { id: "plan_mini", code: "mini", version: 2, prix_mensuel_ht: 79, prix_annuel_ht: 790, actif: true },
    { id: "plan_pro", code: "pro", version: 3, prix_mensuel_ht: 249, prix_annuel_ht: 2490, actif: true },
    { id: "plan_pro_v2", code: "pro", version: 2, prix_mensuel_ht: 249, prix_annuel_ht: 2988, actif: false },
    { id: "plan_business", code: "business", version: 2, prix_mensuel_ht: 449, prix_annuel_ht: 4490, actif: true },
    { id: "plan_entreprise", code: "entreprise", version: 2, prix_mensuel_ht: 599, prix_annuel_ht: 5990, actif: true },
  ]);
  etat.db = db;
  stripe = new FakeStripe();
  vi.stubGlobal("fetch", stripe.fetch);
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fictif");
  vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET_WEBHOOK);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("CRON_SECRET", "cron_fictif");
  for (const [nom, valeur] of Object.entries(ENV_PRIX_TEST)) vi.stubEnv(nom, valeur);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function souscrire(subscriptionId = "sub_1", prix = "price_pro_m", statut = "trialing") {
  stripe.abonnement({ id: subscriptionId, customer: CLIENT, prix, statut, entrepriseId: ENTREPRISE, metadata: { offre: "pro", periodicite: "mensuel" } });
  return livrer(evenement("checkout.session.completed", { id: `cs_${subscriptionId}`, object: "checkout.session", mode: "subscription", customer: CLIENT, subscription: subscriptionId, metadata: { entreprise_id: ENTREPRISE } }));
}

describe("parcours nominal", () => {
  it("checkout → essai, puis paiement réussi → droit Gestion Pro actif", async () => {
    expect((await souscrire()).statut).toBe(200);
    expect(entreprise()).toMatchObject({ abonnement_statut: "essai", abonnement_offre: "pro", abonnement_periodicite: "mensuel", stripe_subscription_id: "sub_1" });
    expect(entreprise().abonnement_echeance).toBeTruthy();

    stripe.modifier("sub_1", { status: "active" });
    stripe.facture({ id: "in_1", customer: CLIENT, subscription: "sub_1", statut: "paid", total: 24_900 });
    const reponse = await livrer(evenement("invoice.paid", stripe.invoices.get("in_1")!));
    expect(reponse.statut).toBe(200);
    expect(entreprise().abonnement_statut).toBe("actif");
    expect(contrat()).toMatchObject({ code_offre: "pro", periodicite: "mensuel", prix_contractuel_ht: 249, version_tarif: 3, statut: "actif" });
    expect(db.table("factures_abonnement")).toHaveLength(1);
    expect(db.table("factures_abonnement")[0]).toMatchObject({ statut: "paid", montant_ttc: 249 });
  });

  it("un invoice.paid d'essai (0 €) ne transforme pas l'essai en abonnement actif", async () => {
    await souscrire();
    stripe.facture({ id: "in_0", customer: CLIENT, subscription: "sub_1", statut: "paid", total: 0, billingReason: "subscription_create" });
    await livrer(evenement("invoice.paid", stripe.invoices.get("in_0")!));
    expect(entreprise().abonnement_statut).toBe("essai");
  });
});

describe("portail client : les droits suivent le Price facturé", () => {
  it("upgrade puis downgrade modifient l'offre même si les métadonnées restent « pro »", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    stripe.changerPrix("sub_1", "price_business_m");
    await livrer(evenement("customer.subscription.updated", instantane("sub_1")));
    expect(entreprise().abonnement_offre).toBe("business");
    expect(contrat()).toMatchObject({ code_offre: "business", prix_contractuel_ht: 449 });

    stripe.changerPrix("sub_1", "price_mini_m");
    await livrer(evenement("customer.subscription.updated", instantane("sub_1")));
    expect(entreprise().abonnement_offre).toBe("mini");
    expect(contrat()).toMatchObject({ code_offre: "mini", prix_contractuel_ht: 79 });
    expect(stripe.subscriptions.get("sub_1")!.metadata!.offre).toBe("pro");
    expect(db.table("historique_tarification").map((ligne) => (ligne.nouveau as { offre: string }).offre)).toEqual(["pro", "business", "mini"]);
  });

  it("passage mensuel → annuel : le prix contractuel devient l'annuel 10 mois", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    stripe.changerPrix("sub_1", "price_pro_a");
    await livrer(evenement("customer.subscription.updated", instantane("sub_1")));
    expect(contrat()).toMatchObject({ code_offre: "pro", periodicite: "annuel", prix_contractuel_ht: 2490 });
  });

  it("un ancien contrat sur l'ancien Price annuel garde son prix historique", async () => {
    await souscrire("sub_1", "price_pro_a_v2", "active");
    expect(entreprise().abonnement_offre).toBe("pro");
    expect(contrat()).toMatchObject({ periodicite: "annuel", prix_contractuel_ht: 2988, version_tarif: 2, plan_id: null });
    // Un renouvellement ne réécrit pas le contrat avec la nouvelle grille.
    await livrer(evenement("customer.subscription.updated", instantane("sub_1")));
    expect(contrat()).toMatchObject({ prix_contractuel_ht: 2988, version_tarif: 2 });
  });

  it("un Price non reconnu n'accorde aucun droit et libère l'événement pour rejeu", async () => {
    stripe.abonnement({ id: "sub_x", customer: CLIENT, prix: "price_inconnu", statut: "active", entrepriseId: ENTREPRISE, metadata: { offre: "entreprise" } });
    const reponse = await livrer(evenement("customer.subscription.created", instantane("sub_x"), { id: "evt_inconnu" }));
    expect(reponse.statut).toBe(500);
    expect(entreprise().abonnement_offre).toBeNull();
    expect(db.table("abonnement_evenements")).toHaveLength(0);
  });
});

describe("résiliation, ordre des événements et idempotence", () => {
  it("résiliation programmée puis terminale ; un ancien événement ne réactive rien", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    const ancienActif = instantane("sub_1");

    stripe.modifier("sub_1", { cancel_at_period_end: true, cancel_at: Math.floor(Date.now() / 1000) + 86_400 });
    await livrer(evenement("customer.subscription.updated", instantane("sub_1")));
    expect(entreprise()).toMatchObject({ abonnement_statut: "actif" });
    expect(entreprise().abonnement_annulation_prevue_at).toBeTruthy();

    stripe.modifier("sub_1", { status: "canceled" });
    await livrer(evenement("customer.subscription.deleted", instantane("sub_1")));
    expect(entreprise().abonnement_statut).toBe("annule");
    expect(contrat()!.statut).toBe("annule");

    // Ordre inversé : un « updated » actif émis AVANT la résiliation arrive après.
    await livrer(evenement("customer.subscription.updated", ancienActif));
    expect(entreprise().abonnement_statut).toBe("annule");

    // invoice.paid tardif d'une période antérieure.
    stripe.facture({ id: "in_tardif", customer: CLIENT, subscription: "sub_1", statut: "paid", total: 24_900, created: Math.floor(Date.now() / 1000) - 40 * 86_400 });
    await livrer(evenement("invoice.paid", stripe.invoices.get("in_tardif")!));
    expect(entreprise().abonnement_statut).toBe("annule");
  });

  it("un webhook dupliqué n'a aucun double effet", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    stripe.changerPrix("sub_1", "price_business_m");
    const evt = evenement("customer.subscription.updated", instantane("sub_1"), { id: "evt_double" });
    const premier = await livrer(evt);
    const second = await livrer(evt);
    expect(premier.corps.duplicate).toBeUndefined();
    expect(second.corps).toMatchObject({ received: true, duplicate: true });
    expect(db.table("historique_tarification")).toHaveLength(2);
    expect(db.table("abonnement_evenements").filter((ligne) => ligne.stripe_event_id === "evt_double")).toHaveLength(1);

    stripe.facture({ id: "in_c1", customer: CLIENT, subscription: "sub_1", statut: "draft", total: 44_900 });
    const creation = evenement("invoice.created", stripe.invoices.get("in_c1")!, { id: "evt_facture" });
    await livrer(creation);
    await livrer(creation);
    // Relevé de stockage : une seule ligne par facture, même rejouée.
    expect(db.table("abonnement_stockage_releves").filter((ligne) => ligne.stripe_invoice_id === "in_c1")).toHaveLength(1);
  });

  it("la même facture reçue paid puis payment_failed (désordre) reste payée", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    stripe.facture({ id: "in_2", customer: CLIENT, subscription: "sub_1", statut: "paid", total: 24_900 });
    const echecPerime = { ...stripe.invoices.get("in_2")!, status: "open" };
    await livrer(evenement("invoice.paid", stripe.invoices.get("in_2")!));
    await livrer(evenement("invoice.payment_failed", echecPerime));
    expect(db.table("factures_abonnement")[0].statut).toBe("paid");
    expect(entreprise().abonnement_statut).toBe("actif");
  });

  it("un traitement en échec est rejouable (Stripe indisponible puis rétabli)", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    stripe.modifier("sub_1", { status: "past_due" });
    const evt = evenement("customer.subscription.updated", instantane("sub_1"), { id: "evt_rejeu" });
    stripe.panne = true;
    expect((await livrer(evt)).statut).toBe(500);
    expect(entreprise().abonnement_statut).toBe("actif");
    stripe.panne = false;
    expect((await livrer(evt)).statut).toBe(200);
    expect(entreprise().abonnement_statut).toBe("suspendu");
  });
});

describe("paiement refusé, suspension et restauration", () => {
  it("échec de renouvellement → suspendu ; paiement régularisé → actif", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    stripe.modifier("sub_1", { status: "past_due" });
    stripe.facture({ id: "in_3", customer: CLIENT, subscription: "sub_1", statut: "open", total: 24_900 });
    await livrer(evenement("invoice.payment_failed", stripe.invoices.get("in_3")!));
    expect(entreprise().abonnement_statut).toBe("suspendu");
    expect(entreprise().abonnement_offre).toBe("pro");

    stripe.modifier("sub_1", { status: "active" });
    stripe.invoices.get("in_3")!.status = "paid";
    await livrer(evenement("invoice.paid", stripe.invoices.get("in_3")!));
    expect(entreprise().abonnement_statut).toBe("actif");
    expect(db.table("factures_abonnement")[0].statut).toBe("paid");
  });

  it("webhook manquant : le cron relit Stripe et applique suspension puis résiliation", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    stripe.modifier("sub_1", { status: "unpaid" });
    const reponse = await cron(new Request("http://localhost/api/cron/abonnements", { headers: { authorization: "Bearer cron_fictif" } }));
    expect(reponse.status).toBe(200);
    expect(entreprise().abonnement_statut).toBe("suspendu");

    stripe.modifier("sub_1", { status: "canceled" });
    await cron(new Request("http://localhost/api/cron/abonnements", { headers: { authorization: "Bearer cron_fictif" } }));
    expect(entreprise().abonnement_statut).toBe("annule");
  });
});

describe("réabonnement", () => {
  it("un nouvel abonnement remplace le résilié ; les événements de l'ancien sont ignorés", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    stripe.modifier("sub_1", { status: "canceled" });
    await livrer(evenement("customer.subscription.deleted", instantane("sub_1")));
    expect(entreprise().abonnement_statut).toBe("annule");

    stripe.abonnement({ id: "sub_2", customer: CLIENT, prix: "price_business_a", statut: "active", entrepriseId: ENTREPRISE });
    await livrer(evenement("checkout.session.completed", { id: "cs_2", object: "checkout.session", mode: "subscription", customer: CLIENT, subscription: "sub_2", metadata: { entreprise_id: ENTREPRISE } }));
    expect(entreprise()).toMatchObject({ abonnement_statut: "actif", stripe_subscription_id: "sub_2", abonnement_offre: "business", abonnement_periodicite: "annuel" });

    const tardif = await livrer(evenement("customer.subscription.deleted", instantane("sub_1")));
    expect(tardif.corps.statut).toBe("ignore:ancien_abonnement");
    expect(entreprise()).toMatchObject({ abonnement_statut: "actif", stripe_subscription_id: "sub_2" });
  });

  it("un second abonnement vivant n'écrase jamais le premier (traitement manuel)", async () => {
    await souscrire("sub_1", "price_pro_m", "active");
    stripe.abonnement({ id: "sub_doublon", customer: CLIENT, prix: "price_entreprise_m", statut: "active", entrepriseId: ENTREPRISE });
    const reponse = await livrer(evenement("customer.subscription.created", instantane("sub_doublon")));
    expect(reponse.corps.statut).toBe("ignore:abonnement_concurrent");
    expect(entreprise()).toMatchObject({ stripe_subscription_id: "sub_1", abonnement_offre: "pro" });
  });

  it("un abonnement d'un autre client Stripe n'est pas rattaché", async () => {
    stripe.abonnement({ id: "sub_autre", customer: "cus_autre", prix: "price_entreprise_m", statut: "active", entrepriseId: ENTREPRISE });
    const reponse = await livrer(evenement("customer.subscription.created", instantane("sub_autre")));
    expect(reponse.corps.statut).toBe("ignore:client_incoherent");
    expect(entreprise().abonnement_offre).toBeNull();
  });
});

describe("cloisonnement Test / Live et facturation réelle", () => {
  it("refuse un événement Live sur une configuration Test", async () => {
    stripe.abonnement({ id: "sub_1", customer: CLIENT, prix: "price_pro_m", statut: "active", entrepriseId: ENTREPRISE });
    const reponse = await livrer(evenement("customer.subscription.created", instantane("sub_1"), { livemode: true }));
    expect(reponse.statut).toBe(400);
    expect(db.table("abonnement_evenements")).toHaveLength(0);
  });

  it("refuse une signature invalide", async () => {
    const corps = JSON.stringify(evenement("customer.subscription.created", {}));
    const reponse = await POST(new Request("http://localhost/x", { method: "POST", headers: { "stripe-signature": signerWebhook(corps, "whsec_autre") }, body: corps }));
    expect(reponse.status).toBe(400);
  });

  it("en Live sans identité vendeur ni TVA confirmées, une facture brouillon n'est jamais finalisée", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fictif");
    stripe.facture({ id: "in_live", customer: CLIENT, subscription: "sub_1", statut: "draft", total: 24_900 });
    const reponse = await livrer(evenement("invoice.created", stripe.invoices.get("in_live")!, { livemode: true }));
    expect(reponse.corps.statut).toBe("facture_bloquee_identite_ou_tva");
    const blocage = stripe.appelsVers("invoices/in_live");
    expect(blocage).toHaveLength(1);
    expect(blocage[0].corps!.get("auto_advance")).toBe("false");
  });
});
