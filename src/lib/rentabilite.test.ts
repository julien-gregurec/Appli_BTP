import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { calculerPrevuRealiseChantiers, calculerRentabiliteChantiers } from "./rentabilite";

function creerRequeteMock(data: unknown[]) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
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
  lignesDevis?: unknown[];
  sousTraitance?: unknown[];
  avenants?: unknown[];
  lignesAvenants?: unknown[];
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
    lignes_devis: fixtures.lignesDevis ?? [],
    sous_traitants_chantiers: fixtures.sousTraitance ?? [],
    avenants: fixtures.avenants ?? [],
    lignes_avenants: fixtures.lignesAvenants ?? [],
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

describe("calculerPrevuRealiseChantiers — prévisionnel et écarts (RENTABILITÉ-V1C)", () => {
  it("CA prévu = devis acceptés (budgetHt), identique à la source déjà utilisée pour le réalisé", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      devis: [{ chantier_id: "chantier-1", montant_ht: 8000 }],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
    });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.caPrevuHt).toBe(8000);
    expect(resultat.ecarts.ca).toEqual({ prevu: 8000, realise: 10000, ecart: 2000, ecartPourcent: 25 });
  });

  it("les heures prévues viennent des lignes de devis main_oeuvre en heures, jamais des lignes en forfait", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      lignesDevis: [
        { quantite: 80, type: "main_oeuvre", unite: "h", devis: { chantier_id: "chantier-1" } },
        { quantite: 20, type: "main_oeuvre", unite: "h", devis: { chantier_id: "chantier-1" } },
        { quantite: 1, type: "forfait", unite: "forfait", devis: { chantier_id: "chantier-1" } },
      ],
      pointages: [{ chantier_id: "chantier-1", employe_id: "emp-1", heures_normales: 90, heures_supplementaires: 0, cout_horaire_applique: 20 }],
    });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.heuresPrevues).toBe(100);
    expect(resultat.ecarts.heures).toEqual({ prevu: 100, realise: 90, ecart: -10, ecartPourcent: -10 });
  });

  it("aucune ligne de devis main_oeuvre en heures → heures prévues absentes (null), pas zéro", async () => {
    const supabase = creerSupabaseMock({ chantiers: [CHANTIER] });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.heuresPrevues).toBeNull();
    expect(resultat.ecarts.heures).toEqual({ prevu: null, realise: 0, ecart: null, ecartPourcent: null });
  });

  it("le coût de main-d'œuvre prévu et les achats prévus restent délibérément absents (aucune source de coût fiable)", async () => {
    const supabase = creerSupabaseMock({ chantiers: [CHANTIER] });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.coutMainOeuvrePrevu).toBeNull();
    expect(resultat.coutAchatsPrevu).toBeNull();
  });

  it("la sous-traitance prévue vient de sous_traitants_chantiers, exclut les missions annulées (fixture déjà filtrée)", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      sousTraitance: [
        { chantier_id: "chantier-1", montant_previsionnel_ht: 1500, statut: "prevue" },
        { chantier_id: "chantier-1", montant_previsionnel_ht: 500, statut: "en_cours" },
      ],
      depenses: [{ chantier_id: "chantier-1", montant_ht: 1800, statut: "payee", categorie: "sous_traitance" }],
    });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.coutSousTraitancePrevu).toBe(2000);
    expect(resultat.ecarts.coutMainOeuvre).toEqual({ prevu: null, realise: 0, ecart: null, ecartPourcent: null });
  });

  it("la marge prévue reste null tant que le coût MO prévu ou les achats prévus sont inconnus (jamais de marge prévue partielle trompeuse)", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      devis: [{ chantier_id: "chantier-1", montant_ht: 8000 }],
      sousTraitance: [{ chantier_id: "chantier-1", montant_previsionnel_ht: 1000, statut: "prevue" }],
    });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.margePrevue).toBeNull();
    expect(resultat.tauxMargePrevu).toBeNull();
    expect(resultat.ecarts.marge).toEqual({ prevu: null, realise: 0, ecart: null, ecartPourcent: null });
  });

  it("aucun Infinity ni NaN quand le prévu vaut 0 (pourcentage d'écart non calculable)", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      devis: [],
      factures: [{ chantier_id: "chantier-1", montant_ht: 500, statut: "payee", type: "facture" }],
    });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.caPrevuHt).toBe(0);
    expect(resultat.ecarts.ca.ecart).toBe(500);
    expect(resultat.ecarts.ca.ecartPourcent).toBeNull();
    expect(Number.isFinite(resultat.ecarts.ca.ecart)).toBe(true);
  });

  it("l'écart peut être négatif (dérive défavorable) sans erreur ni valeur aberrante", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      lignesDevis: [{ quantite: 50, type: "main_oeuvre", unite: "h", devis: { chantier_id: "chantier-1" } }],
      pointages: [{ chantier_id: "chantier-1", employe_id: "emp-1", heures_normales: 80, heures_supplementaires: 0, cout_horaire_applique: 20 }],
    });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.ecarts.heures).toEqual({ prevu: 50, realise: 80, ecart: 30, ecartPourcent: 60 });
  });

  it("le réalisé reste exactement celui de calculerRentabiliteChantiers (aucune seconde source de vérité)", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      factures: [{ chantier_id: "chantier-1", montant_ht: 10000, statut: "payee", type: "facture" }],
      depenses: [{ chantier_id: "chantier-1", montant_ht: 3000, statut: "payee", categorie: "materiaux" }],
    });
    const [directe] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    const [prevuRealise] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(prevuRealise.marge).toBe(directe.marge);
    expect(prevuRealise.factureHt).toBe(directe.factureHt);
    expect(prevuRealise.coutAchats).toBe(directe.coutAchats);
  });
});

