/**
 * ELSATIA-RENTABILITE-DATA-CORRECTNESS-V1 — gardes sans base.
 *
 * PostgREST plafonne toute réponse à max_rows = 1 000 lignes sans erreur.
 * Les écrans de rentabilité et la section heures de la fiche chantier ne
 * doivent plus additionner côté Next des lignes lues sans pagination : les
 * totaux viennent des RPC SQL (20260930000301), les listes détaillées sont
 * paginées. Ces tests verrouillent les chemins corrigés et le comportement en
 * cas d'erreur (jamais de total partiel présenté comme exact).
 */
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  calculerRentabiliteChantiers,
  lireHeuresChantier,
  lireRentabiliteChantier,
  lireRentabilitePage,
  lireRentabiliteTotaux,
  lireToutesRentabilitesChantiers,
} from "@/lib/rentabilite";

const source = (chemin: string) => readFileSync(chemin, "utf8");
const TABLES_VOLUMINEUSES = ["pointages", "factures", "devis", "depenses_fournisseurs", "mouvements_stock", "notes_frais", "affectations"];

describe("lectures de rentabilité : plus d'agrégat sur des lignes plafonnées", () => {
  it.each([
    ["src/app/(app)/rentabilite/page.tsx"],
    ["src/app/actions/rentabilite.ts"],
    ["src/lib/rentabilite.ts"],
  ])("%s ne lit aucune table volumineuse directement", (chemin) => {
    const code = source(chemin);
    for (const table of TABLES_VOLUMINEUSES) expect(code).not.toContain(`.from("${table}")`);
  });

  it("/rentabilite lit ses totaux et ses pages par RPC, liste paginée", () => {
    const code = source("src/app/(app)/rentabilite/page.tsx");
    expect(code).toContain("lireRentabiliteTotaux(");
    expect(code).toContain("lireRentabilitePage(");
    expect(code).toMatch(/searchParams/);
  });

  it("fiche chantier : heures par RPC, liste des pointages validés paginée", () => {
    const code = source("src/app/(app)/chantiers/[id]/page.tsx");
    expect(code).toContain("lireHeuresChantier(");
    expect(code).not.toMatch(/from\("affectations"\)\.select\("heures"\)/);
    const lecturePointages = code.match(/from\("pointages"\)[^\n]*/)?.[0] ?? "";
    expect(lecturePointages).toContain(".range(");
    expect(lecturePointages).toContain('.eq("verification_statut","valide")');
  });
});

type Appel = { fn: string; args: Record<string, unknown> };
function faux(reponses: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>) {
  const appels: Appel[] = [];
  const supabase = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      appels.push({ fn, args });
      return reponses[fn]?.(args) ?? { data: null, error: { message: `rpc ${fn} inattendue` } };
    },
    from: (table: string) => {
      const chaine = {
        select: () => chaine,
        eq: () => chaine,
        in: (_colonne: string, ids: string[]) => {
          appels.push({ fn: `from:${table}`, args: { ids } });
          return Promise.resolve({ data: ids.map((id) => ({ id, nom: `Chantier ${id}` })), error: null });
        },
      };
      return chaine;
    },
  } as unknown as SupabaseClient;
  return { supabase, appels };
}

const ligne = (id: string, surcharge: Record<string, unknown> = {}) => ({
  chantier_id: id, budget_ht: 0, facture_ht: 1000, facture_ht_avoirs: 0, heures: 10, cout_main_oeuvre: 300,
  cout_horaire_manquant: false, cout_achats: 100, cout_sous_traitance: 50, cout_stock: 20, cout_notes_frais: 10,
  cout_indemnites_paie: 5, marge: 515, taux: 51.5, ...surcharge,
});

