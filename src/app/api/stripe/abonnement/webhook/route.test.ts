import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  recupererAbonnementStripe: vi.fn(),
  synchroniserExpirationRemiseSousVerrou: vi.fn(async () => null),
  statutAbonnementDepuisStripe: vi.fn(() => "actif"),
  reconcilierAbonnementStripe: vi.fn(),
  ajouterDepassementAppareilsFacture: vi.fn(),
  ajouterDepassementStockageFacture: vi.fn(),
  calculerDepassementAppareils: vi.fn(),
  acquerirVerrouRemise: vi.fn(async () => "verrou-test"),
  libererVerrouRemise: vi.fn(),
  lireOperationActiveRemiseServeur: vi.fn(async () => null),
  reconcilierOperationRemiseSousVerrou: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.createAdminClient }));
vi.mock("@/lib/stripe-abonnement", () => ({
  recupererAbonnementStripe: deps.recupererAbonnementStripe,
  statutAbonnementDepuisStripe: deps.statutAbonnementDepuisStripe,
  reconcilierAbonnementStripe: deps.reconcilierAbonnementStripe,
  ajouterDepassementAppareilsFacture: deps.ajouterDepassementAppareilsFacture,
  ajouterDepassementStockageFacture: deps.ajouterDepassementStockageFacture,
  calculerDepassementAppareils: deps.calculerDepassementAppareils,
  appliquerCouponAbonnement: vi.fn(), couponActifDepuisAbonnement: vi.fn(), creerCouponRemise: vi.fn(), retirerCouponAbonnement: vi.fn(),
}));
vi.mock("@/lib/stripe-discount-server", () => ({
  acquerirVerrouRemise: deps.acquerirVerrouRemise,
  libererVerrouRemise: deps.libererVerrouRemise,
  lireOperationActiveRemiseServeur: deps.lireOperationActiveRemiseServeur,
  reconcilierOperationRemiseSousVerrou: deps.reconcilierOperationRemiseSousVerrou,
  synchroniserExpirationRemiseSousVerrou: deps.synchroniserExpirationRemiseSousVerrou,
}));

const { POST, synchroniserAbonnementCoordonne } = await import("./route");
const SECRET = "whsec_test_uniquement";
const ENTREPRISE = "11111111-1111-4111-8111-111111111111";

function adminFake(options: { duplicate?: boolean } = {}) {
  const appels: Array<{ table: string; methode: string; donnees?: unknown }> = [];
  const admin = {
    appels,
    from(table: string) {
      let methode = "";
      const q: Record<string, unknown> = {};
      q.select = () => { methode = "select"; return q; };
      q.eq = () => methode === "update" || methode === "delete" ? Promise.resolve({ error: null }) : q;
      q.maybeSingle = async () => ({ data: { id: ENTREPRISE, stripe_customer_id: "cus_test", stripe_subscription_id: "sub_test" }, error: null });
      q.insert = async (donnees: unknown) => { appels.push({ table, methode: "insert", donnees }); return { error: options.duplicate ? { code: "23505" } : null }; };
      q.update = (donnees: unknown) => { methode = "update"; appels.push({ table, methode, donnees }); return q; };
      q.delete = () => { methode = "delete"; appels.push({ table, methode }); return q; };
      q.upsert = async (donnees: unknown) => { appels.push({ table, methode: "upsert", donnees }); return { error: null }; };
      return q;
    },
  };
  return admin;
}

function event(params: { livemode: boolean; type?: string; account?: string; id?: string }) {
  return {
    id: params.id ?? "evt_test",
    type: params.type ?? "webhook.test",
    livemode: params.livemode,
    ...(params.account ? { account: params.account } : {}),
    data: { object: { id: "sub_test", object: "subscription", customer: "cus_test", metadata: { entreprise_id: ENTREPRISE } } },
  };
}

function request(payload: object, secret = SECRET) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now()/1000);
  const signature = createHmac("sha256",secret).update(`${timestamp}.${body}`).digest("hex");
  return new Request("https://example.invalid/api/stripe/abonnement/webhook", { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body });
}

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_ABONNEMENT_SECRET",SECRET);
  vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE","test");
  const admin = adminFake(); deps.createAdminClient.mockReturnValue(admin);
  deps.recupererAbonnementStripe.mockResolvedValue({ id: "sub_test", customer: "cus_test", status: "active", discounts: [], metadata: {} });
  deps.lireOperationActiveRemiseServeur.mockResolvedValue(null);
});

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("barrière environnement avant Supabase", () => {
  it("ignore Test reçu par Live en 200 sans Supabase", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE","live"); vi.spyOn(console,"warn").mockImplementation(() => undefined);
    const response = await POST(request(event({ livemode:false })));
    expect(response.status).toBe(200); expect(deps.createAdminClient).not.toHaveBeenCalled();
  });
  it("refuse Live reçu par Test en 503 sans Supabase", async () => {
    vi.spyOn(console,"warn").mockImplementation(() => undefined);
    const response = await POST(request(event({ livemode:true })));
    expect(response.status).toBe(503); expect(deps.createAdminClient).not.toHaveBeenCalled();
  });
  it.each([undefined,"","preview"])("refuse un mode %s sans Supabase", async (mode) => {
    if (mode === undefined) vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE",undefined); else vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE",mode);
    vi.spyOn(console,"error").mockImplementation(() => undefined);
    const response = await POST(request(event({ livemode:false })));
    expect(response.status).toBe(503); expect(deps.createAdminClient).not.toHaveBeenCalled();
  });
  it("refuse une signature invalide sans Supabase", async () => {
    const response = await POST(request(event({ livemode:false }),"autre-secret"));
    expect(response.status).toBe(400); expect(deps.createAdminClient).not.toHaveBeenCalled();
  });
  it("refuse Connect avant toute écriture", async () => {
    const response = await POST(request(event({ livemode:false,account:"acct_connect" })));
    expect(response.status).toBe(400);
    expect((deps.createAdminClient.mock.results[0]?.value as ReturnType<typeof adminFake>)?.appels ?? []).toHaveLength(0);
  });
  it("refuse un événement incomplet avant Supabase", async () => {
    const response = await POST(request({ id: "evt_incomplet", type: "webhook.test", livemode: false, data: {} }));
    expect(response.status).toBe(400);
    expect(deps.createAdminClient).not.toHaveBeenCalled();
  });
  it("permet un événement signé du bon mode", async () => {
    const response = await POST(request(event({ livemode:false })));
    expect(response.status).toBe(200); expect(deps.createAdminClient).toHaveBeenCalledOnce();
  });
});

