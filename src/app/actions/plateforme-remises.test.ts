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
  rpc: vi.fn(async () => ({ error: null })),
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
  TYPES_REMISE: ["montant", "pourcentage"],
  DUREES_REMISE: ["once", "repeating", "forever"],
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

function formulaireRemise(champs: Record<string, string>) {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

describe("appliquerRemiseAction — permissions et validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.entreprise = { nom: "Entreprise Test", stripe_subscription_id: "sub_test" };
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
    mocks.entreprise = { nom: "Entreprise Test", stripe_subscription_id: null };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);

    expect(mocks.creerCouponRemise).not.toHaveBeenCalled();
  });

  it("crée et applique le coupon puis journalise type/valeur/motif/durée via le RPC plateforme_appliquer_remise", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "repeating", duree_mois: "3", motif_interne: "Client pilote" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    expect(mocks.creerCouponRemise).toHaveBeenCalledWith(expect.objectContaining({ type: "pourcentage", valeur: 10, duree: "repeating", dureeMois: 3 }));
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
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.entreprise = { nom: "Entreprise Test", stripe_subscription_id: "sub_test" };
  });

  it("refuse un utilisateur non plateforme-admin sans jamais appeler Stripe", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);

    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow("REDIRECT:/dashboard");

    expect(mocks.retirerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("retire le coupon Stripe puis le RPC plateforme_retirer_remise", async () => {
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    expect(mocks.retirerCouponAbonnement).toHaveBeenCalledWith("sub_test");
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_retirer_remise", { p_entreprise_id: "entreprise-1" });
  });
});
