import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  getUser: vi.fn(),
  estPlateformeAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({
  DUREE_ESSAI_JOURS: 30,
  estPlateformeAdmin: mocks.estPlateformeAdmin,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

import AccueilPage from "./page";

describe("page d'accueil — routage d'une session déjà connectée", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin plateforme actif déjà connecté : redirigé vers /plateforme, jamais /dashboard", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-plateforme" } } });
    mocks.estPlateformeAdmin.mockResolvedValue(true);

    await expect(AccueilPage()).rejects.toThrow("REDIRECT:/plateforme");
    expect(mocks.redirect).not.toHaveBeenCalledWith("/dashboard");
  });

  it("utilisateur ordinaire déjà connecté : redirigé vers /dashboard (comportement inchangé)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "utilisateur-ordinaire" } } });
    mocks.estPlateformeAdmin.mockResolvedValue(false);

    await expect(AccueilPage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("visiteur non connecté : aucune redirection, la page publique s'affiche", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const jsx = await AccueilPage();

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(jsx).toBeTruthy();
  });
});
