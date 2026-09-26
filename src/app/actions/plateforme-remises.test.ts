import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  estPlateformeAdmin: vi.fn(async () => true),
  creerCouponRemise: vi.fn(async (params: { duree: string; dureeMois?: number }) => {
    if (params.duree === "repeating" && (!params.dureeMois || params.dureeMois < 1)) {
      throw new Error("Le nombre de mois est obligatoire pour une remise limitée dans le temps");
    }
    return { id: "coupon_test" };
  }),
  appliquerCouponAbonnement: vi.fn(async () => ({})),
  recupererAbonnementStripe: vi.fn(async () => ({ id: "sub_test", customer: "cus_test", status: "active", discounts: [] as Array<{ source?: { coupon?: { id?: string } } }> })),
  couponActifDepuisAbonnement: vi.fn((abonnement: { discounts?: Array<{ source?: { coupon?: { id?: string } } }> }) => abonnement.discounts?.[0]?.source?.coupon?.id ?? null),
  retirerCouponAbonnement: vi.fn(async () => ({})),
  reconcilierOperationRemiseServeur: vi.fn(async () => ({})),
  rpc: vi.fn(async (fonction: string, parametres?: Record<string, unknown>) => {
    void fonction;
    void parametres;
    return { error: null as { message: string } | null };
  }),
  entreprise: { nom: "Entreprise Test", stripe_subscription_id: "sub_test" } as Record<string, unknown> | null,
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));
vi.mock("@/lib/stripe-abonnement", () => ({
  appliquerCouponAbonnement: mocks.appliquerCouponAbonnement,
  creerCouponRemise: mocks.creerCouponRemise,
  retirerCouponAbonnement: mocks.retirerCouponAbonnement,
  recupererAbonnementStripe: mocks.recupererAbonnementStripe,
  couponActifDepuisAbonnement: mocks.couponActifDepuisAbonnement,
  observerRemiseDepuisAbonnement: vi.fn(),
  TYPES_REMISE: ["montant", "pourcentage"],
  DUREES_REMISE: ["once", "repeating", "forever"],
}));
vi.mock("@/lib/stripe-discount-server", () => ({
  reconcilierOperationRemiseServeur: mocks.reconcilierOperationRemiseServeur,
  resoudreAbonnementOperationRemiseServeur: vi.fn(async () => "sub_test"),
}));
function fabriquerClientEntreprises() {
  return {
    from: (table: string) => {
      if (table !== "entreprises") throw new Error(`Table non prévue par ce mock : ${table}`);
      const requete: Record<string, unknown> = {};
      for (const methode of ["select", "eq"]) requete[methode] = () => requete;
      requete.maybeSingle = async () => ({ data: mocks.entreprise, error: null });
      return requete;
    },
    rpc: mocks.rpc,
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fabriquerClientEntreprises()),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => fabriquerClientEntreprises()),
}));

const { appliquerRemiseAction, retirerRemiseAction } = await import("./plateforme");

let operationSaga: Record<string, unknown> | null = null;
function rpcParDefaut(fonction: string, parametres?: Record<string, unknown>) {
  const base = {
    id: "operation-test", entreprise_id: "entreprise-1", stripe_subscription_id: "sub_test",
    type_operation: fonction.includes("retirer") ? "retrait" : "application",
    etat_souhaite: parametres?.p_etat_souhaite ?? { active: true, type: "pourcentage", valeur: 10, duree: "repeating", duree_mois: 3, description: "10 % pendant 3 mois", motif_interne: "Client pilote", nom_coupon: "Entreprise Test — 10 % pendant 3 mois" },
    statut: "pending", coupon_stripe_id: null, cle_idempotence_coupon: "coupon-key",
    cle_idempotence_application: null, nombre_tentatives: 0,
  };
  if (fonction === "plateforme_commencer_operation_remise") {
    operationSaga = { ...base, type_operation: parametres?.p_type_operation };
    return { data: operationSaga, error: null };
  }
  if (fonction === "plateforme_transition_operation_remise") {
    operationSaga = { ...(operationSaga ?? base), statut: parametres?.p_nouveau_statut, coupon_stripe_id: parametres && "p_coupon_stripe_id" in parametres ? parametres.p_coupon_stripe_id : operationSaga?.coupon_stripe_id ?? null };
    return { data: operationSaga, error: null };
  }
  if (fonction === "plateforme_preparer_post_application_remise") {
    operationSaga = { ...(operationSaga ?? base), statut: "stripe_in_progress", cle_idempotence_application: "apply-key" };
    return { data: operationSaga, error: null };
  }
  if (fonction === "plateforme_enregistrer_coupon_operation_remise") {
    operationSaga = { ...(operationSaga ?? base), coupon_stripe_id: parametres?.p_coupon_stripe_id };
    return { data: operationSaga, error: null };
  }
  if (fonction === "plateforme_finaliser_operation_remise") {
    operationSaga = { ...(operationSaga ?? base), statut: "completed" };
    return { data: operationSaga, error: null };
  }
  return { data: null, error: null };
}

