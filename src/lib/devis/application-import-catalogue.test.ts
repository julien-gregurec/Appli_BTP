import { describe, expect, it } from "vitest";
import {
  appliquerOperationsImport,
  planifierOperationsImport,
  repliErreurImport,
  type CoutPrestation,
  type ChampsPrestationBase,
  type InsertionPrestation,
  type PortImportCatalogue,
} from "@/lib/devis/application-import-catalogue";
import {
  planifierImportCatalogue,
  type ArticleExistant,
  type FournisseurConnu,
  type PlanImportCatalogue,
} from "@/lib/devis/import-catalogue";

// Toutes les données sont FICTIVES.

const article = (p: Partial<ArticleExistant> & { id: string }): ArticleExistant => ({
  referenceInterne: null,
  referenceFabricant: null,
  codeBarres: null,
  designation: "Article (fictif)",
  description: null,
  fabricant: null,
  fournisseurId: null,
  unite: "u",
  prixAchatHt: null,
  prixVenteHt: 10,
  tauxTva: 20,
  categorie: null,
  actif: true,
  ...p,
});

const EXISTANTS: ArticleExistant[] = [
  article({ id: "a1", referenceInterne: "BA13", designation: "Plaque BA13 (fictif)", prixAchatHt: 4, prixVenteHt: 8.5 }),
  article({ id: "a2", referenceInterne: "VIS", designation: "Vis (fictif)", prixAchatHt: 6, prixVenteHt: 12 }),
  article({ id: "a3", referenceInterne: "DUP", designation: "Joint gris (fictif)" }),
  article({ id: "a4", referenceInterne: "dup", designation: "Joint anthracite (fictif)" }),
];

const FOURNISSEURS: FournisseurConnu[] = [{ id: "f1", nom: "Négoce Alsace (fictif)", reference: "FRN-001" }];

const FICHIER: Record<string, string>[] = [
  // ligne 2 : création avec prix d'achat et fournisseur
  { reference_interne: "NEW-1", designation: "Rail 48 (fictif)", unite: "ml", prix_vente_ht: "3,20", prix_achat_ht: "1,50", fournisseur: "FRN-001" },
  // ligne 3 : mise à jour du seul prix de vente
  { reference_interne: "BA13", prix_vente_ht: "9,00" },
  // ligne 4 : mise à jour du seul prix d'achat
  { reference_interne: "VIS", prix_achat_ht: "6,50" },
  // ligne 5 : clé partagée par deux articles → doublon, aucun article touché
  { reference_interne: "DUP", designation: "Joint (fictif)" },
  // ligne 6 : création sans taux de TVA
  { reference_interne: "NEW-2", designation: "Mastic (fictif)", unite: "kg", prix_vente_ht: "4" },
];

function plan(peutModifierPrixAchat = true): PlanImportCatalogue {
  return planifierImportCatalogue(FICHIER, EXISTANTS, FOURNISSEURS, { cleRapprochement: "reference_interne", peutModifierPrixAchat });
}

function compteur() {
  let n = 0;
  return () => `id-${++n}`;
}

function operations(peutModifierPrixAchat = true, p = plan(peutModifierPrixAchat)) {
  return planifierOperationsImport(p, { entrepriseId: "e1", peutModifierPrixAchat, nouvelId: compteur() });
}

type Refus = { insertion?: (l: InsertionPrestation) => unknown; maj?: (id: string) => unknown; cout?: (c: CoutPrestation) => unknown };

function portFactice(refus: Refus = {}) {
  const appels = {
    insertions: [] as InsertionPrestation[][],
    majs: [] as Array<{ id: string; champs: ChampsPrestationBase }>,
    couts: [] as CoutPrestation[][],
  };
  const port: PortImportCatalogue = {
    async insererPrestations(lignes) {
      appels.insertions.push([...lignes]);
      return lignes.map((l) => refus.insertion?.(l) ?? null).find(Boolean) ?? null;
    },
    async mettreAJourPrestation(id, champs) {
      appels.majs.push({ id, champs });
      return refus.maj?.(id) ?? null;
    },
    async enregistrerCouts(couts) {
      appels.couts.push([...couts]);
      return couts.map((c) => refus.cout?.(c) ?? null).find(Boolean) ?? null;
    },
    messageErreur: (e) => `message sûr (${(e as { code?: string }).code ?? "?"})`,
  };
  return { port, appels };
}

