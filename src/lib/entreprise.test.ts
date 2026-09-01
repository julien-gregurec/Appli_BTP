import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  estPlateformeAdmin: vi.fn(),
  statutIdentitePlateforme: vi.fn(),
  getUser: vi.fn(),
  single: vi.fn(),
  rpcMaybeSingle: vi.fn(),
  appartenanceMaybeSingle: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({
  estPlateformeAdmin: mocks.estPlateformeAdmin,
  statutIdentitePlateforme: mocks.statutIdentitePlateforme,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      if (table === "utilisateurs") {
        return { select: () => ({ eq: () => ({ single: mocks.single }) }) };
      }
      if (table === "utilisateurs_entreprises") {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.appartenanceMaybeSingle }) }) }) };
      }
      throw new Error(`table non simulée dans ce test : ${table}`);
    },
    rpc: () => ({ maybeSingle: mocks.rpcMaybeSingle }),
  })),
}));

import { getContexteEntreprise } from "./entreprise";

describe("getContexteEntreprise — routage admin plateforme vs onboarding entreprise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-test" } } });
    // Toujours résolu : Promise.all attend les deux requêtes même quand la
    // branche admin plateforme n'utilisera jamais le résultat de l'abonnement.
    mocks.rpcMaybeSingle.mockResolvedValue({ data: null });
    // Par défaut : aucune identité plateforme rattachée (utilisateur ordinaire).
    mocks.statutIdentitePlateforme.mockResolvedValue(null);
  });

  it("admin plateforme sans entreprise rattachée : contexte neutre, pas d'onboarding", async () => {
    mocks.single.mockResolvedValue({ data: { prenom: "Julien", entreprise_active_id: null } });
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.statutIdentitePlateforme.mockResolvedValue("active");

    const ctx = await getContexteEntreprise();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(ctx.entrepriseNom).toBe("Administration ELSATIA");
    expect(ctx.entrepriseId).toBe("00000000-0000-0000-0000-000000000000");
    expect(ctx.prenom).toBe("Julien");
  });

  it("utilisateur normal sans entreprise rattachée : redirigé vers l'onboarding (comportement inchangé)", async () => {
    mocks.single.mockResolvedValue({ data: { prenom: "Test", entreprise_active_id: null } });
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    mocks.statutIdentitePlateforme.mockResolvedValue(null);

    await expect(getContexteEntreprise()).rejects.toThrow("REDIRECT:/onboarding");
  });

  it.each(["rattachee_non_confirmee", "en_attente", "revoquee"] as const)(
    "identité plateforme %s (non active) : refus sécurisé vers /acces-refuse, jamais l'onboarding ni le contexte neutre",
    async (statut) => {
      mocks.single.mockResolvedValue({ data: { prenom: "Julien", entreprise_active_id: null } });
      mocks.estPlateformeAdmin.mockResolvedValue(false);
      mocks.statutIdentitePlateforme.mockResolvedValue(statut);

      await expect(getContexteEntreprise()).rejects.toThrow(
        "REDIRECT:/acces-refuse?motif=identite_plateforme_en_attente",
      );
      expect(mocks.redirect).not.toHaveBeenCalledWith("/onboarding");
    },
  );

  it("admin plateforme avec une entreprise active : parcours entreprise normal, jamais le contexte neutre", async () => {
    mocks.single.mockResolvedValue({ data: { prenom: "Julien", entreprise_active_id: "entreprise-test" } });
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: {
        entreprise_id: "entreprise-test",
        nom: "Entreprise Test",
        reference_interne: null,
        logo_url: null,
        abonnement_statut: "actif",
        abonnement_echeance: null,
        abonnement_essai_fin: null,
        suspension_prevue_at: null,
        impaye_message: null,
        acces_support: false,
      },
    });
    mocks.appartenanceMaybeSingle.mockResolvedValue({ data: { statut: "actif" } });

    const ctx = await getContexteEntreprise();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(ctx.entrepriseNom).toBe("Entreprise Test");
    expect(ctx.entrepriseId).toBe("entreprise-test");
  });
});