function formulaireRemise(champs: Record<string, string>) {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

describe("appliquerRemiseAction — permissions et validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operationSaga = null;
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.rpc.mockImplementation(async (fonction, parametres) => rpcParDefaut(fonction, parametres));
    mocks.entreprise = { nom: "Entreprise Test", stripe_subscription_id: "sub_test" };
    mocks.recupererAbonnementStripe.mockResolvedValue({ id: "sub_test", customer: "cus_test", status: "active", discounts: [] });
    mocks.appliquerCouponAbonnement.mockImplementation(async () => {
      mocks.recupererAbonnementStripe.mockResolvedValue({ id: "sub_test", customer: "cus_test", status: "active", discounts: [{ source: { coupon: { id: "coupon_test" } } }] });
      return {};
    });
    mocks.reconcilierOperationRemiseServeur.mockResolvedValue({});
  });

  it("refuse un utilisateur non plateforme-admin sans jamais appeler Stripe", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow("REDIRECT:/dashboard");

    expect(mocks.creerCouponRemise).not.toHaveBeenCalled();
    expect(mocks.appliquerCouponAbonnement).not.toHaveBeenCalled();
  });

  it.each([
    "session aal1",
    "rôle lecture",
    "rôle insuffisant",
    "UID absent ou inactif",
    "rôle invalide",
  ])("refuse %s avant tout appel Stripe", async () => {
    mocks.rpc.mockImplementation(async (fonction: string) => ({
      error: fonction === "plateforme_autoriser_effet_externe"
        ? { message: "Autorisation refusée" }
        : null,
    }));
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);

    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_autoriser_effet_externe", { p_action: "remise_abonnement" });
    expect(mocks.creerCouponRemise).not.toHaveBeenCalled();
    expect(mocks.appliquerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("refuse un pourcentage supérieur à 100", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "150", duree: "once", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);

    expect(mocks.creerCouponRemise).not.toHaveBeenCalled();
  });

  it("exige un motif interne non vide", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "   " });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);

    expect(mocks.creerCouponRemise).not.toHaveBeenCalled();
  });

  it("refuse si l'entreprise n'a pas d'abonnement Stripe actif", async () => {
    mocks.entreprise = { nom: "Entreprise Test", stripe_subscription_id: null };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);

    expect(mocks.creerCouponRemise).not.toHaveBeenCalled();
  });

  it("crée l'intention, applique le coupon puis finalise la saga", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "repeating", duree_mois: "3", motif_interne: "Client pilote" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    expect(mocks.reconcilierOperationRemiseServeur).toHaveBeenCalledWith("operation-test", "sub_test", "action:operation-test", expect.any(Object));
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_autoriser_effet_externe", { p_action: "remise_abonnement" });
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_commencer_operation_remise", expect.objectContaining({
      p_entreprise_id: "entreprise-1",
      p_type_operation: "application",
      p_etat_souhaite: expect.objectContaining({ type: "pourcentage", valeur: 10, duree: "repeating", duree_mois: 3 }),
    }));
  });

  it("tronque le nom du coupon Stripe à 40 caractères max (bug réel ABONNEMENTS-DETAIL-V1C : nom d'entreprise 31 caractères + description dépassait la limite Stripe et faisait échouer toute la remise)", async () => {
    mocks.entreprise = { nom: "RECETTE-ABONNEMENTS-V1C-CLIENT", stripe_subscription_id: "sub_test" };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "forever", motif_interne: "RECETTE ABONNEMENTS V1C" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    const appel = mocks.rpc.mock.calls.find(([nom]) => nom === "plateforme_commencer_operation_remise")?.[1] as { p_etat_souhaite: { nom_coupon: string } };
    expect(appel.p_etat_souhaite.nom_coupon.length).toBeLessThanOrEqual(40);
    expect(appel.p_etat_souhaite.nom_coupon.endsWith("— 10 % à vie")).toBe(true);
  });

  it("conserve le nom entier quand il tient déjà dans la limite de 40 caractères", async () => {
    mocks.entreprise = { nom: "Entreprise Test", stripe_subscription_id: "sub_test" };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    const appel = mocks.rpc.mock.calls.find(([nom]) => nom === "plateforme_commencer_operation_remise")?.[1] as { p_etat_souhaite: { nom_coupon: string } };
    expect(appel.p_etat_souhaite.nom_coupon).toBe("Entreprise Test — 10 % une fois");
  });

  it("exige un nombre de mois pour une remise 'repeating' avant même d'appeler Stripe", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "repeating", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow();

    expect(mocks.appliquerCouponAbonnement).not.toHaveBeenCalled();
  });
});

describe("retirerRemiseAction — permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    operationSaga = null;
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.rpc.mockImplementation(async (fonction, parametres) => rpcParDefaut(fonction, parametres));
    mocks.entreprise = { nom: "Entreprise Test", stripe_subscription_id: "sub_test" };
    mocks.recupererAbonnementStripe.mockResolvedValue({ id: "sub_test", customer: "cus_test", status: "active", discounts: [{ source: { coupon: { id: "coupon_test" } } }] });
    mocks.retirerCouponAbonnement.mockImplementation(async () => {
      mocks.recupererAbonnementStripe.mockResolvedValue({ id: "sub_test", customer: "cus_test", status: "active", discounts: [] });
      return {};
    });
    mocks.reconcilierOperationRemiseServeur.mockResolvedValue({});
  });

  it("refuse un utilisateur non plateforme-admin sans jamais appeler Stripe", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);

    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow("REDIRECT:/dashboard");

    expect(mocks.retirerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("refuse une autorisation forte insuffisante avant tout retrait Stripe", async () => {
    mocks.rpc.mockImplementation(async (fonction: string) => ({
      error: fonction === "plateforme_autoriser_effet_externe"
        ? { message: "Autorisation refusée" }
        : null,
    }));

    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);

    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_autoriser_effet_externe", { p_action: "remise_abonnement" });
    expect(mocks.retirerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("relit Stripe, retire le coupon puis finalise la saga", async () => {
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    expect(mocks.reconcilierOperationRemiseServeur).toHaveBeenCalledWith("operation-test", "sub_test", "action:operation-test", expect.any(Object));
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_autoriser_effet_externe", { p_action: "remise_abonnement" });
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_commencer_operation_remise", expect.objectContaining({ p_entreprise_id: "entreprise-1", p_type_operation: "retrait" }));
  });
});
