import { beforeEach, describe, expect, it, vi } from "vitest";
import { MESSAGE_IMPORT_PRIX_REFUSE, MESSAGE_IMPORT_STOCK_REFUSE } from "@/lib/import/stock-lignes";

const mocks = vi.hoisted(() => ({
  permissions: null as string[] | null,
  reponse: null as null | ((args: { p_lignes: unknown[] }) => { data: unknown; error: { code?: string; message?: string } | null }),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => ({ entrepriseId: "ent-a", userId: "user-1" })) }));
vi.mock("@/lib/permissions", () => ({ permissionsUtilisateur: vi.fn(async () => mocks.permissions) }));
vi.mock("@/lib/import/parse", () => ({ analyserFichier: vi.fn() }));
vi.mock("@/lib/capacite-personnes", () => ({ contexteQuotaPersonnes: vi.fn() }));
vi.mock("@/lib/quota-personnes-message", () => ({ messageImportCapacite: vi.fn() }));
vi.mock("@/lib/erreurs-utilisateur", () => ({ messageErreurUtilisateur: (_n: string, _e: unknown, repli?: string) => repli ?? "erreur" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc, from: mocks.from })),
}));

const { importerDonneesAction } = await import("./import");

const MAPPING_PRIX = { reference: 0, designation: 1, prix_achat_ht: 2, prix_vente_ht: 3 };
const importerStock = (lignes: string[][], mapping: Record<string, number> = MAPPING_PRIX) =>
  importerDonneesAction({ type: "stock", mapping, lignes });

describe("importerDonneesAction — stock (D2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = null;
    mocks.reponse = (args) => ({ data: args.p_lignes.length, error: null });
    mocks.rpc.mockImplementation(async (_nom: string, args: { p_lignes: unknown[] }) => mocks.reponse!(args));
    mocks.from.mockImplementation(() => { throw new Error("from() interdit : le stock passe par la RPC"); });
  });

  it("avec gerer_prix_stock : RPC importer_articles_stock, prix d'achat et de vente transmis", async () => {
    const res = await importerStock([["A1", "Article", "12,50", "20"]]);
    expect(res).toEqual({ inseres: 1, ignores: 0, erreurs: [] });
    expect(mocks.rpc).toHaveBeenCalledWith("importer_articles_stock", {
      p_entreprise_id: "ent-a",
      p_type: "inventaire",
      p_lignes: [{ reference: "A1", designation: "Article", prix_achat_ht: 12.5, prix_vente_ht: 20 }],
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("colonnes de prix sans gerer_prix_stock : refus explicite, aucune écriture", async () => {
    mocks.permissions = ["gerer_stock", "gerer_utilisateurs"];
    const res = await importerStock([["A1", "Article", "12", "20"]]);
    expect(res).toEqual({ inseres: 0, ignores: 1, erreurs: [MESSAGE_IMPORT_PRIX_REFUSE] });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sans colonne tarifaire, sans gerer_prix_stock : l'import fonctionne et n'envoie aucun prix", async () => {
    mocks.permissions = ["gerer_stock", "gerer_utilisateurs"];
    const res = await importerStock([["A1", "Article"]], { reference: 0, designation: 1 });
    expect(res.inseres).toBe(1);
    const lot = mocks.rpc.mock.calls[0][1].p_lignes[0];
    expect(lot).not.toHaveProperty("prix_achat_ht");
    expect(lot).not.toHaveProperty("prix_vente_ht");
  });

  it("cellule de prix vide : clé absente, le prix existant n'est pas remis à 0", async () => {
    await importerStock([["A1", "Article", "", "9"]]);
    const lot = mocks.rpc.mock.calls[0][1].p_lignes[0];
    expect(lot).not.toHaveProperty("prix_achat_ht");
    expect(lot.prix_vente_ht).toBe(9);
  });

  it("refus 42501 renvoyé par la base : message explicite", async () => {
    mocks.reponse = () => ({ data: null, error: { code: "42501", message: "Import refusé" } });
    const res = await importerStock([["A1", "Article", "1", "2"]]);
    expect(res.inseres).toBe(0);
    expect(res.erreurs).toEqual([`Lot 1 : ${MESSAGE_IMPORT_PRIX_REFUSE}`]);
  });

  it("refus gerer_stock renvoyé par la base : message explicite", async () => {
    mocks.reponse = () => ({ data: null, error: { code: "P0001", message: "Accès refusé" } });
    const res = await importerStock([["A1", "Article"]], { reference: 0, designation: 1 });
    expect(res.erreurs).toEqual([`Lot 1 : ${MESSAGE_IMPORT_STOCK_REFUSE}`]);
  });

  it("lots de 200 lignes, total = somme des lignes traitées par la RPC", async () => {
    const lignes = Array.from({ length: 450 }, (_, i) => [`R${i}`, `Article ${i}`]);
    const res = await importerStock(lignes, { reference: 0, designation: 1 });
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(res.inseres).toBe(450);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
