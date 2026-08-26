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
  retirerCouponAbonnement: vi.fn(async () => ({})),
  rpc: vi.fn<(nom: string, parametres?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>(async () => ({ data: null, error: null })),
  preautorisation: {
    entreprise_id: "entreprise-1",
    entreprise_nom: "Entreprise Test",
    stripe_subscription_id: "sub_test",
    remise_stripe_coupon_id: null,
  } as Record<string, unknown> | null,
  erreurPreautorisation: null as string | null,
  erreurMutation: null as string | null,
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));
vi.mock("@/lib/stripe-abonnement", () => ({
  appliquerCouponAbonnement: mocks.appliquerCouponAbonnement,
  creerCouponRemise: mocks.creerCouponRemise,
  retirerCouponAbonnement: mocks.retirerCouponAbonnement,
  TYPES_REMISE: ["montant", "pourcentage"],
  DUREES_REMISE: ["once", "repeating", "forever"],
}));
function fabriquerClientEntreprises() {
  return {
    rpc: mocks.rpc,
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fabriquerClientEntreprises()),
}));
const { appliquerRemiseAction, retirerRemiseAction } = await import("./plateforme");

function formulaireRemise(champs: Record<string, string>) {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

describe("appliquerRemiseAction — permissions et validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.erreurPreautorisation = null;
    mocks.erreurMutation = null;
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "Entreprise Test", stripe_subscription_id: "sub_test", remise_stripe_coupon_id: null };
    mocks.rpc.mockImplementation(async (nom: string) => {
      if (nom === "plateforme_preautoriser_effet_externe") {
        return mocks.erreurPreautorisation
          ? { data: null, error: { message: mocks.erreurPreautorisation } }
          : { data: [mocks.preautorisation], error: null };
      }
      if (nom === "plateforme_appliquer_remise" || nom === "plateforme_retirer_remise") {
        return mocks.erreurMutation ? { data: null, error: { message: mocks.erreurMutation } } : { data: true, error: null };
      }
      return { data: null, error: null };
    });
  });

  it("refuse un utilisateur non plateforme-admin sans jamais appeler Stripe", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow("REDIRECT:/dashboard");

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
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "Entreprise Test", stripe_subscription_id: null, remise_stripe_coupon_id: null };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);

    expect(mocks.creerCouponRemise).not.toHaveBeenCalled();
  });

  it.each(["Session AAL2 requise", "Rôle support refusé", "Rôle lecture refusé", "Administrateur plateforme inactif", "Entreprise introuvable", "Session expirée"])(
    "refuse la préautorisation SQL (%s) avant tout appel Stripe",
    async (message) => {
      mocks.erreurPreautorisation = message;
      const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });
      await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);
      expect(mocks.creerCouponRemise).not.toHaveBeenCalled();
      expect(mocks.appliquerCouponAbonnement).not.toHaveBeenCalled();
    },
  );

  it("crée et applique le coupon puis journalise type/valeur/motif/durée via le RPC plateforme_appliquer_remise", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "repeating", duree_mois: "3", motif_interne: "Client pilote" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    expect(mocks.creerCouponRemise).toHaveBeenCalledWith(expect.objectContaining({ type: "pourcentage", valeur: 10, duree: "repeating", dureeMois: 3, idempotence: expect.stringMatching(/^remise-coupon-/) }));
    expect(mocks.appliquerCouponAbonnement).toHaveBeenCalledWith("sub_test", "coupon_test");
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_appliquer_remise", {
      p_entreprise_id: "entreprise-1",
      p_coupon_id: "coupon_test",
      p_description: "10 % pendant 3 mois",
      p_motif_interne: "Client pilote",
      p_duree_mois: 3,
      p_type: "pourcentage",
      p_valeur: 10,
    });
    const preautorisation = mocks.rpc.mock.invocationCallOrder[0];
    const stripe = mocks.creerCouponRemise.mock.invocationCallOrder[0];
    const mutation = mocks.rpc.mock.invocationCallOrder.find((ordre, index) => mocks.rpc.mock.calls[index]?.[0] === "plateforme_appliquer_remise");
    expect(preautorisation).toBeLessThan(stripe);
    expect(stripe).toBeLessThan(mutation!);
  });

  it("tronque le nom du coupon Stripe à 40 caractères max (bug réel ABONNEMENTS-DETAIL-V1C : nom d'entreprise 31 caractères + description dépassait la limite Stripe et faisait échouer toute la remise)", async () => {
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "RECETTE-ABONNEMENTS-V1C-CLIENT", stripe_subscription_id: "sub_test", remise_stripe_coupon_id: null };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "forever", motif_interne: "RECETTE ABONNEMENTS V1C" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    const appel = mocks.creerCouponRemise.mock.calls[0][0] as unknown as { nom: string };
    expect(appel.nom.length).toBeLessThanOrEqual(40);
    expect(appel.nom.endsWith("— 10 % à vie")).toBe(true);
  });

  it("conserve le nom entier quand il tient déjà dans la limite de 40 caractères", async () => {
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "Entreprise Test", stripe_subscription_id: "sub_test", remise_stripe_coupon_id: null };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    const appel = mocks.creerCouponRemise.mock.calls[0][0] as unknown as { nom: string };
    expect(appel.nom).toBe("Entreprise Test — 10 % une fois");
  });

  it("exige un nombre de mois pour une remise 'repeating' avant même d'appeler Stripe", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "repeating", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow();

    expect(mocks.appliquerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("compense Stripe et journalise lorsque la mutation locale finale échoue", async () => {
    mocks.erreurMutation = "Écriture locale refusée";
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });
    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/Synchronisation%20Stripe%20compens/);
    expect(mocks.retirerCouponAbonnement).toHaveBeenCalledWith("sub_test", expect.stringMatching(/^remise-compensation-/));
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_journaliser_echec_synchronisation_remise", {
      p_entreprise_id: "entreprise-1",
      p_operation: "remise_appliquer",
      p_compensation_reussie: true,
    });
  });
});

