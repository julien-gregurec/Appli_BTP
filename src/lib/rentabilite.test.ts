import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { calculerRentabiliteChantiers } from "./rentabilite";

function creerRequeteMock(data: unknown[]) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    in: () => chain,
    order: () => chain,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data, error: null }),
  };
  return chain;
}

type Fixtures = {
  chantiers?: unknown[];
  factures?: unknown[];
  devis?: unknown[];
  pointages?: unknown[];
  depenses?: unknown[];
  indemnites?: unknown[];
  mouvementsStock?: unknown[];
  notesFrais?: unknown[];
  coutsHoraires?: unknown[];
};

function creerSupabaseMock(fixtures: Fixtures) {
  const tables: Record<string, unknown[]> = {
    chantiers: fixtures.chantiers ?? [],
    factures: fixtures.factures ?? [],
    devis: fixtures.devis ?? [],
    pointages: fixtures.pointages ?? [],
    depenses_fournisseurs: fixtures.depenses ?? [],
    mouvements_stock: fixtures.mouvementsStock ?? [],
    notes_frais: fixtures.notesFrais ?? [],
    employes_cout_horaire: fixtures.coutsHoraires ?? [],
  };
  return {
    from: vi.fn((table: string) => creerRequeteMock(tables[table] ?? [])),
    rpc: vi.fn(() => creerRequeteMock(fixtures.indemnites ?? [])),
  } as unknown as SupabaseClient;
}

const CHANTIER = { id: "chantier-1", nom: "Chantier Test" };

describe("calculerRentabiliteChantiers — formule canonique unique (RENTABILITÉ-V1B)", () => {
  it("scénario de référence du cahier des charges : CA 10000, MO 2000, achats 3000 → marge 5000, taux 50%", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      pointages: [{ chantier_id: "chantier-1", employe_id: "emp-1", heures_normales: 80, heures_supplementaires: 0, cout_horaire_applique: 25 }],
      depenses: [{ chantier_id: "chantier-1", montant_ht: 3000, statut: "payee", categorie: "materiaux" }],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.factureHt).toBe(10000);
    expect(resultat.coutMainOeuvre).toBe(2000);
    expect(resultat.coutAchats).toBe(3000);
    expect(resultat.marge).toBe(5000);
    expect(resultat.taux).toBe(50);
  });

  it("la sous-traitance est un poste de coût distinct des achats et réduit la marge", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      depenses: [
        { chantier_id: "chantier-1", montant_ht: 3000, statut: "payee", categorie: "materiaux" },
        { chantier_id: "chantier-1", montant_ht: 1500, statut: "payee", categorie: "sous_traitance" },
      ],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.coutAchats).toBe(3000);
    expect(resultat.coutSousTraitance).toBe(1500);
    expect(resultat.marge).toBe(10000 - 3000 - 1500);
  });

  it("les notes de frais comptées (TTC) réduisent la marge", async () => {
    // Le mock ne rejoue pas le filtre serveur .in("statut", STATUTS_NOTES_FRAIS_COMPTEES) :
    // la fixture ne contient donc que ce qu'une vraie requête Postgres renverrait déjà.
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      notesFrais: [{ chantier_id: "chantier-1", montant_ttc: 200, statut: "remboursee" }],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.coutNotesFrais).toBe(200);
    expect(resultat.marge).toBe(10000 - 200);
  });

  it("les sorties de stock (quantité × prix d'achat HT) réduisent la marge", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      mouvementsStock: [{ chantier_id: "chantier-1", quantite: 10, article: { prix_achat_ht: 4.5 } }],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.coutStock).toBe(45);
    expect(resultat.marge).toBe(10000 - 45);
  });

  it("les indemnités de paie (RPC) réduisent la marge", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      indemnites: [{ chantier_id: "chantier-1", total: 350 }],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.coutIndemnitesPaie).toBe(350);
    expect(resultat.marge).toBe(10000 - 350);
  });

  it("les factures annulées et les avoirs émis sont exclus du chiffre d'affaires", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [
        { chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" },
        { chantier_id: "chantier-1", montant_ht: 500, statut: "annulee", type: "facture" },
        { chantier_id: "chantier-1", montant_ht: 300, statut: "avoir_emis", type: "facture" },
      ],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.factureHt).toBe(10000);
  });

  it("budgetHt (devis acceptés) est calculé mais jamais soustrait de la marge — pas de comparaison prévu/réalisé implicite", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      devis: [{ chantier_id: "chantier-1", montant_ht: 8000 }],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.budgetHt).toBe(8000);
    expect(resultat.marge).toBe(10000);
  });

  it("utilise en priorité le coût horaire figé sur le pointage (cout_horaire_applique), pas le coût courant de l'employé", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      pointages: [{ chantier_id: "chantier-1", employe_id: "emp-1", heures_normales: 8, heures_supplementaires: 0, cout_horaire_applique: 20 }],
      coutsHoraires: [{ employe_id: "emp-1", cout_horaire: 999 }],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.coutMainOeuvre).toBe(160);
  });

  it("se replie sur le coût courant si aucun snapshot n'existe sur le pointage (jamais backfillé)", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      pointages: [{ chantier_id: "chantier-1", employe_id: "emp-1", heures_normales: 8, heures_supplementaires: 0, cout_horaire_applique: null }],
      coutsHoraires: [{ employe_id: "emp-1", cout_horaire: 22 }],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.coutMainOeuvre).toBe(176);
    expect(resultat.coutHoraireManquant).toBe(false);
  });

  it("signale coutHoraireManquant quand aucun coût n'est disponible pour des heures pointées", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      pointages: [{ chantier_id: "chantier-1", employe_id: "emp-inconnu", heures_normales: 8, heures_supplementaires: 0, cout_horaire_applique: null }],
      coutsHoraires: [],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.coutHoraireManquant).toBe(true);
    expect(resultat.coutMainOeuvre).toBe(0);
  });

  it("ne lit que les pointages validés (verification_statut='valide' filtré côté requête)", async () => {
    const supabase = creerSupabaseMock({ chantiers: [CHANTIER] });
    await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(supabase.from).toHaveBeenCalledWith("pointages");
  });

  it("isole correctement plusieurs chantiers sans fuite de coûts croisée", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER, { id: "chantier-2", nom: "Autre chantier" }],
      factures: [
        { chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" },
        { chantier_id: "chantier-2", montant_ht: 4000, statut: "payee", type: "facture" },
      ],
      depenses: [
        { chantier_id: "chantier-1", montant_ht: 3000, statut: "payee", categorie: "materiaux" },
        { chantier_id: "chantier-2", montant_ht: 1000, statut: "payee", categorie: "materiaux" },
      ],
    });
    const resultats = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    const c1 = resultats.find((r) => r.chantierId === "chantier-1");
    const c2 = resultats.find((r) => r.chantierId === "chantier-2");
    expect(c1?.marge).toBe(7000);
    expect(c2?.marge).toBe(3000);
  });

  it("ne produit pas de dérive d'arrondi sur des montants décimaux", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 1234.56, statut: "payee", type: "facture" }],
      pointages: [{ chantier_id: "chantier-1", employe_id: "emp-1", heures_normales: 7.5, heures_supplementaires: 0, cout_horaire_applique: 21.4 }],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.coutMainOeuvre).toBeCloseTo(160.5, 2);
    expect(resultat.marge).toBeCloseTo(1234.56 - 160.5, 2);
  });
});