describe("calculerRentabiliteChantiers / calculerPrevuRealiseChantiers — avenants (AVENANTS-V1)", () => {
  it("le budget/CA prévu intègre les avenants acceptés en plus du devis initial accepté", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      devis: [{ chantier_id: "chantier-1", montant_ht: 10000 }],
      avenants: [{ chantier_id: "chantier-1", montant_ht: 2000, statut: "accepte" }],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.budgetHt).toBe(12000);
  });

  it("un avenant brouillon/envoyé/refusé/annulé ne doit jamais gonfler le budget (fixture déjà filtrée statut='accepte' côté requête)", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      devis: [{ chantier_id: "chantier-1", montant_ht: 10000 }],
      avenants: [],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.budgetHt).toBe(10000);
  });

  it("une moins-value acceptée (montant négatif) réduit correctement le budget", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      devis: [{ chantier_id: "chantier-1", montant_ht: 10000 }],
      avenants: [
        { chantier_id: "chantier-1", montant_ht: 2000, statut: "accepte" },
        { chantier_id: "chantier-1", montant_ht: -500, statut: "accepte" },
      ],
    });
    const [resultat] = await calculerRentabiliteChantiers(supabase, "entreprise-1");
    expect(resultat.budgetHt).toBe(11500);
  });

  it("les heures prévues intègrent les lignes d'avenant main_oeuvre/h des avenants acceptés", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      lignesDevis: [{ quantite: 100, type: "main_oeuvre", unite: "h", devis: { chantier_id: "chantier-1" } }],
      lignesAvenants: [
        { quantite: 20, type: "main_oeuvre", unite: "h", avenant: { chantier_id: "chantier-1" } },
        { quantite: 1, type: "forfait", unite: "forfait", avenant: { chantier_id: "chantier-1" } },
      ],
    });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.heuresPrevues).toBe(120);
  });

  it("scénario contractuel de référence : devis 10000 + AV01 accepté +2000 + AV02 accepté -500 = CA prévu 11500", async () => {
    const supabase = creerSupabaseMock({
      chantiers: [CHANTIER],
      devis: [{ chantier_id: "chantier-1", montant_ht: 10000 }],
      avenants: [
        { chantier_id: "chantier-1", montant_ht: 2000, statut: "accepte" },
        { chantier_id: "chantier-1", montant_ht: -500, statut: "accepte" },
      ],
    });
    const [resultat] = await calculerPrevuRealiseChantiers(supabase, "entreprise-1");
    expect(resultat.caPrevuHt).toBe(11500);
  });
});
