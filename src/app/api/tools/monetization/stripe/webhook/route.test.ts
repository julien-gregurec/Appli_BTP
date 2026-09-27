import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ELSATIA-STRIPE-EVENT-ORDERING-REPLAY-HARDENING-V1 — webhook Stripe Tools.
// Avant : un `customer.subscription.*` appliquait le payload tel quel (instantané
// potentiellement ancien) ; un vieux `updated` (active) livré après `deleted`
// ré-octroyait Tools Pro. Désormais l'abonnement est toujours relu chez Stripe
// et appliqué par `tools_server_appliquer_abonnement_ordonne` (event.created).

const deps = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  retrieveSubscription: vi.fn(),
  reserve: vi.fn(),
  fail: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({ verifierSignatureStripe: () => true }));
vi.mock("@/lib/tools-monetization", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tools-monetization")>();
  return {
    ...original,
    reserveToolsMonetizationEvent: deps.reserve,
    failToolsMonetizationEvent: deps.fail,
    retrieveToolsStripeSubscription: deps.retrieveSubscription,
    retrieveToolsStripeInvoice: vi.fn(),
  };
});

const { POST } = await import("./route");

const USER = "10000000-0000-0000-0000-000000000001";
const CREATED = 1_757_060_000;

function adminFactice() {
  const chaine = { eq: () => chaine };
  return {
    rpc: deps.rpc,
    from: () => ({
      update: (valeurs: unknown) => { deps.update(valeurs); return chaine; },
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
    }),
  };
}

function abonnement(status: string) {
  return {
    id: "sub_tools_1", customer: "cus_tools_1", status, cancel_at_period_end: false,
    metadata: { elsatia_user_id: USER },
    items: { data: [{ price: { id: "price_tools_monthly_placeholder" }, current_period_start: CREATED, current_period_end: CREATED + 2_592_000 }] },
  };
}

function requete(evenement: Record<string, unknown>) {
  return new Request("https://exemple.test/api/tools/monetization/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "t=1,v1=signature" }, body: JSON.stringify(evenement),
  });
}

function evenementAbonnement(id: string, type: string, payloadStatus: string, created: number | null = CREATED) {
  return { id, type, livemode: false, ...(created === null ? {} : { created }), data: { object: { ...abonnement(payloadStatus), object: "subscription" } } };
}

beforeEach(() => {
  vi.stubEnv("STRIPE_TOOLS_SECRET_KEY", "sk_test_placeholder");
  vi.stubEnv("STRIPE_TOOLS_WEBHOOK_SECRET", "whsec_placeholder");
  vi.stubEnv("STRIPE_TOOLS_PRICE_MONTHLY", "price_tools_monthly_placeholder");
  vi.stubEnv("STRIPE_TOOLS_PRICE_ANNUAL", "price_tools_annual_placeholder");
  deps.reserve.mockResolvedValue({ duplicate: false, admin: adminFactice() });
  deps.rpc.mockResolvedValue({ data: { decision: "applique", subscription_id: "row-1" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("webhook Stripe Tools — ordre et rejeu", () => {
  it("relit TOUJOURS l'abonnement chez Stripe au lieu d'appliquer le payload", async () => {
    deps.retrieveSubscription.mockResolvedValue(abonnement("canceled"));
    const reponse = await POST(requete(evenementAbonnement("evt_t1", "customer.subscription.updated", "active")));
    expect(reponse.status).toBe(200);
    expect(deps.retrieveSubscription).toHaveBeenCalledWith("sub_tools_1");
    const [fn, args] = deps.rpc.mock.calls[0];
    expect(fn).toBe("tools_server_appliquer_abonnement_ordonne");
    // Statut relu (canceled → expired), pas celui du payload ancien (active).
    expect(args.p_payload.status).toBe("expired");
    expect(args.p_stripe_event_created).toBe(new Date(CREATED * 1000).toISOString());
  });

  it("un événement périmé est marqué « ignored » sans échec ni rejeu", async () => {
    deps.retrieveSubscription.mockResolvedValue(abonnement("active"));
    deps.rpc.mockResolvedValue({ data: { decision: "perime", subscription_id: "row-1" }, error: null });
    const reponse = await POST(requete(evenementAbonnement("evt_old", "customer.subscription.updated", "active", CREATED - 3600)));
    expect(reponse.status).toBe(200);
    expect(deps.update).toHaveBeenCalledWith(expect.objectContaining({ status: "ignored", after_state: expect.objectContaining({ ordre: "perime" }) }));
    expect(deps.fail).not.toHaveBeenCalled();
  });

  it("un doublon n'est pas retraité", async () => {
    deps.reserve.mockResolvedValue({ duplicate: true });
    const reponse = await POST(requete(evenementAbonnement("evt_dup", "customer.subscription.updated", "active")));
    expect(await reponse.json()).toEqual({ received: true, duplicate: true });
    expect(deps.rpc).not.toHaveBeenCalled();
    expect(deps.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("refuse un événement sans event.created avant tout journal", async () => {
    const reponse = await POST(requete(evenementAbonnement("evt_nc", "customer.subscription.updated", "active", null)));
    expect(reponse.status).toBe(400);
    expect(deps.reserve).not.toHaveBeenCalled();
  });

  it("un échec de la RPC ordonnée marque l'événement « failed » (rejouable) et renvoie 500", async () => {
    deps.retrieveSubscription.mockResolvedValue(abonnement("active"));
    deps.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const reponse = await POST(requete(evenementAbonnement("evt_err", "customer.subscription.updated", "active")));
    expect(reponse.status).toBe(500);
    expect(deps.fail).toHaveBeenCalledWith(expect.objectContaining({ externalEventId: "evt_err" }));
  });
});
