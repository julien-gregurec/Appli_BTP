import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 : après la migration 255, service_role ne lit ni n'écrit plus
// factures/paiements. Le webhook Connect passe par des RPC de service et ne doit plus avaler une
// panne en silence.

const deps = vi.hoisted(() => ({
  insert: vi.fn(),
  rpc: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({ verifierSignatureStripe: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === "stripe_webhook_events"
      ? { insert: deps.insert }
      : { update: (valeurs: unknown) => ({ eq: (colonne: string, valeur: unknown) => deps.update(table, valeurs, colonne, valeur) }) }),
    rpc: deps.rpc,
  }),
}));

const { POST } = await import("./route");

const FACTURE = "aa000000-0000-0000-0000-000000000001";
const ENTREPRISE = "a0000000-0000-0000-0000-000000000001";

function requete(evenement: Record<string, unknown>) {
  return new Request("https://exemple.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=signature" },
    body: JSON.stringify(evenement),
  });
}

function paiementReussi(metadata: Record<string, string>) {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    livemode: false,
    account: "acct_1",
    data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", amount_total: 5000, metadata } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
  deps.insert.mockResolvedValue({ error: null });
  deps.rpc.mockResolvedValue({ data: "encaissee", error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("webhook Stripe Connect — contrôle de mode fail-closed", () => {
  it("refuse un événement Live reçu dans un contexte Test, sans appeler aucune RPC", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    const reponse = await POST(requete({ ...paiementReussi({ facture_id: FACTURE, entreprise_id: ENTREPRISE }), livemode: true }));
    expect(reponse.status).toBe(503);
    expect(deps.insert).not.toHaveBeenCalled();
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it("refuse un événement Test reçu dans un contexte Live, sans appeler aucune RPC", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "live");
    const reponse = await POST(requete(paiementReussi({ facture_id: FACTURE, entreprise_id: ENTREPRISE })));
    expect(reponse.status).toBe(503);
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("refuse quand le mode attendu est absent, vide ou invalide — jamais de devinette", async () => {
    for (const valeur of ["", "   ", "prod", "TEST_"]) {
      vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", valeur);
      const reponse = await POST(requete(paiementReussi({ facture_id: FACTURE, entreprise_id: ENTREPRISE })));
      expect(reponse.status).toBe(503);
    }
    expect(deps.rpc).not.toHaveBeenCalled();
  });
});

describe("webhook Stripe Connect des factures clients", () => {
  it("encaisse la facture par la RPC de service avec les contrôles d'origine", async () => {
    const reponse = await POST(requete(paiementReussi({ facture_id: FACTURE, entreprise_id: ENTREPRISE })));
    expect(reponse.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("stripe_connect_encaisser_facture_service", {
      p_facture_id: FACTURE,
      p_entreprise_id: ENTREPRISE,
      p_checkout_id: "cs_1",
      p_compte_stripe: "acct_1",
      p_montant_centimes: 5000,
      p_payment_intent_id: "pi_1",
    });
  });

  it("répond 500 au lieu de réussir en silence si l'encaissement échoue", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    const reponse = await POST(requete(paiementReussi({ facture_id: FACTURE, entreprise_id: ENTREPRISE })));
    expect(reponse.status).toBe(500);
  });

  it("ignore un identifiant de facture qui n'est pas un UUID, comme auparavant", async () => {
    const reponse = await POST(requete(paiementReussi({ facture_id: "pas-un-uuid", entreprise_id: ENTREPRISE })));
    expect(reponse.status).toBe(200);
    // Aucune RPC métier : seule la finalisation de la réservation (migration 20260928000702).
    expect(deps.rpc.mock.calls.map((c) => c[0])).toEqual(["finaliser_evenement_webhook_stripe_service"]);
  });

  it("finalise la réservation après un traitement réussi (plus reprenable comme orpheline)", async () => {
    const reponse = await POST(requete(paiementReussi({ facture_id: FACTURE, entreprise_id: ENTREPRISE })));
    expect(reponse.status).toBe(200);
    expect(deps.rpc).toHaveBeenLastCalledWith("finaliser_evenement_webhook_stripe_service", { p_stripe_event_id: "evt_1" });
  });

  it("ne finalise jamais une réservation dont le traitement a échoué (elle est libérée)", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: { code: "PT503", message: "lecture seule" } });
    const reponse = await POST(requete(paiementReussi({ facture_id: FACTURE, entreprise_id: ENTREPRISE })));
    expect(reponse.status).toBe(500);
    expect(deps.rpc.mock.calls.map((c) => c[0])).not.toContain("finaliser_evenement_webhook_stripe_service");
  });

  it("transmet une entreprise non UUID comme absente (la RPC ignore alors la facture)", async () => {
    await POST(requete(paiementReussi({ facture_id: FACTURE, entreprise_id: "" })));
    expect(deps.rpc).toHaveBeenCalledWith("stripe_connect_encaisser_facture_service", expect.objectContaining({ p_entreprise_id: null }));
  });

  it("expire la session Checkout par la RPC de service", async () => {
    await POST(requete({ id: "evt_2", type: "checkout.session.expired", livemode: false, data: { object: { id: "cs_2", metadata: { facture_id: FACTURE } } } }));
    expect(deps.rpc).toHaveBeenCalledWith("stripe_connect_expirer_checkout_facture_service", { p_facture_id: FACTURE, p_checkout_id: "cs_2" });
  });

  it("n'appelle aucune RPC sur un évènement déjà reçu (23505)", async () => {
    deps.insert.mockResolvedValue({ error: { code: "23505" } });
    const reponse = await POST(requete(paiementReussi({ facture_id: FACTURE, entreprise_id: ENTREPRISE })));
    expect(await reponse.json()).toEqual({ received: true, duplicate: true });
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it("applique account.updated par la RPC ordonnée (event.created), sans UPDATE direct", async () => {
    deps.rpc.mockResolvedValue({ data: "applique", error: null });
    const reponse = await POST(requete({ id: "evt_3", type: "account.updated", livemode: false, created: 1_757_060_000, data: { object: { id: "acct_1", charges_enabled: true, details_submitted: true } } }));
    expect(reponse.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith("stripe_connect_maj_compte_service", {
      p_stripe_account_id: "acct_1",
      p_onboarding_complete: true,
      p_stripe_event_id: "evt_3",
      p_stripe_event_created: new Date(1_757_060_000 * 1000).toISOString(),
    });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("un ancien account.updated périmé répond 200 sans rien réécrire", async () => {
    deps.rpc.mockResolvedValue({ data: "perime", error: null });
    const reponse = await POST(requete({ id: "evt_old", type: "account.updated", livemode: false, created: 1_700_000_000, data: { object: { id: "acct_1", charges_enabled: false, details_submitted: false } } }));
    expect(reponse.status).toBe(200);
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("une erreur de mise à jour du compte n'est plus avalée : 500 et réservation libérée (rejouable)", async () => {
    deps.rpc.mockImplementation(async (fn: string) => fn === "stripe_connect_maj_compte_service"
      ? { data: null, error: { code: "40001" } } : { data: null, error: null });
    const reponse = await POST(requete({ id: "evt_4", type: "account.updated", livemode: false, created: 1_757_060_000, data: { object: { id: "acct_1", charges_enabled: true, details_submitted: true } } }));
    expect(reponse.status).toBe(500);
    expect(deps.rpc).toHaveBeenCalledWith("liberer_evenement_webhook_stripe_service", { p_stripe_event_id: "evt_4" });
  });

  it("D3 : un encaissement en échec libère la réservation pour que la re-livraison soit rejouée", async () => {
    deps.rpc.mockImplementation(async (fn: string) => fn === "stripe_connect_encaisser_facture_service"
      ? { data: null, error: { code: "57014" } } : { data: null, error: null });
    const reponse = await POST(requete(paiementReussi({ facture_id: FACTURE, entreprise_id: ENTREPRISE })));
    expect(reponse.status).toBe(500);
    expect(deps.rpc).toHaveBeenCalledWith("liberer_evenement_webhook_stripe_service", { p_stripe_event_id: "evt_1" });
  });
});