describe("planifierOperationsImport", () => {
  it("traduit les créations en colonnes de la table, avec un identifiant fixé d'avance", () => {
    const ops = operations();
    expect(ops.creations.map((c) => c.numeroLigne)).toEqual([2, 6]);
    const [rail, mastic] = ops.creations.map((c) => c.ligne);
    expect(rail).toMatchObject({
      id: "id-1",
      entreprise_id: "e1",
      reference_interne: "NEW-1",
      designation: "Rail 48 (fictif)",
      unite: "ml",
      prix_unitaire_ht: 3.2,
      fournisseur_id: "f1",
      actif: true,
      description: null,
    });
    // Taux de TVA absent du fichier : la colonne NOT NULL garde le défaut de la base.
    expect("taux_tva" in mastic).toBe(false);
    // Jamais de prix d'achat dans la table du catalogue.
    for (const c of ops.creations) expect(Object.keys(c.ligne).some((k) => k.includes("achat"))).toBe(false);
  });

  it("une mise à jour n'écrit que les champs changés, et jamais la clé ni un null", () => {
    const ops = operations();
    expect(ops.misesAJour).toEqual([{ numeroLigne: 3, articleId: "a1", champs: { prix_unitaire_ht: 9 } }]);
  });

  it("les prix d'achat partent dans la table des coûts, rattachés au bon article", () => {
    const ops = operations();
    expect(ops.couts).toEqual([
      { numeroLigne: 2, cout: { prestation_id: "id-1", entreprise_id: "e1", prix_achat_ht: 1.5 }, origine: "creation" },
      { numeroLigne: 4, cout: { prestation_id: "a2", entreprise_id: "e1", prix_achat_ht: 6.5 }, origine: "mise_a_jour" },
    ]);
  });

  it("sans le droit de gérer les coûts, aucun prix d'achat n'est écrit, même si le plan en contient", () => {
    // Plan construit AVEC le droit, opérations SANS : défense en profondeur.
    const ops = operations(false, plan(true));
    expect(ops.couts).toEqual([]);
    expect(ops.refus.get(4)).toMatch(/Aucune modification autorisée/);
    expect(ops.misesAJour.map((m) => m.articleId)).toEqual(["a1"]);
  });

  it("un doublon (clé partagée) ne produit aucune opération", () => {
    const ops = operations();
    const vises = [...ops.misesAJour.map((m) => m.articleId), ...ops.couts.map((c) => c.cout.prestation_id)];
    expect(vises).not.toContain("a3");
    expect(vises).not.toContain("a4");
    expect(plan().lignes[3].statut).toBe("doublon");
  });

  it("un plan qui viserait deux fois le même article ne l'applique qu'une fois", () => {
    const p: PlanImportCatalogue = {
      lignes: [
        { numeroLigne: 2, statut: "mise_a_jour", articleId: "a1", donnees: { prixVenteHt: 9 }, message: "" },
        { numeroLigne: 3, statut: "mise_a_jour", articleId: "a1", donnees: { prixVenteHt: 11 }, message: "" },
      ],
      synthese: { creee: 0, mise_a_jour: 2, ignoree: 0, doublon: 0, reference_absente: 0, fournisseur_inconnu: 0, valeur_invalide: 0, refusee: 0 },
      colonnesInconnues: [],
      colonnesEnDouble: [],
    };
    const ops = planifierOperationsImport(p, { entrepriseId: "e1", peutModifierPrixAchat: true, nouvelId: compteur() });
    expect(ops.misesAJour).toHaveLength(1);
    expect(ops.refus.get(3)).toMatch(/déjà modifié par la ligne 2/);
  });

  it("ne recopie jamais un champ inconnu glissé dans les données", () => {
    const p: PlanImportCatalogue = {
      lignes: [{ numeroLigne: 2, statut: "mise_a_jour", articleId: "a1", donnees: { designation: "X", entreprise_id: "autre" } as never, message: "" }],
      synthese: { creee: 0, mise_a_jour: 1, ignoree: 0, doublon: 0, reference_absente: 0, fournisseur_inconnu: 0, valeur_invalide: 0, refusee: 0 },
      colonnesInconnues: [],
      colonnesEnDouble: [],
    };
    const ops = planifierOperationsImport(p, { entrepriseId: "e1", peutModifierPrixAchat: true, nouvelId: compteur() });
    expect(ops.misesAJour[0].champs).toEqual({ designation: "X" });
  });
});

