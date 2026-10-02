// Stripe readiness — train canonique V9 (P2, P3, P4, P5) :
// docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_CONVERGENCE_V1.md §5.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  recupererAbonnementStripe: vi.fn(),
  reconcilierOperationRemiseSousVerrou: vi.fn(),
  synchroniserExpirationRemiseSousVerrou: vi.fn(async () => false),
  lireOperationActiveRemiseServeur: vi.fn(async () => ({ id: "op_1" })),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/stripe-abonnement", async () => {
  const reel = await vi.importActual<typeof import("@/lib/stripe-abonnement")>("@/lib/stripe-abonnement");
  return { ...reel, recupererAbonnementStripe: deps.recupererAbonnementStripe };
});
vi.mock("@/lib/stripe-discount-gateway", () => ({ passerelleStripeRemise: {} }));
vi.mock("@/lib/stripe-discount-server", () => ({
  acquerirVerrouRemise: vi.fn(async () => "verrou"),
  libererVerrouRemise: vi.fn(async () => undefined),
  lireOperationActiveRemiseServeur: deps.lireOperationActiveRemiseServeur,
  reconcilierOperationRemiseSousVerrou: deps.reconcilierOperationRemiseSousVerrou,
  synchroniserExpirationRemiseSousVerrou: deps.synchroniserExpirationRemiseSousVerrou,
  VerrouRemiseOccupe: class extends Error {},
}));

import { periodeFacturationSubscription, rapprocherAbonnementLectureSeule, synchroniserAbonnementCoordonne, type SupabaseAdmin } from "./stripe-abonnement-synchronisation";
import {
  abonnementsPublicsOuverts,
  CHAMPS_VENDEUR_FACTURE_LIVE,
  facturationFinaleAutorisee,
  MENTION_STRIPE_TEST,
  modeStripeCommercial,
  piedDeFactureAbonnement,
  prerequisLiveManquants,
} from "./commercialisation-abonnements";
import { IDENTITE_VENDEUR } from "./identite-vendeur";

function adminFactice() {
  const appels: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { stripe_subscription_id: "sub_1" }, error: null }) }) }) }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      appels.push({ fn, args });
      if (fn === "relier_subscription_reabonnement_service") return { data: "deja_lie", error: null };
      return { data: { decision: "applique", statut_resultant: "suspendu" }, error: null };
    },
  };
  return { admin: admin as unknown as SupabaseAdmin, appels };
}

const T = 1_790_000_000;
const basil = {
  id: "sub_1", customer: "cus_1", status: "active",
  metadata: { offre: "mini", periodicite: "mensuel" },
  // API 2025-03-31 (basil) : plus de current_period_* au niveau subscription.
  items: { data: [{ id: "si_1", price: { id: "price_mini_m" }, current_period_start: T, current_period_end: T + 30 * 86_400 }] },
};

describe("P4 — période lue sur les lignes (API Stripe basil)", () => {
  beforeEach(() => vi.stubEnv("STRIPE_PRICE_MINI_MENSUEL", "price_mini_m"));
  afterEach(() => vi.unstubAllEnvs());

  it("repli sur la ligne quand la subscription ne porte plus la période", () => {
    expect(periodeFacturationSubscription(basil)).toEqual({ debut: T, fin: T + 30 * 86_400 });
  });

  it("le niveau subscription (API antérieures) reste prioritaire", () => {
    expect(periodeFacturationSubscription({ ...basil, current_period_start: 1, current_period_end: 2 })).toEqual({ debut: 1, fin: 2 });
    expect(periodeFacturationSubscription({ items: { data: [] } })).toEqual({ debut: null, fin: null });
  });

  it("la RPC ordonnée reçoit échéance, période et annulation programmée en basil (null avant P4)", async () => {
    deps.recupererAbonnementStripe.mockResolvedValue({ ...basil, cancel_at_period_end: true });
    deps.lireOperationActiveRemiseServeur.mockResolvedValueOnce(null as never);
    const { admin, appels } = adminFactice();
    await synchroniserAbonnementCoordonne(admin, "e", "sub_1", { id: "evt_1", type: "customer.subscription.updated", created: T, objetType: "subscription", objetId: "sub_1" });
    const fin = new Date((T + 30 * 86_400) * 1000).toISOString();
    expect(appels.find((a) => a.fn === "synchroniser_abonnement_stripe_ordonne_service")?.args).toMatchObject({
      p_echeance: fin.slice(0, 10),
      p_debut_periode: new Date(T * 1000).toISOString(),
      p_fin_periode: fin,
      p_annulation_prevue_at: fin,
    });
  });
});

