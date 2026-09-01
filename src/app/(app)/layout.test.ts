import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  headersGet: vi.fn(),
  getContexteEntreprise: vi.fn(),
  permissionsUtilisateur: vi.fn(async () => [] as string[]),
  estPlateformeAdmin: vi.fn(async () => false),
  listerApplicationsPourSwitcher: vi.fn(async () => []),
  activeFeaturesForCompany: vi.fn(async () => []),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: mocks.headersGet })) }));
vi.mock("@/lib/entreprise", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/entreprise")>();
  return { ...actual, getContexteEntreprise: mocks.getContexteEntreprise };
});
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/permissions", () => ({
  permissionsUtilisateur: mocks.permissionsUtilisateur,
  aAccesIA: () => false,
}));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));
vi.mock("@/lib/multi-app-server", () => ({ listerApplicationsPourSwitcher: mocks.listerApplicationsPourSwitcher }));
vi.mock("@/lib/feature-flags", () => ({ activeFeaturesForCompany: mocks.activeFeaturesForCompany }));
vi.mock("@/lib/preview-features", () => ({ boutiqueEstActive: () => true, iaEstActive: () => false }));

import AppLayout from "./layout";
import { ENTREPRISE_ID_ADMIN_PLATEFORME } from "@/lib/entreprise";

function ctxNeutre() {
  return {
    userId: "u1",
    prenom: "Julien",
    entrepriseId: ENTREPRISE_ID_ADMIN_PLATEFORME,
    entrepriseNom: "Administration ELSATIA",
    entrepriseReference: null,
    logoUrl: null,
    abonnementStatut: "actif",
    abonnementEcheance: null,
    abonnementEssaiFin: null,
    suspensionPrevueAt: null,
    impayeMessage: null,
    accesSupportPlateforme: false,
  };
}

function ctxEntreprise() {
  return {
    userId: "u2",
    prenom: "Ouvrier",
    entrepriseId: "entreprise-reelle",
    entrepriseNom: "Entreprise Test",
    entrepriseReference: null,
    logoUrl: null,
    abonnementStatut: "actif",
    abonnementEcheance: null,
    abonnementEssaiFin: null,
    suspensionPrevueAt: null,
    impayeMessage: null,
    accesSupportPlateforme: false,
  };
}

describe("AppLayout — routage d'une identité plateforme sans entreprise cliente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissionsUtilisateur.mockResolvedValue([]);
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    mocks.listerApplicationsPourSwitcher.mockResolvedValue([]);
    mocks.activeFeaturesForCompany.mockResolvedValue([]);
  });

  it.each(["/", "/dashboard", "/mon-espace", "/clients"])(
    "admin plateforme sans entreprise ouvrant %s : renvoyé vers /plateforme",
    async (chemin) => {
      mocks.getContexteEntreprise.mockResolvedValue(ctxNeutre());
      mocks.headersGet.mockReturnValue(chemin);

      await expect(AppLayout({ children: null })).rejects.toThrow("REDIRECT:/plateforme");
    },
  );

  it.each(["/plateforme", "/plateforme/applications", "/mon-espace/securite"])(
    "admin plateforme sans entreprise ouvrant %s : autorisé, aucune redirection",
    async (chemin) => {
      mocks.getContexteEntreprise.mockResolvedValue(ctxNeutre());
      mocks.headersGet.mockReturnValue(chemin);

      const jsx = await AppLayout({ children: null });
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(jsx).toBeTruthy();
    },
  );

  it("aucune redirection si l'en-tête x-pathname est absent (fail-open, pas de boucle possible)", async () => {
    mocks.getContexteEntreprise.mockResolvedValue(ctxNeutre());
    mocks.headersGet.mockReturnValue(null);

    const jsx = await AppLayout({ children: null });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(jsx).toBeTruthy();
  });

  it("utilisateur ou admin d'une entreprise cliente : jamais redirigé vers /plateforme, quelle que soit la route", async () => {
    mocks.getContexteEntreprise.mockResolvedValue(ctxEntreprise());
    mocks.headersGet.mockReturnValue("/dashboard");

    const jsx = await AppLayout({ children: null });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(jsx).toBeTruthy();
  });
});