describe("coordination webhook et saga", () => {
  it("relit Stripe et ignore le payload ancien", async () => {
    const admin = adminFake();
    const actuel = { id:"sub_test",customer:"cus_test",status:"active",discounts:[{source:{coupon:{id:"coupon-actuel"}}}],metadata:{} };
    deps.recupererAbonnementStripe.mockResolvedValue(actuel);
    await synchroniserAbonnementCoordonne(admin as never,ENTREPRISE,"sub_test","evt_ancien");
    expect(deps.synchroniserExpirationRemiseSousVerrou).toHaveBeenCalledWith(admin,ENTREPRISE,actuel,"verrou-test",expect.any(Object));
    expect(deps.acquerirVerrouRemise).toHaveBeenCalledWith(admin,"sub_test",expect.stringMatching(/^webhook:/));
    expect(deps.libererVerrouRemise).toHaveBeenCalledWith(admin,"sub_test","verrou-test");
  });
  it("réconcilie la saga active sous le même verrou puis relit Stripe", async () => {
    const admin = adminFake(); const op = { id:"op-1",stripe_subscription_id:"sub_test" };
    deps.lireOperationActiveRemiseServeur.mockResolvedValue(op as never);
    await synchroniserAbonnementCoordonne(admin as never,ENTREPRISE,"sub_test","evt_saga");
    expect(deps.reconcilierOperationRemiseSousVerrou).toHaveBeenCalledWith(admin,op,"verrou-test",expect.any(Object));
    expect(deps.recupererAbonnementStripe).toHaveBeenCalledTimes(2);
  });
  it.each(["pending", "stripe_in_progress", "stripe_applied", "database_finalization_pending"])(
    "coordonne une saga active au statut %s",
    async (statut) => {
      const admin = adminFake();
      const op = { id: `op-${statut}`, stripe_subscription_id: "sub_test", statut };
      deps.lireOperationActiveRemiseServeur.mockResolvedValueOnce(op as never);
      await synchroniserAbonnementCoordonne(admin as never, ENTREPRISE, "sub_test", `evt-${statut}`);
      expect(deps.reconcilierOperationRemiseSousVerrou).toHaveBeenCalledWith(admin, op, "verrou-test", expect.any(Object));
      expect(deps.libererVerrouRemise).toHaveBeenCalledWith(admin, "sub_test", "verrou-test");
    },
  );
  it("deux événements désordonnés convergent tous deux vers la relecture Stripe actuelle", async () => {
    const admin = adminFake();
    const actuel = { id: "sub_test", customer: "cus_test", status: "active", discounts: [], metadata: {} };
    deps.recupererAbonnementStripe.mockResolvedValue(actuel);
    await synchroniserAbonnementCoordonne(admin as never, ENTREPRISE, "sub_test", "evt_recent");
    await synchroniserAbonnementCoordonne(admin as never, ENTREPRISE, "sub_test", "evt_ancien_livre_apres");
    expect(deps.recupererAbonnementStripe).toHaveBeenCalledTimes(2);
    expect(deps.synchroniserExpirationRemiseSousVerrou).toHaveBeenNthCalledWith(1, admin, ENTREPRISE, actuel, "verrou-test", expect.any(Object));
    expect(deps.synchroniserExpirationRemiseSousVerrou).toHaveBeenNthCalledWith(2, admin, ENTREPRISE, actuel, "verrou-test", expect.any(Object));
  });
  it("verrouille l'abonnement réellement ciblé, sans interférence avec un autre", async () => {
    const admin = adminFake();
    await synchroniserAbonnementCoordonne(admin as never, ENTREPRISE, "sub_autre", "evt_autre");
    expect(deps.acquerirVerrouRemise).toHaveBeenCalledWith(admin, "sub_autre", expect.stringMatching(/^webhook:/));
    expect(deps.lireOperationActiveRemiseServeur).toHaveBeenCalledWith(admin, "sub_autre", "verrou-test");
  });
  it("un événement dupliqué ne prend aucun verrou", async () => {
    const admin = adminFake({ duplicate:true }); deps.createAdminClient.mockReturnValue(admin);
    const response = await POST(request(event({ livemode:false,type:"customer.subscription.updated" })));
    expect(response.status).toBe(200); expect(deps.acquerirVerrouRemise).not.toHaveBeenCalled();
  });
  it("libère le verrou même si Stripe est indisponible", async () => {
    const admin = adminFake(); deps.recupererAbonnementStripe.mockRejectedValue(new Error("indisponible"));
    await expect(synchroniserAbonnementCoordonne(admin as never,ENTREPRISE,"sub_test","evt_timeout")).rejects.toThrow();
    expect(deps.libererVerrouRemise).toHaveBeenCalledWith(admin,"sub_test","verrou-test");
  });
});
