import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ctx: { entrepriseId: "ent-a", userId: "user-1", entrepriseNom: "Test", prenom: "Test" },
  permissions: ["acces_ia", "gerer_devis"] as string[] | null,
  client: { id: "client-1" } as Record<string, unknown> | null,
  devisRecent: null as { id: string } | null,
  rpc: vi.fn(async (nom: string, params: Record<string, unknown>): Promise<{ data: string | null; error: { message: string } | null }> => {
    void nom;
    void params;
    return { data: "devis-nouveau", error: null };
  }),
  iaActive: true,
  iaDevisActive: true,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => mocks.ctx) }));
vi.mock("@/lib/permissions", () => ({
  permissionsUtilisateur: vi.fn(async () => mocks.permissions),
  aAccesIA: (p: string[] | null) => p === null || p.includes("acces_ia"),
}));
vi.mock("@/lib/preview-features", () => ({
  iaEstActive: () => mocks.iaActive,
  iaDevisEstActive: () => mocks.iaDevisActive,
  MESSAGE_IA_INDISPONIBLE: "IA indisponible",
}));

function tableMock(table: string) {
  const requete: Record<string, unknown> = {};
  for (const methode of ["select", "eq", "gte", "order", "limit"]) requete[methode] = () => requete;
  requete.maybeSingle = async () => {
    if (table === "clients") return { data: mocks.client };
    if (table === "devis") return { data: mocks.devisRecent };
    return { data: null };
  };
  return requete;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableMock(table),
    rpc: mocks.rpc,
  })),
}));

const { creerDevisDepuisPropositionAction } = await import("./assistant");

const propositionBase = {
  clientId: "client-1",
  objet: "Cloisons bureaux",
  lignes: [
    { designation: "Cloison 72/48", description: null, type: "fourniture", quantite: 120, unite: "m²", prixUnitaireHt: 45, tauxTva: 20, remiseLigne: 0 },
  ],
  notesClient: null,
};

describe("creerDevisDepuisPropositionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = ["acces_ia", "gerer_devis"];
    mocks.client = { id: "client-1" };
    mocks.devisRecent = null;
    mocks.iaActive = true;
    mocks.iaDevisActive = true;
    mocks.rpc.mockResolvedValue({ data: "devis-nouveau", error: null });
  });

  it("1. crée le brouillon quand tout est valide", async () => {
    const res = await creerDevisDepuisPropositionAction(propositionBase);
    expect(res).toEqual({ ok: true, devisId: "devis-nouveau" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "creer_devis_brouillon",
      expect.objectContaining({
        p_entreprise_id: "ent-a",
        p_devis: expect.objectContaining({ client_id: "client-1", notes_internes: "Brouillon préparé avec l'assistant IA." }),
      }),
    );
  });

  it("2. refuse si gerer_devis absent du poste", async () => {
    mocks.permissions = ["acces_ia"];
    const res = await creerDevisDepuisPropositionAction(propositionBase);
    expect(res).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("3. refuse si l'IA-devis est désactivée (sous-flag)", async () => {
    mocks.iaDevisActive = false;
    const res = await creerDevisDepuisPropositionAction(propositionBase);
    expect(res).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("4. refuse si l'IA globale est désactivée", async () => {
    mocks.iaActive = false;
    const res = await creerDevisDepuisPropositionAction(propositionBase);
    expect(res).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("5. refuse un objet vide", async () => {
    const res = await creerDevisDepuisPropositionAction({ ...propositionBase, objet: "   " });
    expect(res).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("6. refuse si aucune ligne valide (désignation vide ou quantité nulle)", async () => {
    const res = await creerDevisDepuisPropositionAction({ ...propositionBase, lignes: [{ ...propositionBase.lignes[0], quantite: 0 }] });
    expect(res).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("7. proposition obsolète : client supprimé entre la proposition et la confirmation", async () => {
    mocks.client = null;
    const res = await creerDevisDepuisPropositionAction(propositionBase);
    expect(res).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("8. idempotence : un brouillon identique créé il y a moins de 10s n'est pas recréé", async () => {
    mocks.devisRecent = { id: "devis-existant" };
    const res = await creerDevisDepuisPropositionAction(propositionBase);
    expect(res).toEqual({ ok: true, devisId: "devis-existant" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("9. prix null -> écrit 0 en base (seule représentation possible, colonne NOT NULL)", async () => {
    await creerDevisDepuisPropositionAction({ ...propositionBase, lignes: [{ ...propositionBase.lignes[0], prixUnitaireHt: null }] });
    const appel = mocks.rpc.mock.calls[0][1] as { p_lignes: Array<{ prix_unitaire_ht: number }> };
    expect(appel.p_lignes[0].prix_unitaire_ht).toBe(0);
  });

  it("10. objet + notes additionnelles concaténés dans notes_client", async () => {
    await creerDevisDepuisPropositionAction({ ...propositionBase, notesClient: "Prévoir accès chantier le matin." });
    const appel = mocks.rpc.mock.calls[0][1] as { p_devis: { notes_client: string } };
    expect(appel.p_devis.notes_client).toBe("Cloisons bureaux\n\nPrévoir accès chantier le matin.");
  });

  it("11. erreur RPC -> message utilisateur clair, pas de crash", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await creerDevisDepuisPropositionAction(propositionBase);
    expect(res).toHaveProperty("error");
  });
});
