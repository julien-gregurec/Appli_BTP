// ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1 — B-3 : chemin webhook réel
// (synchroniserAbonnementCoordonne) après un changement d'offre par le Portail
// Stripe : la RPC ordonnée reçoit l'offre FACTURÉE, pas la metadata du Checkout.
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ recupererAbonnementStripe: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/stripe-abonnement", async () => {
  const reel = await vi.importActual<typeof import("@/lib/stripe-abonnement")>("@/lib/stripe-abonnement");
  return { ...reel, recupererAbonnementStripe: deps.recupererAbonnementStripe };
});
vi.mock("@/lib/stripe-discount-gateway", () => ({ passerelleStripeRemise: {} }));
vi.mock("@/lib/stripe-discount-server", () => ({
  acquerirVerrouRemise: vi.fn(async () => "verrou"),
  libererVerrouRemise: vi.fn(async () => undefined),
  lireOperationActiveRemiseServeur: vi.fn(async () => null),
  reconcilierOperationRemiseSousVerrou: vi.fn(),
  synchroniserExpirationRemiseSousVerrou: vi.fn(async () => false),
  VerrouRemiseOccupe: class extends Error {},
}));

import { synchroniserAbonnementCoordonne, type SupabaseAdmin } from "./stripe-abonnement-synchronisation";

function adminFactice() {
  const appels: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_subscription_id: "sub_1" }, error: null }) }) }) }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      appels.push({ fn, args });
      if (fn === "relier_subscription_reabonnement_service") return { data: "deja_lie", error: null };
      return { data: { decision: "applique", statut_resultant: "actif" }, error: null };
    },
  };
  return { admin: admin as unknown as SupabaseAdmin, appels };
}

const evenement = { id: "evt_portal_1", type: "customer.subscription.updated", created: 1_790_000_000, objetType: "subscription", objetId: "sub_1" };

describe("webhook : changement d'offre par le Portail Stripe", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("STRIPE_PRICE_MINI_MENSUEL", "price_mini_m");
    vi.stubEnv("STRIPE_PRICE_BUSINESS_MENSUEL", "price_business_m");
    vi.stubEnv("STRIPE_PRICE_BUSINESS_ANNUEL", "price_business_a");
  });

  it("Mini → Business annuel : la RPC reçoit business/annuel (metadata restée mini/mensuel)", async () => {
    deps.recupererAbonnementStripe.mockResolvedValue({
      id: "sub_1", customer: "cus_1", status: "active", current_period_end: 1_792_000_000,
      metadata: { entreprise_id: "e", offre: "mini", periodicite: "mensuel" },
      items: { data: [{ id: "si_1", price: { id: "price_business_a" } }] },
    });
    const { admin, appels } = adminFactice();
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(synchroniserAbonnementCoordonne(admin, "e", "sub_1", evenement)).resolves.toBe("actif");
    const sync = appels.find((a) => a.fn === "synchroniser_abonnement_stripe_ordonne_service");
    expect(sync?.args).toMatchObject({ p_offre: "business", p_periodicite: "annuel", p_statut: "actif" });
    expect(avertissement).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ categorie: "offre_metadata_divergente" }));
    avertissement.mockRestore();
  });

  it("Checkout nominal : aucune divergence, offre de la metadata = offre du Price", async () => {
    deps.recupererAbonnementStripe.mockResolvedValue({
      id: "sub_1", customer: "cus_1", status: "trialing",
      metadata: { offre: "mini", periodicite: "mensuel" },
      items: { data: [{ id: "si_1", price: { id: "price_mini_m" } }] },
    });
    const { admin, appels } = adminFactice();
    await synchroniserAbonnementCoordonne(admin, "e", "sub_1", evenement);
    expect(appels.find((a) => a.fn === "synchroniser_abonnement_stripe_ordonne_service")?.args)
      .toMatchObject({ p_offre: "mini", p_periodicite: "mensuel", p_statut: "essai" });
  });
});
