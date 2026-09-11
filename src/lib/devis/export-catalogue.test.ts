import { describe, expect, it } from "vitest";
import { ENTETES_CATALOGUE, ENTETES_LIGNES_DEVIS, exporterCatalogueCsv, exporterLignesDevisCsv } from "@/lib/devis/export-catalogue";
import { planifierImportCatalogue, type ArticleExistant } from "@/lib/devis/import-catalogue";
import { ajouterLigne, instancierOuvrage, type InstanceOuvrage } from "@/lib/devis/ouvrages";
import type { ElementDevis } from "@/lib/devis/presentation";
import { plancherChauffantFictif } from "@/lib/devis/fixtures/plancher-chauffant-fictif";

// Toutes les données sont FICTIVES.

/** Lecteur minimal du format de `csv()` : BOM, `;`, guillemets doublés, fins de ligne CRLF. */
function lignesCsv(texte: string): string[][] {
  expect(texte.startsWith("\uFEFF")).toBe(true);
  const t = texte.slice(1);
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ";") { ligne.push(champ); champ = ""; }
    else if (c === "\r" && t[i + 1] === "\n") { i++; ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
    else champ += c;
  }
  return lignes;
}

function enregistrements(texte: string): Record<string, string>[] {
  const [entete, ...lignes] = lignesCsv(texte);
  return lignes.map((l) => Object.fromEntries(entete.map((e, i) => [e, l[i]])));
}

const ARTICLES: ArticleExistant[] = [
  {
    id: "a1", referenceInterne: "BA-13.200", referenceFabricant: "PLACO-BA13", codeBarres: "0025510000012",
    designation: "Plaque BA13 (fictif)", description: null, fabricant: "Placo fictif", fournisseurId: "f1",
    unite: "u", prixAchatHt: 4.27, prixVenteHt: 8.5, tauxTva: 5.5, categorie: "Plâtrerie", actif: true,
  },
  {
    id: "a2", referenceInterne: "-A12", referenceFabricant: null, codeBarres: null,
    designation: "=HYPERLINK(\"http://exemple.invalid\")", description: "Ligne 1; « guillemets »", fabricant: null,
    fournisseurId: "f-disparu", unite: "m²", prixAchatHt: null, prixVenteHt: 0, tauxTva: null, categorie: null, actif: false,
  },
];
const NOMS_FOURNISSEURS = new Map([["f1", "Négoce Alsace (fictif)"]]);

