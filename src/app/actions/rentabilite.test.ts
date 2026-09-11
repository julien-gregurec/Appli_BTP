import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MESSAGE_ANALYSE_RENTABILITE_REFUSEE,
  MESSAGE_COUT_STOCK_INDISPONIBLE,
  MESSAGE_COUT_STOCK_REFUSE,
} from "@/lib/rentabilite-stock";

const mocks = vi.hoisted(() => ({
  permissions: null as string[] | null,
  reponseStock: { data: [] as unknown, error: null as { code?: string; message?: string } | null },
  selects: [] as string[],
  tables: [] as string[],
  rpc: [] as { nom: string; args: unknown }[],
  donnees: {
    factures: [{ montant_ht: 1000, statut: "envoyee", type: "facture" }],
  } as Record<string, unknown[]>,
}));

vi.mock("@/lib/entreprise", () => ({ getContexteEntreprise: vi.fn(async () => ({ entrepriseId: "ent-a", userId: "user-1" })) }));
vi.mock("@/lib/permissions", () => ({
  permissionsUtilisateur: vi.fn(async () => mocks.permissions),
  aAccesIA: (p: string[] | null) => p === null || p.includes("acces_ia"),
}));
vi.mock("@/lib/preview-features", () => ({ iaEstActive: () => true, MESSAGE_IA_INDISPONIBLE: "IA indisponible" }));
vi.mock("@/lib/ai/journal", () => ({ verifierPlafondIA: vi.fn(async () => null), journaliserAppelIA: vi.fn() }));
vi.mock("@/lib/ai/rentabilite", () => ({ analyserRentabilite: vi.fn(async () => ({ texte: "analyse" })) }));
vi.mock("@/lib/erreurs-utilisateur", () => ({ messageErreurUtilisateur: (_n: string, _e: unknown, repli?: string) => repli ?? "erreur" }));

function chaine(table: string) {
  const c: Record<string, unknown> = {};
  for (const m of ["eq", "in", "not", "order"]) c[m] = () => c;
  c.select = (colonnes: string) => { mocks.selects.push(`${table}:${colonnes}`); return c; };
  c.maybeSingle = async () => ({ data: table === "chantiers" ? { id: "ch-1", nom: "Chantier 1" } : null, error: null });
  c.then = (resoudre: (v: unknown) => void) => resoudre({ data: mocks.donnees[table] ?? [], error: null });
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => { mocks.tables.push(table); return chaine(table); },
    rpc: vi.fn(async (nom: string, args: unknown) => {
      mocks.rpc.push({ nom, args });
      return nom === "couts_stock_par_chantier" ? mocks.reponseStock : { data: [], error: null };
    }),
  })),
}));

const { analyserRentabiliteIAAction } = await import("./rentabilite");
const { analyserRentabilite } = await import("@/lib/ai/rentabilite");
const { createClient } = await import("@/lib/supabase/server");

describe("analyserRentabiliteIAAction — D1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = null;
    mocks.reponseStock = { data: [], error: null };
    mocks.selects = []; mocks.tables = []; mocks.rpc = [];
  });

  it("option IA sans acces_rentabilite : refus explicite, aucune lecture, aucun appel IA", async () => {
    mocks.permissions = ["acces_ia"];
    expect(await analyserRentabiliteIAAction("ch-1")).toEqual({ error: MESSAGE_ANALYSE_RENTABILITE_REFUSEE });
    expect(createClient).not.toHaveBeenCalled();
    expect(analyserRentabilite).not.toHaveBeenCalled();
  });

  it("acces_rentabilite sans option IA : refus IA inchangé", async () => {
    mocks.permissions = ["acces_rentabilite"];
    expect(await analyserRentabiliteIAAction("ch-1")).toEqual({ error: "Ton poste n'a pas accès aux fonctionnalités IA." });
    expect(analyserRentabilite).not.toHaveBeenCalled();
  });

  it("coût stock refusé (42501) : erreur explicite, pas d'analyse sur 0 €", async () => {
    mocks.reponseStock = { data: null, error: { code: "42501", message: "Accès à la rentabilité refusé" } };
    expect(await analyserRentabiliteIAAction("ch-1")).toEqual({ error: MESSAGE_COUT_STOCK_REFUSE });
    expect(analyserRentabilite).not.toHaveBeenCalled();
  });

  it("lecture du coût stock en échec : indisponible, pas d'analyse", async () => {
    mocks.reponseStock = { data: null, error: { code: "PGRST000", message: "connexion" } };
    expect(await analyserRentabiliteIAAction("ch-1")).toEqual({ error: MESSAGE_COUT_STOCK_INDISPONIBLE });
    expect(analyserRentabilite).not.toHaveBeenCalled();
  });

  it("succès : le coût stock agrégé alimente l'analyse et la marge", async () => {
    mocks.reponseStock = { data: [{ chantier_id: "ch-1", total: 13.5 }], error: null };
    expect(await analyserRentabiliteIAAction("ch-1")).toEqual({ analyse: "analyse" });
    expect(analyserRentabilite).toHaveBeenCalledWith(expect.objectContaining({ coutStock: 13.5, factureHt: 1000, marge: 986.5 }));
    expect(mocks.rpc).toContainEqual({ nom: "couts_stock_par_chantier", args: { p_entreprise_id: "ent-a", p_chantier_id: "ch-1" } });
  });

  it("habilité et aucune sortie : vrai zéro (pas un repli)", async () => {
    mocks.reponseStock = { data: [], error: null };
    await analyserRentabiliteIAAction("ch-1");
    expect(analyserRentabilite).toHaveBeenCalledWith(expect.objectContaining({ coutStock: 0, marge: 1000 }));
  });

  it("aucune lecture de prix unitaire ni de la table articles_stock", async () => {
    mocks.reponseStock = { data: [{ chantier_id: "ch-1", total: 1 }], error: null };
    await analyserRentabiliteIAAction("ch-1");
    expect(mocks.tables).not.toContain("articles_stock");
    expect(mocks.tables).not.toContain("mouvements_stock");
    expect(mocks.selects.filter((s) => s.includes("prix_") || s.includes("articles_stock"))).toEqual([]);
  });
});
