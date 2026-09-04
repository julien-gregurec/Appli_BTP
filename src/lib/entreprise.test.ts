import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  estPlateformeAdmin: vi.fn(),
  getUser: vi.fn(),
  single: vi.fn(),
  rpcMaybeSingle: vi.fn(),
  appartenanceMaybeSingle: vi.fn(),
  headersGet: vi.fn(() => null as string | null),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: mocks.headersGet }) }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));
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
  });

  it("admin plateforme sans entreprise rattachée : contexte neutre, pas d'onboarding", async () => {
    mocks.single.mockResolvedValue({ data: { prenom: "Julien", entreprise_active_id: null } });
    mocks.estPlateformeAdmin.mockResolvedValue(true);

    const ctx = await getContexteEntreprise();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(ctx.entrepriseNom).toBe("Administration ELSATIA");
    expect(ctx.entrepriseId).toBe("00000000-0000-0000-0000-000000000000");
    expect(ctx.prenom).toBe("Julien");
  });

  it("utilisateur normal sans entreprise rattachée : redirigé vers l'onboarding (comportement inchangé)", async () => {
    mocks.single.mockResolvedValue({ data: { prenom: "Test", entreprise_active_id: null } });
    mocks.estPlateformeAdmin.mockResolvedValue(false);

    await expect(getContexteEntreprise()).rejects.toThrow("REDIRECT:/onboarding");
  });

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

// ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1 : essai borné à 30 jours, distinct
// d'une vraie suspension pour impayé (statut suspendu/annulé, jamais exemptée).
describe("getContexteEntreprise — essai 30 jours vs suspension pour impayé", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-test" } } });
    mocks.single.mockResolvedValue({ data: { prenom: "Test", entreprise_active_id: "entreprise-test" } });
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    mocks.appartenanceMaybeSingle.mockResolvedValue({ data: { statut: "actif" } });
    mocks.headersGet.mockReturnValue(null);
  });

  function abonnement(partiel: Partial<Record<string, unknown>>) {
    return {
      entreprise_id: "entreprise-test",
      nom: "Entreprise Test",
      reference_interne: null,
      logo_url: null,
      abonnement_statut: "essai",
      abonnement_echeance: null,
      abonnement_essai_debut: null,
      abonnement_essai_fin: null,
      suspension_prevue_at: null,
      impaye_message: null,
      acces_support: false,
      ...partiel,
    };
  }

  it("essai actif (essai_fin dans le futur) : aucune redirection", async () => {
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: abonnement({ abonnement_essai_fin: "2999-01-01" }),
    });
    const ctx = await getContexteEntreprise();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(ctx.essaiExpireSansOffre).toBe(false);
  });

  it("essai expiré (essai_fin dans le passé), appel par défaut : redirige vers /abonnement-suspendu?motif=essai_expire", async () => {
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: abonnement({ abonnement_essai_fin: "2000-01-01" }),
    });
    await expect(getContexteEntreprise()).rejects.toThrow("REDIRECT:/abonnement-suspendu?motif=essai_expire");
  });

  it("essai expiré, requête pour une page métier (/stock) : redirige, jamais exempté hors /abonnement", async () => {
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: abonnement({ abonnement_essai_fin: "2000-01-01" }),
    });
    mocks.headersGet.mockReturnValue("/stock");
    await expect(getContexteEntreprise()).rejects.toThrow("REDIRECT:/abonnement-suspendu?motif=essai_expire");
  });

  it("essai expiré, requête pour /abonnement (en-tête transmis par le proxy) : pas de redirection, essaiExpireSansOffre=true", async () => {
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: abonnement({ abonnement_essai_fin: "2000-01-01" }),
    });
    mocks.headersGet.mockReturnValue("/abonnement");
    const ctx = await getContexteEntreprise();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(ctx.essaiExpireSansOffre).toBe(true);
  });

  it("essai_fin absente mais essai_debut + 30 jours dans le futur : pas de redirection (repli défensif)", async () => {
    const debutHier = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: abonnement({ abonnement_essai_debut: debutHier, abonnement_essai_fin: null }),
    });
    const ctx = await getContexteEntreprise();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(ctx.essaiExpireSansOffre).toBe(false);
  });

  it("essai_fin absente et essai_debut + 30 jours dans le passé : redirige (jamais un essai illimité)", async () => {
    const debutAncien = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: abonnement({ abonnement_essai_debut: debutAncien, abonnement_essai_fin: null }),
    });
    await expect(getContexteEntreprise()).rejects.toThrow("REDIRECT:/abonnement-suspendu?motif=essai_expire");
  });

  it("abonnement réellement suspendu (impayé) : redirige vers /abonnement-suspendu SANS motif, même sur /abonnement", async () => {
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: abonnement({ abonnement_statut: "suspendu", abonnement_essai_fin: "2999-01-01" }),
    });
    mocks.headersGet.mockReturnValue("/abonnement");
    await expect(getContexteEntreprise()).rejects.toThrow("REDIRECT:/abonnement-suspendu");
  });

  it("statut actif (offre souscrite), essai_fin historique dans le passé : aucune redirection (la branche essai ne s'applique qu'au statut essai)", async () => {
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: abonnement({ abonnement_statut: "actif", abonnement_essai_fin: "2000-01-01" }),
    });
    const ctx = await getContexteEntreprise();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(ctx.essaiExpireSansOffre).toBe(false);
  });

  it("accès support plateforme actif : jamais bloqué, même essai expiré", async () => {
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: abonnement({ abonnement_essai_fin: "2000-01-01", acces_support: true }),
    });
    const ctx = await getContexteEntreprise();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(ctx.essaiExpireSansOffre).toBe(false);
  });
});
