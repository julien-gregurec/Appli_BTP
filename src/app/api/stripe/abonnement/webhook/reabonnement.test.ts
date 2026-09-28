import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1 — contrat d'appel du webhook abonnement
// pendant un réabonnement. La sémantique base (verrou, historique, filigrane,
// garde facture) est prouvée par supabase/tests/stripe_resubscription_flow_v1.test.sql.

const deps = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  recupererAbonnementStripe: vi.fn(),
  reconcilierAbonnementStripe: vi.fn(),
  ajouterDepassementAppareilsFacture: vi.fn(),
  ajouterDepassementStockageFacture: vi.fn(),
  calculerDepassementAppareils: vi.fn(async () => 0),
  reconcilierCapacitePersonnesStripe: vi.fn(async () => ({ synchronise: true })),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.createAdminClient }));
vi.mock("@/lib/abonnement-notifications", () => ({ notifierPaiementAbonnementEchoue: vi.fn(async () => ({ envoye: true })) }));
vi.mock("@/lib/stripe-capacite-reconcile", () => ({ reconcilierCapacitePersonnesStripe: deps.reconcilierCapacitePersonnesStripe }));
vi.mock("@/lib/stripe-abonnement", () => ({
  recupererAbonnementStripe: deps.recupererAbonnementStripe,
  statutAbonnementDepuisStripe: (s: string) => (s === "trialing" ? "essai" : s === "active" ? "actif" : ["past_due", "unpaid", "incomplete", "paused"].includes(s) ? "suspendu" : "annule"),
  reconcilierAbonnementStripe: deps.reconcilierAbonnementStripe,
  ajouterDepassementAppareilsFacture: deps.ajouterDepassementAppareilsFacture,
  ajouterDepassementStockageFacture: deps.ajouterDepassementStockageFacture,
  calculerDepassementAppareils: deps.calculerDepassementAppareils,
  observerRemiseDepuisAbonnement: () => ({ status: "absent", count: 0, discount_id: null, source_type: null, source_id: null, coupon_id: null }),
  appliquerCouponAbonnement: vi.fn(), couponActifDepuisAbonnement: vi.fn(), creerCouponRemise: vi.fn(), retirerCouponAbonnement: vi.fn(),
}));
vi.mock("@/lib/stripe-discount-server", () => ({
  VerrouRemiseOccupe: class extends Error {},
  acquerirVerrouRemise: vi.fn(async () => "verrou"),
  libererVerrouRemise: vi.fn(),
  lireOperationActiveRemiseServeur: vi.fn(async () => null),
  reconcilierOperationRemiseSousVerrou: vi.fn(),
  synchroniserExpirationRemiseSousVerrou: vi.fn(async () => null),
}));

const { POST } = await import("./route");

const SECRET = "whsec_test_uniquement";
const ENTREPRISE = "22222222-2222-4222-8222-222222222222";

type Etat = {
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  relier?: { data?: string; error?: { code: string; message: string } };
  facture?: Record<string, unknown>;
};

function adminFake(etat: Etat) {
  const appels: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const admin = {
    appels,
    from() {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: { id: ENTREPRISE, nom: "SARL Reprise", ...etat }, error: null });
      return q;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      appels.push({ fn, args });
      if (fn === "reserver_evenement_abonnement_service") return { data: "reserve", error: null };
      if (fn === "relier_subscription_reabonnement_service") {
        if (etat.relier?.error) return { data: null, error: etat.relier.error };
        return { data: etat.relier?.data ?? "relie", error: null };
      }
      if (fn === "synchroniser_abonnement_stripe_ordonne_service") {
        return { data: { decision: "applique", statut_resultant: args.p_statut }, error: null };
      }
      if (fn === "appliquer_evenement_facture_abonnement_v2_service") {
        return { data: etat.facture ?? { decision: "applique", statut_resultant: "actif", notifier_echec: false }, error: null };
      }
      return { data: null, error: null };
    },
  };
  return admin;
}

const SUBS: Record<string, { id: string; customer: string; status: string; metadata: Record<string, string>; discounts: unknown[] }> = {
  sub_ancienne: { id: "sub_ancienne", customer: "cus_reprise", status: "canceled", metadata: {}, discounts: [] },
  sub_nouvelle: { id: "sub_nouvelle", customer: "cus_reprise", status: "active", metadata: { offre: "pro", periodicite: "mensuel" }, discounts: [] },
};

function evenementSubscription(type: string, subId: string, id = `evt_${type}_${subId}`) {
  return {
    id, type, livemode: false, created: 1_790_000_000,
    data: { object: { id: subId, object: "subscription", customer: "cus_reprise", status: SUBS[subId].status, metadata: { entreprise_id: ENTREPRISE } } },
  };
}