describe("P5 — relecture de rapprochement en lecture seule", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRIPE_PRICE_MINI_MENSUEL", "price_mini_m"); });
  afterEach(() => vi.unstubAllEnvs());

  it("passe par la RPC ordonnée sans jamais exécuter la chaîne remise (qui écrit chez Stripe)", async () => {
    deps.recupererAbonnementStripe.mockResolvedValue({ ...basil, status: "past_due" });
    const { admin, appels } = adminFactice();
    const evenement = { id: "rapprochement:sub_1:2026-11-01", type: "rapprochement.subscription", created: T, objetType: "subscription", objetId: "sub_1" };
    await expect(rapprocherAbonnementLectureSeule(admin, "e", "sub_1", evenement)).resolves.toBe("suspendu");
    expect(appels.map((a) => a.fn)).toEqual(["relier_subscription_reabonnement_service", "synchroniser_abonnement_stripe_ordonne_service"]);
    expect(appels[1].args).toMatchObject({ p_statut: "suspendu", p_stripe_event_id: evenement.id, p_stripe_event_type: "rapprochement.subscription" });
    expect(deps.lireOperationActiveRemiseServeur).not.toHaveBeenCalled();
    expect(deps.reconcilierOperationRemiseSousVerrou).not.toHaveBeenCalled();
    expect(deps.synchroniserExpirationRemiseSousVerrou).not.toHaveBeenCalled();
  });
});

describe("P3 / P2 — verrou unique d'ouverture et garde Live", () => {
  it("mode Stripe lu sur le préfixe de la clé, fail-closed vers Live", () => {
    expect(modeStripeCommercial({})).toBe("absent");
    expect(modeStripeCommercial({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe("test");
    expect(modeStripeCommercial({ STRIPE_SECRET_KEY: "rk_test_x" })).toBe("test");
    expect(modeStripeCommercial({ STRIPE_SECRET_KEY: "sk_live_x" })).toBe("live");
    expect(modeStripeCommercial({ STRIPE_SECRET_KEY: "cle-inconnue" })).toBe("live");
    expect(modeStripeCommercial({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_EXPECTED_MODE: "live" })).toBe("live");
  });

  it("Stripe Test : la qualification s'ouvre par ABONNEMENTS_PUBLICS_OUVERTS seul", () => {
    expect(abonnementsPublicsOuverts({ STRIPE_SECRET_KEY: "sk_test_x", ABONNEMENTS_PUBLICS_OUVERTS: "true" })).toBe(true);
    expect(abonnementsPublicsOuverts({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe(false);
  });

  it("Stripe Live : fermé tant que les prérequis légaux ne sont pas confirmés (état actuel du dépôt)", () => {
    const live = {
      STRIPE_SECRET_KEY: "sk_live_x", ABONNEMENTS_PUBLICS_OUVERTS: "true",
      ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE: "true", LEGAL_TVA_REGIME_CONFIRME: "true",
    };
    // L'adresse du vendeur est DECISION_REQUIRED dans IDENTITE_VENDEUR : le Live reste fermé.
    expect(IDENTITE_VENDEUR.adresse.statut).toBe("DECISION_REQUIRED");
    expect(prerequisLiveManquants(live)).toEqual(["identite_vendeur:adresse"]);
    expect(abonnementsPublicsOuverts(live)).toBe(false);
    expect(facturationFinaleAutorisee(live)).toBe(false);
    expect(prerequisLiveManquants({ STRIPE_SECRET_KEY: "sk_live_x" })).toEqual([
      "ouverture_live_non_confirmee", "regime_tva_non_confirme", "identite_vendeur:adresse",
    ]);
  });

  it("ni le numéro de TVA affiché ni la taxe automatique ne valent confirmation du régime", () => {
    expect(prerequisLiveManquants({ NEXT_PUBLIC_LEGAL_TVA: "FR00123456789", STRIPE_AUTOMATIC_TAX_ENABLED: "true" }))
      .toContain("regime_tva_non_confirme");
  });

  it("identité vendeur : source unique, aucune variable LIRIA_*", () => {
    expect(CHAMPS_VENDEUR_FACTURE_LIVE.every((champ) => champ in IDENTITE_VENDEUR)).toBe(true);
    expect(prerequisLiveManquants({ LIRIA_VENDEUR_ADRESSE: "1 rue X", ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE: "true", LEGAL_TVA_REGIME_CONFIRME: "true" }))
      .toEqual(["identite_vendeur:adresse"]);
  });

  it("pied de facture : informations prouvées seulement, mention Test hors Live, TVA seulement confirmée", () => {
    const test = piedDeFactureAbonnement({ STRIPE_SECRET_KEY: "sk_test_x", NEXT_PUBLIC_LEGAL_TVA: "FR00123456789" });
    expect(test.split("\n")[0]).toBe(MENTION_STRIPE_TEST);
    expect(test).toContain("ELSATIA");
    expect(test).toContain("SIRET 850 559 873 00011");
    expect(test).not.toContain("TVA");
    expect(test).not.toMatch(/undefined|null/);
    const live = piedDeFactureAbonnement({ STRIPE_SECRET_KEY: "sk_live_x", NEXT_PUBLIC_LEGAL_TVA: "FR00123456789", LEGAL_TVA_REGIME_CONFIRME: "true" });
    expect(live).not.toContain(MENTION_STRIPE_TEST);
    expect(live).toContain("TVA intracommunautaire : FR00123456789");
  });
});