describe("export du catalogue", () => {
  it("en-têtes exacts, sans prix d'achat : la colonne n'existe pas", () => {
    const texte = exporterCatalogueCsv(ARTICLES, { inclurePrixAchat: false, nomsFournisseurs: NOMS_FOURNISSEURS });
    expect(texte.split("\r\n")[0]).toBe(
      "\uFEFF\"reference_interne\";\"reference_fabricant\";\"code_barres\";\"designation\";\"description\";\"fabricant\";"
      + "\"fournisseur\";\"unite\";\"prix_vente_ht\";\"taux_tva\";\"categorie\";\"actif\"",
    );
    expect(texte).not.toContain("prix_achat_ht");
    expect(texte).not.toContain("4,27");
    for (const l of lignesCsv(texte)) expect(l).toHaveLength(12);
  });

  it("avec prix d'achat : une colonne de plus, en DERNIER", () => {
    const [entete, a1, a2] = lignesCsv(exporterCatalogueCsv(ARTICLES, { inclurePrixAchat: true, nomsFournisseurs: NOMS_FOURNISSEURS }));
    expect(entete).toEqual([...ENTETES_CATALOGUE, "prix_achat_ht"]);
    expect(a1.at(-1)).toBe("4,27");
    expect(a2.at(-1)).toBe("");
  });

  it("BOM, séparateur `;`, virgule décimale, fins de ligne CRLF — ceux de csv()", () => {
    const texte = exporterCatalogueCsv(ARTICLES, { inclurePrixAchat: false, nomsFournisseurs: NOMS_FOURNISSEURS });
    expect(texte.charCodeAt(0)).toBe(0xfeff);
    expect(texte.endsWith("\r\n")).toBe(true);
    expect(texte.split("\r\n")).toHaveLength(4);
    expect(texte.split("\r\n")[1]).toBe(
      "\"BA-13.200\";\"PLACO-BA13\";\"0025510000012\";\"Plaque BA13 (fictif)\";\"\";\"Placo fictif\";"
      + "\"Négoce Alsace (fictif)\";\"u\";8,50;5,50;\"Plâtrerie\";\"oui\"",
    );
  });

  it("neutralise les formules et garde le texte intact", () => {
    const texte = exporterCatalogueCsv(ARTICLES, { inclurePrixAchat: false, nomsFournisseurs: NOMS_FOURNISSEURS });
    expect(texte).toContain("\"'=HYPERLINK(\"\"http://exemple.invalid\"\")\"");
    expect(texte).toContain("\"'-A12\"");
    const a2 = lignesCsv(texte)[2];
    expect(a2[4]).toBe("Ligne 1; « guillemets »");
  });

  it("fournisseur résolu par nom ; inconnu de la table → vide ; archivé → « non » ; taux absent → vide", () => {
    const [, a1, a2] = lignesCsv(exporterCatalogueCsv(ARTICLES, { inclurePrixAchat: false, nomsFournisseurs: NOMS_FOURNISSEURS }));
    expect(a1[6]).toBe("Négoce Alsace (fictif)");
    expect(a2[6]).toBe("");
    expect(a2[9]).toBe("");
    expect(a2[11]).toBe("non");
    expect(a2[8]).toBe("0,00");
  });

  it("aller-retour : exporter puis réimporter sans rien toucher ne change rien", () => {
    const texte = exporterCatalogueCsv(ARTICLES, { inclurePrixAchat: true, nomsFournisseurs: NOMS_FOURNISSEURS });
    const plan = planifierImportCatalogue(
      enregistrements(texte),
      ARTICLES,
      [{ id: "f1", nom: "Négoce Alsace (fictif)", reference: "FRN-001" }],
      { cleRapprochement: "reference_interne", peutModifierPrixAchat: true },
    );
    expect(plan.lignes.map((l) => [l.statut, "articleId" in l ? l.articleId : null])).toEqual([["ignoree", "a1"], ["ignoree", "a2"]]);
    expect(plan.colonnesInconnues).toEqual([]);
  });

  it("aller-retour avec une correction dans le tableur : seule la correction ressort", () => {
    const lignes = enregistrements(exporterCatalogueCsv(ARTICLES, { inclurePrixAchat: false, nomsFournisseurs: NOMS_FOURNISSEURS }));
    lignes[0].prix_vente_ht = "9,00";
    const plan = planifierImportCatalogue(lignes, ARTICLES, [{ id: "f1", nom: "Négoce Alsace (fictif)", reference: "FRN-001" }], {
      cleRapprochement: "code_barres",
      peutModifierPrixAchat: false,
    });
    expect(plan.lignes[0]).toMatchObject({ statut: "mise_a_jour", articleId: "a1", donnees: { prixVenteHt: 9 } });
    expect(plan.lignes[1].statut).toBe("reference_absente");
  });
});

// ── Lignes de devis ───────────────────────────────────────────────────────────

function pc001(): InstanceOuvrage {
  const issue = instancierOuvrage(plancherChauffantFictif(), { cle: "i1", ordre: 2, quantitePrincipale: 120, saisies: { bande: 44 } });
  if (issue.etat !== "pret") throw new Error(issue.motif);
  return ajouterLigne(issue.instance, {
    cle: "ajust", designation: "Ajustement prix global", unite: "forfait", nature: "libre",
    quantite: 1, prixVenteHt: -12.34, tauxTva: 20, origine: "ajustement", motifAjustement: "ajustement_prix_global",
  });
}

const ELEMENTS: ElementDevis[] = [
  {
    type: "ligne", ordre: 3,
    ligne: { cle: "l3", designation: "=HYPERLINK(\"http://exemple.invalid\")", description: null, type: "forfait", quantite: 12.345, unite: "m²", prixUnitaireHt: 10.05, remiseLignePct: 5, tauxTva: 10 },
  },
  { type: "ouvrage", ordre: 2, instance: pc001() },
  {
    type: "ligne", ordre: 1,
    ligne: { cle: "l1", designation: "Dépose de l’existant", description: null, type: "forfait", quantite: 1, unite: "u", prixUnitaireHt: 2.675, remiseLignePct: 0, tauxTva: 20 },
  },
];

const COLONNE = Object.fromEntries(ENTETES_LIGNES_DEVIS.map((c, i) => [c, i])) as Record<(typeof ENTETES_LIGNES_DEVIS)[number], number>;