function evenementFacture(type: string, subscription: Record<string, unknown>, id = `evt_${type}`) {
  return {
    id, type, livemode: false, created: 1_790_000_100,
    data: { object: { id: "in_reprise", object: "invoice", customer: "cus_reprise", status: type === "invoice.paid" ? "paid" : "open", billing_reason: "subscription_cycle", total: 24_900, currency: "eur", ...subscription } },
  };
}

function request(payload: object) {
  const body = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  return new Request("https://example.invalid/api/stripe/abonnement/webhook", { method: "POST", headers: { "stripe-signature": `t=${t},v1=${v1}` }, body });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET", SECRET);
  vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
  deps.recupererAbonnementStripe.mockImplementation(async (id: string) => structuredClone(SUBS[id]));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("subscription.* d'une nouvelle subscription (réabonnement)", () => {
  it.each(["customer.subscription.created", "customer.subscription.updated"])(
    "%s : plus de 422 à la résolution ; l'ancienne est RELUE chez Stripe et transmise à la base qui décide", async (type) => {
      const admin = adminFake({ stripe_customer_id: "cus_reprise", stripe_subscription_id: "sub_ancienne" });
      deps.createAdminClient.mockReturnValue(admin);
      const reponse = await POST(request(evenementSubscription(type, "sub_nouvelle")));
      expect(reponse.status).toBe(200);
      expect(deps.recupererAbonnementStripe).toHaveBeenCalledWith("sub_ancienne");
      expect(admin.appels.find((a) => a.fn === "relier_subscription_reabonnement_service")?.args).toEqual({
        p_entreprise_id: ENTREPRISE,
        p_nouvelle_subscription_id: "sub_nouvelle",
        p_stripe_customer_id: "cus_reprise",
        p_nouvelle_statut_stripe: "active",
        p_ancienne_subscription_id: "sub_ancienne",
        p_ancienne_statut_stripe: "canceled",
      });
      // Le rattachement précède la synchronisation ordonnée (état Stripe relu).
      const ordre = admin.appels.map((a) => a.fn);
      expect(ordre.indexOf("relier_subscription_reabonnement_service")).toBeLessThan(ordre.indexOf("synchroniser_abonnement_stripe_ordonne_service"));
      expect(admin.appels.find((a) => a.fn === "synchroniser_abonnement_stripe_ordonne_service")?.args).toMatchObject({ p_stripe_subscription_id: "sub_nouvelle", p_statut: "actif" });
    });

  it("double abonnement (ancienne encore vivante) : la base refuse (42501) → 422, réservation annulée, rien appliqué", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const admin = adminFake({ stripe_customer_id: "cus_reprise", stripe_subscription_id: "sub_ancienne", relier: { error: { code: "42501", message: "La subscription rattachée est encore active chez Stripe" } } });
    deps.createAdminClient.mockReturnValue(admin);
    const reponse = await POST(request(evenementSubscription("customer.subscription.created", "sub_nouvelle")));
    expect(reponse.status).toBe(422);
    expect(JSON.stringify(await reponse.json())).not.toContain("encore active");
    expect(admin.appels.some((a) => a.fn === "synchroniser_abonnement_stripe_ordonne_service")).toBe(false);
    expect(admin.appels.some((a) => a.fn === "annuler_evenement_abonnement_service")).toBe(true);
  });

  it("client Stripe différent : 422 (jamais rattaché)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const admin = adminFake({ stripe_customer_id: "cus_autre", stripe_subscription_id: "sub_ancienne" });
    deps.createAdminClient.mockReturnValue(admin);
    const reponse = await POST(request(evenementSubscription("customer.subscription.created", "sub_nouvelle")));
    expect(reponse.status).toBe(422);
    expect(admin.appels.some((a) => a.fn === "relier_subscription_reabonnement_service")).toBe(false);
  });

  it.each([
    ["remplacee", "subscription_remplacee"],
    ["terminale_ignoree", "subscription_terminale_non_rattachee"],
  ])("rattachement « %s » : 200, journal sans effet (%s), aucune synchronisation ni réconciliation", async (issue, motif) => {
    const admin = adminFake({ stripe_customer_id: "cus_reprise", stripe_subscription_id: "sub_nouvelle", relier: { data: issue } });
    deps.createAdminClient.mockReturnValue(admin);
    const reponse = await POST(request(evenementSubscription("customer.subscription.deleted", "sub_ancienne")));
    expect(reponse.status).toBe(200);
    expect(admin.appels.some((a) => a.fn === "synchroniser_abonnement_stripe_ordonne_service")).toBe(false);
    expect(admin.appels.find((a) => a.fn === "journaliser_evenement_stripe_ordre_service")?.args).toMatchObject({ p_motif: motif });
    expect(deps.reconcilierCapacitePersonnesStripe).not.toHaveBeenCalled();
    expect(admin.appels.find((a) => a.fn === "finaliser_evenement_abonnement_service")?.args).toMatchObject({ p_statut_resultant: null });
  });

  it("checkout.session.completed d'une subscription ignorée : aucune réconciliation de comptes", async () => {
    const admin = adminFake({ stripe_customer_id: "cus_reprise", stripe_subscription_id: "sub_nouvelle", relier: { data: "remplacee" } });
    deps.createAdminClient.mockReturnValue(admin);
    const reponse = await POST(request({
      id: "evt_cs", type: "checkout.session.completed", livemode: false, created: 1_790_000_000,
      data: { object: { id: "cs_1", object: "checkout.session", mode: "subscription", customer: "cus_reprise", subscription: "sub_ancienne", metadata: { entreprise_id: ENTREPRISE } } },
    }));
    expect(reponse.status).toBe(200);
    expect(deps.reconcilierAbonnementStripe).not.toHaveBeenCalled();
  });
});

