import { beforeEach, describe, expect, it, vi } from "vitest";

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
  deps.insert.mockResolvedValue({ error: null });
  deps.rpc.mockResolvedValue({ data: "encaissee", error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
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
    expect(deps.rpc).not.toHaveBeenCalled();
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

  it("met toujours à jour l'onboarding Connect par les droits colonne d'entreprises", async () => {
    await POST(requete({ id: "evt_3", type: "account.updated", livemode: false, data: { object: { id: "acct_1", charges_enabled: true, details_submitted: true } } }));
    expect(deps.update).toHaveBeenCalledWith("entreprises", { stripe_onboarding_complete: true }, "stripe_account_id", "acct_1");
  });
});
