import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw Object.assign(new Error(destination), { destination });
  }),
  getContexteColors: vi.fn(),
  rpc: vi.fn(),
  createClient: vi.fn(),
  verifierAccesApplication: vi.fn(),
  exigerAccesApplication: vi.fn(),
  listerApplicationsAutorisees: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/contexte", () => ({ getContexteColors: mocks.getContexteColors }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/applications-elsatia", () => ({
  verifierAccesApplication: mocks.verifierAccesApplication,
  exigerAccesApplication: mocks.exigerAccesApplication,
  listerApplicationsAutorisees: mocks.listerApplicationsAutorisees,
}));

import { exigerShellColors } from "@/lib/acces-colors";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.verifierAccesApplication.mockResolvedValue(true);
  mocks.exigerAccesApplication.mockResolvedValue(undefined);
  mocks.listerApplicationsAutorisees.mockResolvedValue([
    { applicationCode: "colors", roleCode: "colors_admin_organisation" },
  ]);
});

describe("exigerShellColors — garde session support de l’admin plateforme", () => {
  it("redirige un admin plateforme sans session support vers un écran explicite", async () => {
    mocks.getContexteColors.mockResolvedValue({
      estAdminPlateforme: true,
      entrepriseId: "org-1",
      entrepriseNom: "ACME",
    });
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    await expect(exigerShellColors()).rejects.toMatchObject({
      destination: "/acces-refuse?motif=support",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("est_acces_support_actif", { p_entreprise_id: "org-1" });
  });

  it("laisse passer un admin plateforme avec session support active", async () => {
    mocks.getContexteColors.mockResolvedValue({
      estAdminPlateforme: true,
      entrepriseId: "org-1",
      entrepriseNom: "ACME",
    });
    mocks.listerApplicationsAutorisees.mockResolvedValue([
      { applicationCode: "colors", roleCode: "administrateur_plateforme_global" },
    ]);
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(exigerShellColors()).resolves.toMatchObject({ entrepriseId: "org-1" });
  });

  it("redirige un admin plateforme sans entreprise résolue vers le motif support, sans RPC", async () => {
    mocks.getContexteColors.mockResolvedValue({
      estAdminPlateforme: true,
      entrepriseId: null,
      entrepriseNom: "Administration ELSATIA",
    });

    await expect(exigerShellColors()).rejects.toMatchObject({
      destination: "/acces-refuse?motif=support",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("n’interroge pas la session support pour un utilisateur non-admin", async () => {
    mocks.getContexteColors.mockResolvedValue({
      estAdminPlateforme: false,
      entrepriseId: "org-1",
      entrepriseNom: "ACME",
    });

    await expect(exigerShellColors()).resolves.toMatchObject({ entrepriseId: "org-1" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