describe("export des lignes internes d'un devis", () => {
  it("en-têtes exacts, sans coûts : la colonne n'existe pas", () => {
    const texte = exporterLignesDevisCsv(ELEMENTS, { inclureCouts: false });
    expect(texte.split("\r\n")[0]).toBe(`\uFEFF${ENTETES_LIGNES_DEVIS.map((e) => `"${e}"`).join(";")}`);
    expect(ENTETES_LIGNES_DEVIS).toEqual([
      "ordre", "ouvrage_reference", "ouvrage_nom", "ouvrage_version", "cle_ligne", "reference_interne", "reference_fabricant",
      "designation", "quantite", "unite", "prix_unitaire_ht", "remise_ligne_pct", "taux_tva", "total_ht",
    ]);
    expect(texte).not.toContain("prix_achat_ht");
    // Prix d'achat du collecteur (180) et de la chape (110) : aucune autre valeur ne les produit.
    expect(texte).not.toContain("180,00");
    expect(texte).not.toContain("110,00");
    for (const l of lignesCsv(texte)) expect(l).toHaveLength(14);
  });

  it("une ligne par ligne interne, dans l'ordre des éléments puis des composants — internes et ajustements compris", () => {
    const [, ...lignes] = lignesCsv(exporterLignesDevisCsv(ELEMENTS, { inclureCouts: false }));
    expect(lignes.map((l) => l[COLONNE.cle_ligne])).toEqual([
      "l1", "bande", "isolant", "tuyau", "agrafes", "collecteur", "chape", "main_oeuvre", "consommables", "melangeur", "ajust", "l3",
    ]);
    expect(lignes.map((l) => l[COLONNE.ordre])).toEqual(["1", ...Array(10).fill("2"), "3"]);
  });

  it("colonnes d'ouvrage remplies pour ses lignes, vides pour les lignes libres", () => {
    const [, ...lignes] = lignesCsv(exporterLignesDevisCsv(ELEMENTS, { inclureCouts: false }));
    for (const l of lignes.slice(1, 11)) {
      expect([l[COLONNE.ouvrage_reference], l[COLONNE.ouvrage_nom], l[COLONNE.ouvrage_version]]).toEqual(["PC-001", "Plancher chauffant", "1"]);
    }
    for (const l of [lignes[0], lignes[11]]) {
      expect([l[COLONNE.ouvrage_reference], l[COLONNE.ouvrage_nom], l[COLONNE.ouvrage_version]]).toEqual(["", "", ""]);
      expect([l[COLONNE.reference_interne], l[COLONNE.reference_fabricant]]).toEqual(["", ""]);
    }
    const isolant = lignes[2];
    expect([isolant[COLONNE.reference_interne], isolant[COLONNE.reference_fabricant], isolant[COLONNE.quantite], isolant[COLONNE.unite]])
      .toEqual(["PC-ISO", "FAB-ISO-30", "130,00", "m²"]);
    expect([isolant[COLONNE.prix_unitaire_ht], isolant[COLONNE.taux_tva], isolant[COLONNE.total_ht]]).toEqual(["21,00", "20,00", "2730,00"]);
  });

  it("totaux arrondis au centime comme la base, pas en virgule flottante", () => {
    const [, ...lignes] = lignesCsv(exporterLignesDevisCsv(ELEMENTS, { inclureCouts: false }));
    // 1 × 2,675 : PostgreSQL écrit 2,68 ; le flottant 2.675 s'arrondit à 2,67.
    expect((1 * 2.675).toFixed(2)).toBe("2.67");
    expect(lignes[0][COLONNE.total_ht]).toBe("2,68");
    // 12,345 × 10,05 × 0,95 = 117,8638875 → 117,86.
    expect(lignes[11][COLONNE.total_ht]).toBe("117,86");
    // Ajustement négatif, écrit comme un nombre (pas d'apostrophe anti-formule).
    expect([lignes[10][COLONNE.prix_unitaire_ht], lignes[10][COLONNE.total_ht]]).toEqual(["-12,34", "-12,34"]);
  });

  it("quantités et prix au-delà du centime sortent exacts, et ordre/version comme du texte", () => {
    const texte = exporterLignesDevisCsv(ELEMENTS, { inclureCouts: false });
    const [, ...lignes] = lignesCsv(texte);
    expect([lignes[0][COLONNE.prix_unitaire_ht], lignes[11][COLONNE.quantite], lignes[11][COLONNE.remise_ligne_pct]]).toEqual(["2,675", "12,345", "5,00"]);
    expect(texte.split("\r\n")[1].startsWith("\"1\";")).toBe(true);
  });

  it("neutralise une désignation qui commence par « = »", () => {
    expect(exporterLignesDevisCsv(ELEMENTS, { inclureCouts: false })).toContain("\"'=HYPERLINK(\"\"http://exemple.invalid\"\")\"");
  });

  it("avec les coûts : prix d'achat en DERNIÈRE colonne, vide pour les lignes libres et l'ajustement", () => {
    const [entete, ...lignes] = lignesCsv(exporterLignesDevisCsv(ELEMENTS, { inclureCouts: true }));
    expect(entete).toEqual([...ENTETES_LIGNES_DEVIS, "prix_achat_ht"]);
    const achat = Object.fromEntries(lignes.map((l) => [l[COLONNE.cle_ligne], l.at(-1)]));
    expect(achat).toMatchObject({ l1: "", isolant: "12,00", agrafes: "0,03", collecteur: "180,00", chape: "110,00", ajust: "", l3: "" });
  });
});