describe("appliquerOperationsImport", () => {
  it("tout passe : le rapport reprend le plan, sans identifiant ni donnée", async () => {
    const p = plan();
    const { port, appels } = portFactice();
    const rapport = await appliquerOperationsImport(p, operations(true, p), port);
    expect(rapport.lignes.map((l) => l.statut)).toEqual(["creee", "mise_a_jour", "mise_a_jour", "doublon", "creee"]);
    expect(rapport.synthese).toMatchObject({ creee: 2, mise_a_jour: 2, doublon: 1, refusee: 0 });
    for (const l of rapport.lignes) expect(Object.keys(l).sort()).toEqual(["message", "numeroLigne", "statut"]);
    expect(appels.insertions).toHaveLength(1);
    expect(appels.couts).toEqual([[
      { prestation_id: "id-1", entreprise_id: "e1", prix_achat_ht: 1.5 },
      { prestation_id: "a2", entreprise_id: "e1", prix_achat_ht: 6.5 },
    ]]);
  });

  it("un lot refusé est rejoué ligne à ligne : seule la ligne fautive devient « refusee »", async () => {
    const p = plan();
    const { port, appels } = portFactice({ insertion: (l) => (l.designation === "Mastic (fictif)" ? { code: "23505" } : null) });
    const rapport = await appliquerOperationsImport(p, operations(true, p), port);
    expect(appels.insertions.map((lot) => lot.length)).toEqual([2, 1, 1]);
    expect(rapport.lignes[0]).toMatchObject({ numeroLigne: 2, statut: "creee" });
    expect(rapport.lignes[4]).toEqual({ numeroLigne: 6, statut: "refusee", message: "Création impossible : message sûr (23505)" });
    expect(rapport.synthese).toMatchObject({ creee: 1, refusee: 1 });
  });

  it("le prix d'achat d'un article dont la création a échoué n'est pas écrit", async () => {
    const p = plan();
    const { port, appels } = portFactice({ insertion: (l) => (l.id === "id-1" ? { code: "23514" } : null) });
    const rapport = await appliquerOperationsImport(p, operations(true, p), port);
    expect(appels.couts.flat().map((c) => c.prestation_id)).toEqual(["a2"]);
    expect(rapport.lignes[0].statut).toBe("refusee");
  });

  it("un coût refusé rend la ligne « refusee » en disant ce qui a été fait", async () => {
    const p = plan();
    const { port } = portFactice({ cout: () => ({ code: "42501" }) });
    const rapport = await appliquerOperationsImport(p, operations(true, p), port, { tailleLot: 1 });
    expect(rapport.lignes[0]).toEqual({
      numeroLigne: 2,
      statut: "refusee",
      message: "Article créé, mais son prix d’achat n’a pas été enregistré : message sûr (42501)",
    });
    expect(rapport.lignes[2]).toEqual({ numeroLigne: 4, statut: "refusee", message: "Prix d’achat non enregistré : message sûr (42501)" });
  });

  it("une mise à jour refusée ou qui lève une exception devient « refusee », les autres lignes passent", async () => {
    const p = plan();
    const { port, appels } = portFactice({
      maj: () => {
        throw Object.assign(new Error("réseau"), { code: "ECONNRESET" });
      },
    });
    const rapport = await appliquerOperationsImport(p, operations(true, p), port);
    expect(rapport.lignes[1]).toEqual({ numeroLigne: 3, statut: "refusee", message: "Mise à jour impossible : message sûr (ECONNRESET)" });
    expect(rapport.lignes[0].statut).toBe("creee");
    expect(appels.majs).toEqual([{ id: "a1", champs: { prix_unitaire_ht: 9 } }]);
  });

  it("les garde-fous de planification apparaissent dans le rapport", async () => {
    const p = plan(true);
    const { port } = portFactice();
    const rapport = await appliquerOperationsImport(p, operations(false, p), port);
    expect(rapport.lignes[2].statut).toBe("refusee");
    expect(rapport.lignes[2].message).toMatch(/Aucune modification autorisée/);
  });
});

describe("repliErreurImport", () => {
  it("donne un message propre à l'import pour les erreurs connues, rien sinon", () => {
    expect(repliErreurImport({ code: "23505" })).toMatch(/désignation/);
    expect(repliErreurImport({ code: "23514" })).toMatch(/120 caractères/);
    expect(repliErreurImport({ code: "PGRST116" })).toMatch(/introuvable/);
    expect(repliErreurImport({ code: "XX000" })).toBeUndefined();
    expect(repliErreurImport(null)).toBeUndefined();
  });
});