describe("chargeurs de rentabilité", () => {
  it("totaux : numériques convertis, erreur RPC → exception (jamais de zéros silencieux)", async () => {
    const ok = faux({ rentabilite_chantiers_totaux: () => ({ data: [{ nb_chantiers: 3, nb_chantiers_avec_activite: 2, nb_chantiers_cout_horaire_manquant: 1, heures: "12.5", facture_ht: "1000.10", cout_main_oeuvre: 1, cout_achats: 2, cout_sous_traitance: 3, cout_stock: 4, cout_notes_frais: 5, cout_indemnites_paie: 6, marge: "979.10", taux: 97.9 }], error: null }) });
    await expect(lireRentabiliteTotaux(ok.supabase, "e")).resolves.toMatchObject({ nbChantiers: 3, heures: 12.5, factureHt: 1000.1, marge: 979.1 });
    const ko = faux({ rentabilite_chantiers_totaux: () => ({ data: null, error: { message: "permission denied" } }) });
    await expect(lireRentabiliteTotaux(ko.supabase, "e")).rejects.toThrow();
  });

  it("page : bornée à 500 lignes, paramètres transmis", async () => {
    const f = faux({ rentabilite_chantiers_page: () => ({ data: [ligne("c1")], error: null }) });
    await lireRentabilitePage(f.supabase, "e", { tri: "marge_desc", limite: 8, decalage: 0, avecActivite: true });
    expect(f.appels[0]).toEqual({ fn: "rentabilite_chantiers_page", args: { p_entreprise_id: "e", p_tri: "marge_desc", p_limite: 8, p_decalage: 0, p_avec_activite: true } });
    await expect(lireRentabilitePage(f.supabase, "e", { tri: "recent", limite: 5000, decalage: 0 })).rejects.toThrow();
  });

  it("toutes les lignes : pages de 500 jusqu'à épuisement, sans perte", async () => {
    const lignes = Array.from({ length: 1234 }, (_, i) => ligne(`c${i}`));
    const f = faux({ rentabilite_chantiers_page: (args) => ({ data: lignes.slice(Number(args.p_decalage), Number(args.p_decalage) + Number(args.p_limite)), error: null }) });
    const toutes = await lireToutesRentabilitesChantiers(f.supabase, "e", "marge_asc");
    expect(toutes).toHaveLength(1234);
    expect(f.appels.map((a) => a.args.p_decalage)).toEqual([0, 500, 1000]);
  });

  it("un chantier (IA) et heures de fiche chantier", async () => {
    const f = faux({
      rentabilite_chantier: () => ({ data: [ligne("c1", { heures: "1462.25" })], error: null }),
      chantier_heures_synthese: () => ({ data: [{ heures_planifiees: "2000.5", nb_affectations: 300, heures_validees: "1462.25", nb_pointages_valides: 1200 }], error: null }),
    });
    expect((await lireRentabiliteChantier(f.supabase, "e", "c1"))?.heures).toBe(1462.25);
    await expect(lireHeuresChantier(f.supabase, "e", "c1")).resolves.toEqual({ heuresPlanifiees: 2000.5, nbAffectations: 300, heuresValidees: 1462.25, nbPointagesValides: 1200 });
  });

  it("copilote : règle historique conservée (CA hors avoirs, marge = CA − MO − achats − sous-traitance), chantiers actifs, plus faibles marges d'abord", async () => {
    const f = faux({
      rentabilite_chantiers_page: (args) => ({
        data: Number(args.p_decalage) > 0 ? [] : [
          ligne("c1", { facture_ht: 1000, facture_ht_avoirs: 200 }),
          ligne("c2", { facture_ht: 0, cout_main_oeuvre: 0, cout_achats: 0, cout_sous_traitance: 0 }),
          ligne("c3", { facture_ht: 100, cout_main_oeuvre: 500 }),
        ],
        error: null,
      }),
    });
    const lignes = await calculerRentabiliteChantiers(f.supabase, "e", { limite: 30 });
    expect(lignes).toEqual([
      { chantierId: "c3", chantierNom: "Chantier c3", budgetHt: 0, factureHt: 100, heures: 10, coutMainOeuvre: 500, coutAchats: 100, coutSousTraitance: 50, marge: -550, taux: -550 },
      { chantierId: "c1", chantierNom: "Chantier c1", budgetHt: 0, factureHt: 800, heures: 10, coutMainOeuvre: 300, coutAchats: 100, coutSousTraitance: 50, marge: 350, taux: 43.75 },
    ]);
    expect(f.appels.filter((a) => a.fn === "from:chantiers")).toEqual([{ fn: "from:chantiers", args: { ids: ["c3", "c1"] } }]);
  });
});
