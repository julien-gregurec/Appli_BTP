import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  revalidatePath: vi.fn(),
  creerCouponRemise: vi.fn(),
  appliquerCouponAbonnement: vi.fn(),
  rpc: vi.fn(),
  entreprise: { nom: "Entreprise Test", stripe_subscription_id: "sub_test" } as { nom: string; stripe_subscription_id: string | null },
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: vi.fn(async () => true) }));
vi.mock("@/lib/stripe-abonnement", () => ({
  creerCouponRemise: mocks.creerCouponRemise,
  appliquerCouponAbonnement: mocks.appliquerCouponAbonnement,
  retirerCouponAbonnement: vi.fn(),
  TYPES_REMISE: ["pourcentage", "montant"],
  DUREES_REMISE: ["once", "repeating", "forever"],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mocks.entreprise }),
        }),
      }),
    }),
    rpc: mocks.rpc,
  })),
}));

function formulaireRemise(champs: Record<string, string>) {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

import { appliquerRemiseAction } from "./plateforme";

describe("appliquerRemiseAction — le nom du coupon Stripe reste dans la limite de 40 caractères", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entreprise = { nom: "Entreprise Test", stripe_subscription_id: "sub_test" };
    mocks.creerCouponRemise.mockResolvedValue({ id: "coupon-test" });
    mocks.appliquerCouponAbonnement.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("tronque le nom du coupon Stripe à 40 caractères max quand le nom d'entreprise est long (bug réel : sinon Stripe rejette toute la remise)", async () => {
    mocks.entreprise = { nom: "RECETTE-ABONNEMENTS-V1C-CLIENT", stripe_subscription_id: "sub_test" };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "forever" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    const appel = mocks.creerCouponRemise.mock.calls[0][0] as unknown as { nom: string };
    expect(appel.nom.length).toBeLessThanOrEqual(40);
    expect(appel.nom.endsWith("— 10 % à vie")).toBe(true);
  });

  it("conserve le nom entier quand il tient déjà dans la limite de 40 caractères", async () => {
    mocks.entreprise = { nom: "Entreprise Test", stripe_subscription_id: "sub_test" };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once" });

    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    const appel = mocks.creerCouponRemise.mock.calls[0][0] as unknown as { nom: string };
    expect(appel.nom).toBe("Entreprise Test — 10 % une fois");
  });
});
