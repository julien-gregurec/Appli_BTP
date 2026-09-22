import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  fromMaybeSingle: vi.fn(),
  fromUpdate: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => ({ entrepriseId: "entreprise-test", userId: "user-test" })) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table !== "factures") throw new Error(`table inattendue dans ce test : ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: mocks.fromMaybeSingle,
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: mocks.fromUpdate,
          }),
        }),
      };
    },
  })),
}));

import { enregistrerPaiementAction, modifierEcheanceFactureAction } from "./factures";

describe("enregistrerPaiementAction — passe par la RPC verrouillée (idempotence TOCTOU)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("appelle enregistrer_paiement_facture plutôt qu'un insert direct dans paiements", async () => {
    const formData = new FormData();
    formData.set("montant", "100");
    formData.set("date", "2026-09-22");
    formData.set("mode", "virement");
    formData.set("reference", "REF-1");

    await expect(enregistrerPaiementAction("facture-test", formData)).rejects.toThrow("REDIRECT:/factures/facture-test");

    expect(mocks.rpc).toHaveBeenCalledWith("enregistrer_paiement_facture", {
      p_entreprise_id: "entreprise-test",
      p_facture_id: "facture-test",
      p_montant: 100,
      p_date: "2026-09-22",
      p_mode: "virement",
      p_reference: "REF-1",
    });
  });

  it("remonte l'erreur de la RPC (ex. reste dû dépassé par une course gagnante) sans écrire directement", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Le paiement dépasse le reste dû (0.00)" } });
    const formData = new FormData();
    formData.set("montant", "50");

    await expect(enregistrerPaiementAction("facture-test", formData)).rejects.toThrow(
      "REDIRECT:/factures/facture-test?error=Le%20paiement%20d%C3%A9passe%20le%20reste%20d%C3%BB%20(0.00)",
    );
  });
});

describe("modifierEcheanceFactureAction — la date d'échéance est figée une fois la facture émise", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fromUpdate.mockResolvedValue({ error: null });
  });

  it("refuse la modification si la facture n'est plus brouillon", async () => {
    mocks.fromMaybeSingle.mockResolvedValue({ data: { statut: "envoyee" } });
    const formData = new FormData();
    formData.set("date_echeance", "2026-12-01");

    await expect(modifierEcheanceFactureAction("facture-test", formData)).rejects.toThrow("REDIRECT:/factures/facture-test?error=");
    expect(mocks.fromUpdate).not.toHaveBeenCalled();
  });

  it("autorise la modification tant que la facture est brouillon", async () => {
    mocks.fromMaybeSingle.mockResolvedValue({ data: { statut: "brouillon" } });
    const formData = new FormData();
    formData.set("date_echeance", "2026-12-01");

    await expect(modifierEcheanceFactureAction("facture-test", formData)).rejects.toThrow("REDIRECT:/factures/facture-test");
    expect(mocks.fromUpdate).toHaveBeenCalled();
  });

  it("refuse si la facture est introuvable", async () => {
    mocks.fromMaybeSingle.mockResolvedValue({ data: null });
    const formData = new FormData();
    formData.set("date_echeance", "2026-12-01");

    await expect(modifierEcheanceFactureAction("facture-test", formData)).rejects.toThrow("REDIRECT:/factures/facture-test?error=");
    expect(mocks.fromUpdate).not.toHaveBeenCalled();
  });
});
