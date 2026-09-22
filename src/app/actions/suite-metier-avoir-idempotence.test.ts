import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => ({ entrepriseId: "entreprise-test", userId: "user-test" })) }));
vi.mock("@/lib/email", () => ({ construireLienMailto: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import { creerFactureAvanceeAction } from "./suite-metier";

describe("creerFactureAvanceeAction — idempotence d'un double clic sur « Créer un avoir »", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirige vers l'avoir déjà créé plutôt que d'afficher l'erreur SQL brute", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "avoir_existant:11111111-1111-1111-1111-111111111111" },
    });
    const formData = new FormData();
    formData.set("type", "avoir");
    formData.set("devis_id", "devis-test");
    formData.set("facture_origine_id", "facture-origine");

    await expect(creerFactureAvanceeAction(formData)).rejects.toThrow(
      "REDIRECT:/factures/11111111-1111-1111-1111-111111111111",
    );
  });

  it("retombe sur le message d'erreur générique pour toute autre erreur", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Le devis doit être accepté" } });
    const formData = new FormData();
    formData.set("type", "acompte");
    formData.set("devis_id", "devis-test");

    await expect(creerFactureAvanceeAction(formData)).rejects.toThrow(
      "REDIRECT:/facturation-avancee?error=Le%20devis%20doit%20%C3%AAtre%20accept%C3%A9",
    );
  });

  it("crée normalement quand aucune erreur ne survient", async () => {
    mocks.rpc.mockResolvedValue({ data: "facture-creee", error: null });
    const formData = new FormData();
    formData.set("type", "finale");
    formData.set("devis_id", "devis-test");

    await expect(creerFactureAvanceeAction(formData)).rejects.toThrow("REDIRECT:/factures/facture-creee");
  });
});
