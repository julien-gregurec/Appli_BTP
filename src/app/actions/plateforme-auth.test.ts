import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  urlCanonique: "https://preview.example.invalid",
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  rpc: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  estPlateformeAdmin: vi.fn(async () => true),
  createAdminClient: vi.fn(() => {
    throw new Error("createAdminClient (service_role) ne doit jamais être utilisé ici");
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/brand", () => ({ BRAND: { urlPublique: mocks.urlCanonique } }));
vi.mock("@/lib/stripe-abonnement", () => ({
  appliquerCouponAbonnement: vi.fn(),
  couponActifDepuisAbonnement: vi.fn(),
  observerRemiseDepuisAbonnement: vi.fn(),
  creerCouponRemise: vi.fn(),
  recupererAbonnementStripe: vi.fn(),
  retirerCouponAbonnement: vi.fn(),
  TYPES_REMISE: [],
  DUREES_REMISE: [],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  })),
}));

import { activerAdminPlateformeAction, reinitialiserMotDePassePlateformeAction } from "./plateforme";

describe("réinitialisation administrateur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("utilise l’URL canonique sans envoyer de véritable e-mail", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("motif", "Test automatisé");

    await expect(reinitialiserMotDePassePlateformeAction("entreprise-test", formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("recette@example.invalid", {
      redirectTo: `${mocks.urlCanonique}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    });
  });
});

describe("activerAdminPlateformeAction", () => {
  const form = (email = "julien@elsatia.fr") => {
    const f = new FormData();
    f.set("email", email);
    return f;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("non-admin : refusé, redirigé vers /dashboard, aucune RPC appelée", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    await expect(activerAdminPlateformeAction(form())).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("admin actif + session AAL2 : appelle exclusivement plateforme_activer_admin puis succès", async () => {
    await expect(activerAdminPlateformeAction(form())).rejects.toThrow("REDIRECT:/plateforme?succes=");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_activer_admin", { p_email: "julien@elsatia.fr" });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("identité en attente activée : normalise l'email et renvoie le succès", async () => {
    await expect(activerAdminPlateformeAction(form("  Julien@Elsatia.FR "))).rejects.toThrow("REDIRECT:/plateforme?succes=");
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_activer_admin", { p_email: "julien@elsatia.fr" });
  });

  it("session AAL1 : l'erreur AAL2 de la RPC remonte, aucun succès", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Authentification forte AAL2 requise" } });
    await expect(activerAdminPlateformeAction(form())).rejects.toThrow(
      "REDIRECT:/plateforme?error=Authentification%20forte%20AAL2%20requise",
    );
  });

  it("identité déjà active : l'erreur de la RPC remonte, aucune corruption (pas de succès, pas de contournement)", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Identité non rattachée" } });
    await expect(activerAdminPlateformeAction(form())).rejects.toThrow("REDIRECT:/plateforme?error=");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_activer_admin", { p_email: "julien@elsatia.fr" });
  });

  it("aucune création d'entreprise : seule plateforme_activer_admin est invoquée", async () => {
    await expect(activerAdminPlateformeAction(form())).rejects.toThrow("REDIRECT:");
    const fonctionsAppelees = mocks.rpc.mock.calls.map(([nom]) => nom);
    expect(fonctionsAppelees).toEqual(["plateforme_activer_admin"]);
    expect(fonctionsAppelees).not.toContain("plateforme_creer_entreprise");
    expect(fonctionsAppelees).not.toContain("creer_entreprise_bootstrap");
  });

  it("email absent : refusé avant toute RPC", async () => {
    const f = new FormData();
    await expect(activerAdminPlateformeAction(f)).rejects.toThrow("REDIRECT:/plateforme?error=");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
