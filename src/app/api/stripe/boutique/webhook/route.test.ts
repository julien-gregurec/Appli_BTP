import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// P0 de l'audit Boutique — le webhook journalisait `livemode` sans jamais le
// confronter à l'environnement. Un événement Live reçu par un déploiement Test
// finalisait donc une commande comme s'il s'agissait d'un paiement réel, et
// symétriquement. La signature ne protège pas de ce cas : chaque mode a sa
// propre clé, mais un endpoint recâblé au mauvais mode reste correctement signé.

const deps = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  finaliser: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.createAdminClient }));

const SECRET = "whsec_test_boutique";

function clientAdminFactice() {
  return {
    from: () => ({
      insert: vi.fn(async () => ({ error: null })),
      update: () => ({ eq: () => ({ eq: () => ({ eq: vi.fn(async () => ({ error: null })) }) }) }),
    }),
    rpc: deps.finaliser,
  };
}

function requete(evenement: Record<string, unknown>) {
  const corps = JSON.stringify(evenement);
  const horodatage = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", SECRET).update(`${horodatage}.${corps}`).digest("hex");
  return new Request("https://exemple.test/api/stripe/boutique/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${horodatage},v1=${signature}` },
    body: corps,
  });
}

function evenement(livemode: boolean) {
  return {
    id: `evt_${livemode ? "live" : "test"}_1`,
    type: "checkout.session.completed",
    livemode,
    data: { object: { id: "cs_1", payment_status: "paid", metadata: { commande_id: "cmd-1" } } },
  };
}

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_BOUTIQUE_SECRET", SECRET);
  vi.stubEnv("FEATURE_BOUTIQUE_ENABLED", "true");
  deps.finaliser.mockResolvedValue({ error: null });
  deps.createAdminClient.mockReturnValue(clientAdminFactice());
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  deps.finaliser.mockReset();
});

async function poster(evt: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(requete(evt));
}

describe("webhook boutique — contrôle de mode fail-closed", () => {
  it("refuse un événement Live reçu dans un contexte Test, sans rien finaliser", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    const reponse = await poster(evenement(true));
    expect(reponse.status).toBe(503);
    expect(deps.finaliser).not.toHaveBeenCalled();
  });

  it("refuse un événement Test reçu dans un contexte Live, sans rien finaliser", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "live");
    const reponse = await poster(evenement(false));
    expect(reponse.status).toBe(503);
    expect(deps.finaliser).not.toHaveBeenCalled();
  });

  it("refuse quand le mode attendu est absent, vide ou invalide — jamais de devinette", async () => {
    for (const valeur of [undefined, "", "   ", "prod", "TEST_"]) {
      if (valeur === undefined) vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "");
      else vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", valeur);
      const reponse = await poster(evenement(false));
      expect(reponse.status).toBe(503);
    }
    expect(deps.finaliser).not.toHaveBeenCalled();
  });

  it("traite un événement Test dans un contexte Test", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    const reponse = await poster(evenement(false));
    expect(reponse.status).toBe(200);
    expect(deps.finaliser).toHaveBeenCalledWith("boutique_finaliser_commande_payee", {
      p_commande_id: "cmd-1", p_checkout_id: "cs_1",
    });
  });

  it("reste fermé quand la Boutique est désactivée, quel que soit le mode", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "test");
    vi.stubEnv("FEATURE_BOUTIQUE_ENABLED", "");
    const reponse = await poster(evenement(false));
    expect(reponse.status).toBe(404);
    expect(deps.finaliser).not.toHaveBeenCalled();
  });
});