describe("retirerRemiseAction — permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.erreurPreautorisation = null;
    mocks.erreurMutation = null;
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "Entreprise Test", stripe_subscription_id: "sub_test", remise_stripe_coupon_id: "coupon_test" };
    mocks.rpc.mockImplementation(async (nom: string) => {
      if (nom === "plateforme_preautoriser_effet_externe") return { data: [mocks.preautorisation], error: null };
      if (nom === "plateforme_retirer_remise") return mocks.erreurMutation ? { data: null, error: { message: mocks.erreurMutation } } : { data: true, error: null };
      return { data: null, error: null };
    });
  });

  it("refuse un utilisateur non plateforme-admin sans jamais appeler Stripe", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);

    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow("REDIRECT:/dashboard");

    expect(mocks.retirerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("retire le coupon Stripe puis le RPC plateforme_retirer_remise", async () => {
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    expect(mocks.retirerCouponAbonnement).toHaveBeenCalledWith("sub_test", expect.stringMatching(/^remise-suppression-/));
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_retirer_remise", { p_entreprise_id: "entreprise-1" });
  });

  it("n'appelle jamais Stripe quand la préautorisation de retrait est refusée", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "AAL2 requis" } });
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);
    expect(mocks.retirerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("restaure la remise Stripe précédente si le retrait local échoue", async () => {
    mocks.erreurMutation = "Écriture locale refusée";
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/Synchronisation%20Stripe%20compens/);
    expect(mocks.appliquerCouponAbonnement).toHaveBeenCalledWith("sub_test", "coupon_test");
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_journaliser_echec_synchronisation_remise", expect.objectContaining({
      p_operation: "remise_retirer",
      p_compensation_reussie: true,
    }));
  });
});