describe("invoice.* filtré par subscription", () => {
  it.each([
    ["invoice.subscription", { subscription: "sub_nouvelle" }],
    ["parent.subscription_details (API récente)", { parent: { subscription_details: { subscription: "sub_nouvelle" } } }],
  ])("la subscription de la facture est transmise à la RPC v2 (%s)", async (_l, champ) => {
    const admin = adminFake({ stripe_customer_id: "cus_reprise", stripe_subscription_id: "sub_nouvelle" });
    deps.createAdminClient.mockReturnValue(admin);
    const reponse = await POST(request(evenementFacture("invoice.paid", champ)));
    expect(reponse.status).toBe(200);
    expect(admin.appels.find((a) => a.fn === "appliquer_evenement_facture_abonnement_v2_service")?.args).toMatchObject({ p_stripe_subscription_id: "sub_nouvelle" });
  });

  it("facture d'une subscription pas encore rattachée : 503 rejouable (Retry-After), réservation annulée, pas de 500", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const admin = adminFake({ stripe_customer_id: "cus_reprise", stripe_subscription_id: "sub_ancienne", facture: { decision: "differe", motif: "subscription_non_rattachee", statut_resultant: "annule", notifier_echec: false } });
    deps.createAdminClient.mockReturnValue(admin);
    const reponse = await POST(request(evenementFacture("invoice.paid", { subscription: "sub_nouvelle" })));
    expect(reponse.status).toBe(503);
    expect(reponse.headers.get("Retry-After")).toBe("30");
    expect(admin.appels.some((a) => a.fn === "annuler_evenement_abonnement_service")).toBe(true);
    expect(admin.appels.some((a) => a.fn === "finaliser_evenement_abonnement_service")).toBe(false);
  });

  it("invoice.payment_failed d'une subscription remplacée : 200, sans effet, AUCUN e-mail d'échec", async () => {
    const notifications = await import("@/lib/abonnement-notifications");
    const admin = adminFake({ stripe_customer_id: "cus_reprise", stripe_subscription_id: "sub_nouvelle", facture: { decision: "sans_effet", motif: "subscription_remplacee", statut_resultant: "actif", notifier_echec: false } });
    deps.createAdminClient.mockReturnValue(admin);
    const reponse = await POST(request(evenementFacture("invoice.payment_failed", { subscription: "sub_ancienne" })));
    expect(reponse.status).toBe(200);
    expect(notifications.notifierPaiementAbonnementEchoue).not.toHaveBeenCalled();
    expect(admin.appels.find((a) => a.fn === "finaliser_evenement_abonnement_service")?.args).toMatchObject({ p_statut_resultant: "actif" });
  });

  it("invoice.created d'une subscription non courante : aucune ligne de dépassement ajoutée", async () => {
    const admin = adminFake({ stripe_customer_id: "cus_reprise", stripe_subscription_id: "sub_nouvelle" });
    deps.createAdminClient.mockReturnValue(admin);
    const reponse = await POST(request(evenementFacture("invoice.created", { subscription: "sub_ancienne" })));
    expect(reponse.status).toBe(200);
    expect(deps.ajouterDepassementAppareilsFacture).not.toHaveBeenCalled();
    expect(deps.ajouterDepassementStockageFacture).not.toHaveBeenCalled();
    expect(admin.appels.find((a) => a.fn === "journaliser_evenement_stripe_ordre_service")?.args).toMatchObject({ p_motif: "subscription_non_courante" });
  });

  it("invoice.created de la subscription courante : dépassements facturés comme avant", async () => {
    const admin = adminFake({ stripe_customer_id: "cus_reprise", stripe_subscription_id: "sub_nouvelle" });
    deps.createAdminClient.mockReturnValue(admin);
    const reponse = await POST(request(evenementFacture("invoice.created", { subscription: "sub_nouvelle" })));
    expect(reponse.status).toBe(200);
    expect(deps.ajouterDepassementStockageFacture).toHaveBeenCalledTimes(1);
  });
});
