import { describe, expect, it } from "vitest";
import {
  planifierImportCatalogue,
  STATUTS_LIGNE_IMPORT,
  type ArticleExistant,
  type DonneesCreation,
  type DonneesMiseAJour,
  type FournisseurConnu,
  type LigneImport,
  type OptionsImport,
  type PlanImportCatalogue,
  type StatutLigneImport,
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

const CATALOGUE: ArticleExistant[] = [
  article({
    id: "a1", referenceInterne: "BA-13.200", referenceFabricant: "PLACO-BA13", codeBarres: "3025510000012",
    designation: "Plaque BA13 (fictif)", fabricant: "Placo fictif", fournisseurId: "f1", unite: "u",
    prixAchatHt: 4.2, prixVenteHt: 8.5, tauxTva: 20, categorie: "Plâtrerie",
  }),
  article({
    id: "a2", referenceInterne: "VIS-35", referenceFabricant: "SPIT-35", codeBarres: "3025510000029",
    designation: "Vis 35 mm (fictif)", unite: "boîte", prixAchatHt: 6, prixVenteHt: 12,
  }),
  // Même référence fabricant, deux teintes : deux articles, jamais un seul.
  article({ id: "a3", referenceInterne: "PEINT-BL", referenceFabricant: "TOLLENS-100", designation: "Peinture blanche (fictif)" }),
  article({ id: "a4", referenceInterne: "PEINT-IV", referenceFabricant: "tollens 100", designation: "Peinture ivoire (fictif)" }),
  // Même référence interne à la normalisation près.
  article({ id: "a5", referenceInterne: "DUP-1", designation: "Joint gris (fictif)" }),
  article({ id: "a6", referenceInterne: "dup.1", designation: "Joint anthracite (fictif)" }),
];

const FOURNISSEURS: FournisseurConnu[] = [
  { id: "f1", nom: "Négoce Alsace (fictif)", reference: "FRN-001" },
  { id: "f2", nom: "Quincaillerie Rhin (fictif)", reference: "FRN-002" },
];

type Ligne = Record<string, string>;

function planifier(
  lignes: Ligne[],
  options: Partial<OptionsImport> = {},
  existants: ArticleExistant[] = CATALOGUE,
  fournisseurs: FournisseurConnu[] = FOURNISSEURS,
): PlanImportCatalogue {
  return planifierImportCatalogue(lignes, existants, fournisseurs, {
    cleRapprochement: "reference_interne",
    peutModifierPrixAchat: true,
    ...options,
  });
}

function ligne(plan: PlanImportCatalogue, numero: number, statut: StatutLigneImport): LigneImport {
  const l = plan.lignes.find((x) => x.numeroLigne === numero);
  expect(l, `ligne ${numero}`).toBeDefined();
  expect(l!.statut, l!.message).toBe(statut);
  return l!;
}

function creation(plan: PlanImportCatalogue, numero = 2): DonneesCreation {
  const l = ligne(plan, numero, "creee");
  return (l as Extract<LigneImport, { statut: "creee" }>).donnees;
}

function miseAJour(plan: PlanImportCatalogue, numero = 2): { articleId: string; donnees: DonneesMiseAJour; message: string } {
  return ligne(plan, numero, "mise_a_jour") as Extract<LigneImport, { statut: "mise_a_jour" }>;
}

const NOUVEAU: Ligne = { reference_interne: "NEUF-1", designation: "Enduit de lissage (fictif)", unite: "sac", prix_vente_ht: "18,90" };

describe("rapprochement : la seule colonne clé, comparée par normaliser()", () => {
  it("retrouve l'article malgré la casse, les espaces, tirets et points", () => {
    const plan = planifier([{ reference_interne: "ba 13 200", prix_vente_ht: "9,10" }]);
    expect(miseAJour(plan)).toMatchObject({ articleId: "a1", donnees: { prixVenteHt: 9.1 } });
  });

  it("n'utilise AUCUNE autre colonne : interne et code-barres identiques ne rapprochent pas en clé fabricant", () => {
    const plan = planifier(
      [{ reference_interne: "BA-13.200", reference_fabricant: "NOUVEAU-1", code_barres: "3025510000012", designation: "Autre plaque (fictif)", unite: "u", prix_vente_ht: "1" }],
      { cleRapprochement: "reference_fabricant" },
    );
    const d = creation(plan);
    expect(d).toMatchObject({ referenceInterne: "BA-13.200", referenceFabricant: "NOUVEAU-1", codeBarres: "3025510000012" });
  });

  it("clé code-barres", () => {
    const plan = planifier([{ code_barres: "3025 5100 0002 9", prix_vente_ht: "12,40" }], { cleRapprochement: "code_barres" });
    expect(miseAJour(plan)).toMatchObject({ articleId: "a2", donnees: { prixVenteHt: 12.4 } });
  });

  it("clé « aucune » : chaque ligne valide est une création, même répétée ou déjà au catalogue", () => {
    const plan = planifier(
      [
        { reference_interne: "BA-13.200", designation: "Plaque BA13 (fictif)", unite: "u", prix_vente_ht: "8,50" },
        { reference_interne: "BA-13.200", designation: "Plaque BA13 (fictif)", unite: "u", prix_vente_ht: "8,50" },
        { designation: "Sans référence (fictif)", unite: "u", prix_vente_ht: "1" },
      ],
      { cleRapprochement: "aucune" },
    );
    expect(plan.lignes.map((l) => l.statut)).toEqual(["creee", "creee", "creee"]);
    expect(creation(plan, 4).referenceInterne).toBeNull();
  });
});

describe("zéro, un, ou plusieurs articles existants", () => {
  it("aucun : création complète, valeurs vides à null, actif par défaut", () => {
    const d = creation(planifier([{ ...NOUVEAU, taux_tva: "10", categorie: "Enduits" }]));
    expect(d).toEqual({
      referenceInterne: "NEUF-1",
      referenceFabricant: null,
      codeBarres: null,
      designation: "Enduit de lissage (fictif)",
      description: null,
      fabricant: null,
      fournisseurId: null,
      unite: "sac",
      prixVenteHt: 18.9,
      tauxTva: 10,
      categorie: "Enduits",
      actif: true,
    });
  });

  it.each([
    [{ designation: "" }, "designation est obligatoire"],
    [{ unite: "" }, "unite est obligatoire"],
    [{ prix_vente_ht: "" }, "prix_vente_ht est obligatoire"],
    [{ designation: "", unite: "", prix_vente_ht: "" }, "designation, unite, prix_vente_ht sont obligatoires"],
  ])("création sans champ obligatoire %o : refusée, message précis", (manque, attendu) => {
    const l = ligne(planifier([{ ...NOUVEAU, ...manque }]), 2, "refusee");
    expect(l.message).toContain(attendu);
    expect(l).not.toHaveProperty("donnees");
  });

  it("un seul : mise à jour des SEULS champs qui changent", () => {
    const plan = planifier([{
      reference_interne: "BA-13.200", designation: "Plaque BA13 hydro (fictif)", unite: "u",
      prix_vente_ht: "8,50", taux_tva: "20", fabricant: "Placo fictif", actif: "oui",
    }]);
    const m = miseAJour(plan);
    expect(m.donnees).toEqual({ designation: "Plaque BA13 hydro (fictif)" });
    expect(m.message).toBe("Modifié : designation.");
  });

  it("un seul, rien ne change : ignorée, avec l'article visé", () => {
    const l = ligne(planifier([{ reference_interne: "BA-13.200", designation: "Plaque BA13 (fictif)", prix_vente_ht: "8,5", fournisseur: "FRN-001" }]), 2, "ignoree");
    expect(l).toMatchObject({ articleId: "a1", message: "Aucun changement par rapport au catalogue." });
  });

  it("plusieurs articles partagent la clé : doublon REFUSÉ, aucun article modifié", () => {
    const plan = planifier([{ reference_fabricant: "Tollens-100", prix_vente_ht: "30" }], { cleRapprochement: "reference_fabricant" });
    const l = ligne(plan, 2, "doublon");
    expect(l).toMatchObject({ articleIds: ["a3", "a4"] });
    expect(l.message).toContain("2 articles du catalogue");
    expect(l).not.toHaveProperty("donnees");
  });

  it("doublon en base détecté même si la ligne est par ailleurs invalide", () => {
    const l = ligne(planifier([{ reference_interne: "DUP 1", prix_vente_ht: "abc" }]), 2, "doublon");
    expect(l).toMatchObject({ articleIds: ["a5", "a6"] });
  });
});

describe("doublons à l'intérieur du fichier", () => {
  it("la première occurrence est traitée, les suivantes sont des doublons qui la citent", () => {
    const plan = planifier([
      { reference_interne: "VIS-35", prix_vente_ht: "13" },
      NOUVEAU,
      { reference_interne: "vis 35", prix_vente_ht: "14" },
      { reference_interne: "V.I.S/35", prix_vente_ht: "15" },
    ]);
    expect(miseAJour(plan, 2).donnees).toEqual({ prixVenteHt: 13 });
    for (const n of [4, 5]) {
      const l = ligne(plan, n, "doublon");
      expect(l).toMatchObject({ premiereLigne: 2 });
      expect(l.message).toContain("ligne 2");
    }
  });

  it("la première occurrence possède la clé même si elle est refusée", () => {
    const plan = planifier([
      { ...NOUVEAU, prix_vente_ht: "-1" },
      { ...NOUVEAU, reference_interne: "neuf 1" },
    ]);
    ligne(plan, 2, "valeur_invalide");
    expect(ligne(plan, 3, "doublon")).toMatchObject({ premiereLigne: 2 });
  });
});

describe("référence absente", () => {
  it("cellule clé vide", () => {
    const l = ligne(planifier([{ reference_interne: "  ", designation: "X", unite: "u", prix_vente_ht: "1" }]), 2, "reference_absente");
    expect(l.message).toContain("reference_interne est vide");
  });

  it("colonne clé absente du fichier", () => {
    const l = ligne(planifier([{ designation: "X", unite: "u", prix_vente_ht: "1" }], { cleRapprochement: "code_barres" }), 2, "reference_absente");
    expect(l.message).toContain("« code_barres »");
    expect(l.message).toContain("absente du fichier");
  });

  it("« - » en colonne clé ne rapproche rien : il se normalise en chaîne vide", () => {
    const l = ligne(planifier([{ reference_interne: "-", designation: "X", unite: "u", prix_vente_ht: "1" }]), 2, "reference_absente");
    expect(l.message).toContain("ni lettre ni chiffre");
  });
});

describe("fournisseurs : rapprochés par nom ou référence, jamais créés", () => {
  it("par nom normalisé", () => {
    expect(creation(planifier([{ ...NOUVEAU, fournisseur: "negoce alsace (FICTIF)" }])).fournisseurId).toBe("f1");
  });

  it("par référence, en mise à jour", () => {
    expect(miseAJour(planifier([{ reference_interne: "BA-13.200", fournisseur: "frn 002" }]))).toMatchObject({
      articleId: "a1",
      donnees: { fournisseurId: "f2" },
    });
  });

  it("inconnu : ligne refusée, aucun fournisseur créé, article visé indiqué", () => {
    const plan = planifier([{ reference_interne: "BA-13.200", prix_vente_ht: "9", fournisseur: "Inconnu SA" }]);
    const l = ligne(plan, 2, "fournisseur_inconnu");
    expect(l).toMatchObject({ articleId: "a1" });
    expect(l.message).toContain("« Inconnu SA »");
    expect(l.message).toContain("ne crée jamais de fournisseur");
    expect(l).not.toHaveProperty("donnees");
  });

  it("inconnu en création aussi", () => {
    ligne(planifier([{ ...NOUVEAU, fournisseur: "Würth (fictif)" }]), 2, "fournisseur_inconnu");
  });

  it("ambigu (deux fournisseurs de même nom, ou nom de l'un = référence de l'autre) : refusé", () => {
    const homonymes = [...FOURNISSEURS, { id: "f3", nom: "Négoce Alsace (fictif)", reference: "FRN-003" }];
    const l = ligne(planifier([{ ...NOUVEAU, fournisseur: "Négoce Alsace (fictif)" }], {}, CATALOGUE, homonymes), 2, "fournisseur_inconnu");
    expect(l.message).toContain("2 fournisseurs");
    const croises = [...FOURNISSEURS, { id: "f4", nom: "FRN-001", reference: "FRN-004" }];
    ligne(planifier([{ ...NOUVEAU, fournisseur: "FRN-001" }], {}, CATALOGUE, croises), 2, "fournisseur_inconnu");
  });

  it("le même fournisseur trouvé par son nom ET sa référence n'est pas une ambiguïté", () => {
    const f = [{ id: "f9", nom: "ABC", reference: "abc" }];
    expect(creation(planifier([{ ...NOUVEAU, fournisseur: "ABC" }], {}, CATALOGUE, f)).fournisseurId).toBe("f9");
  });
});

describe("nombres et actif", () => {
  it.each([
    ["1 234,50", 1234.5],
    ["1234,5", 1234.5],
    ["1234.5", 1234.5],
    ["12,50 €", 12.5],
    ["1\u202f234,50", 1234.5],
    ["1\u00a0234", 1234],
    ["0", 0],
    ["-0", 0],
  ])("prix « %s » → %d", (texte, attendu) => {
    const d = creation(planifier([{ ...NOUVEAU, prix_vente_ht: texte }]));
    expect(Object.is(d.prixVenteHt, attendu)).toBe(true);
  });

  it.each([
    ["-3", "ne peut pas être négatif"],
    ["abc", "n’est pas un nombre"],
    ["NaN", "n’est pas un nombre"],
    ["Infinity", "n’est pas un nombre"],
    ["1.234,50", "n’est pas un nombre"],
    ["1,234.50", "n’est pas un nombre"],
    ["12,345", "deux décimales au plus"],
    ["12.500", "deux décimales au plus"],
    ["99999999999", "dépasse"],
  ])("prix « %s » : valeur_invalide nommant la colonne", (texte, motif) => {
    const l = ligne(planifier([{ ...NOUVEAU, prix_vente_ht: texte }]), 2, "valeur_invalide");
    expect(l.message).toContain(`prix_vente_ht : « ${texte} »`);
    expect(l.message).toContain(motif);
  });

  it.each([["0", 0], ["5,5", 5.5], ["20 %", 20], ["100", 100]])("taux « %s » accepté", (texte, attendu) => {
    expect(creation(planifier([{ ...NOUVEAU, taux_tva: texte }])).tauxTva).toBe(attendu);
  });

  it.each(["-1", "100,01", "150", "vingt"])("taux « %s » hors de [0, 100] ou illisible : refusé", (texte) => {
    expect(ligne(planifier([{ ...NOUVEAU, taux_tva: texte }]), 2, "valeur_invalide").message).toContain("taux_tva");
  });

  it("toutes les colonnes fautives sont nommées d'un coup", () => {
    const l = ligne(planifier([{ ...NOUVEAU, prix_vente_ht: "-1", taux_tva: "200", actif: "peut-être" }]), 2, "valeur_invalide");
    for (const c of ["prix_vente_ht", "taux_tva", "actif"]) expect(l.message).toContain(c);
  });

  it("une valeur invalide sur une mise à jour indique l'article visé", () => {
    expect(ligne(planifier([{ reference_interne: "VIS-35", taux_tva: "x" }]), 2, "valeur_invalide")).toMatchObject({ articleId: "a2" });
  });

  it.each([
    ["oui", true], ["Oui", true], ["TRUE", true], ["1", true], ["Actif", true],
    ["non", false], ["NON", false], ["false", false], ["0", false], ["archivé", false], ["ARCHIVÉ", false], ["archive", false],
  ])("actif « %s » → %s", (texte, attendu) => {
    expect(creation(planifier([{ ...NOUVEAU, actif: texte }])).actif).toBe(attendu);
  });

  it.each(["peut-être", "constructor", "toString", "2", "vrai"])("actif « %s » : refusé", (texte) => {
    expect(ligne(planifier([{ ...NOUVEAU, actif: texte }]), 2, "valeur_invalide").message).toContain("actif");
  });

  it("archiver un article existant par l'import", () => {
    expect(miseAJour(planifier([{ reference_interne: "VIS-35", actif: "archivé" }])).donnees).toEqual({ actif: false });
  });
});

describe("trois références distinctes, cellule vide = inchangé, valeurs originales", () => {
  it("une création avec la seule référence fabricant ne la recopie nulle part", () => {
    const d = creation(planifier([{ reference_fabricant: "SIKA-77", designation: "Mastic (fictif)", unite: "u", prix_vente_ht: "7" }], { cleRapprochement: "reference_fabricant" }));
    expect(d).toMatchObject({ referenceInterne: null, referenceFabricant: "SIKA-77", codeBarres: null });
  });

  it("chaque référence n'est alimentée que par SA colonne", () => {
    const plan = planifier([{ reference_fabricant: "placo ba13", reference_interne: "BA-13.201", code_barres: "123" }], { cleRapprochement: "reference_fabricant" });
    expect(miseAJour(plan)).toMatchObject({ articleId: "a1", donnees: { referenceInterne: "BA-13.201", codeBarres: "123" } });
    expect(miseAJour(plan).donnees).not.toHaveProperty("referenceFabricant");
  });

  it("des cellules vides n'effacent rien", () => {
    const m = miseAJour(planifier([{
      reference_interne: "BA-13.200", designation: "Plaque BA13 hydro (fictif)",
      reference_fabricant: "", code_barres: "", description: "", fabricant: " ", fournisseur: "", categorie: "",
      prix_achat_ht: "", prix_vente_ht: "", taux_tva: "", actif: "", unite: "",
    }]));
    expect(m.donnees).toEqual({ designation: "Plaque BA13 hydro (fictif)" });
    expect(Object.values(m.donnees)).not.toContain(null);
  });

  it("la colonne clé n'est jamais réécrite pour une simple variante d'écriture", () => {
    const m = miseAJour(planifier([{ reference_interne: "ba 13 200", reference_fabricant: "PLACO-BA13-V2" }]));
    expect(m.donnees).toEqual({ referenceFabricant: "PLACO-BA13-V2" });
  });

  it("« - » n'est pas spécial hors clé : écrit tel quel", () => {
    expect(miseAJour(planifier([{ reference_interne: "VIS-35", reference_fabricant: "-" }])).donnees).toEqual({ referenceFabricant: "-" });
    expect(creation(planifier([{ ...NOUVEAU, code_barres: "-", description: "-" }]))).toMatchObject({ codeBarres: "-", description: "-" });
  });

  it("conserve la valeur originale, seulement débarrassée de ses blancs extérieurs", () => {
    const d = creation(planifier([{ ...NOUVEAU, reference_interne: "  Ré-F.01/b  ", reference_fabricant: " FAB_01 ", designation: "  Enduit   de lissage  " }]));
    expect(d).toMatchObject({ referenceInterne: "Ré-F.01/b", referenceFabricant: "FAB_01", designation: "Enduit   de lissage" });
  });

  it("un changement de casse de la désignation est un vrai changement", () => {
    expect(miseAJour(planifier([{ reference_interne: "VIS-35", designation: "VIS 35 MM (FICTIF)" }])).donnees).toEqual({ designation: "VIS 35 MM (FICTIF)" });
  });
});

describe("prix d'achat sans le droit de le modifier", () => {
  const sansDroit = { peutModifierPrixAchat: false };

  it("création : prix non importé, la ligne est créée, le message le dit", () => {
    const plan = planifier([{ ...NOUVEAU, prix_achat_ht: "5,00" }], sansDroit);
    const d = creation(plan);
    expect("prixAchatHt" in d).toBe(false);
    expect(plan.lignes[0].message).toContain("Prix d’achat non importé");
  });

  it("mise à jour : les autres champs passent, le prix d'achat jamais", () => {
    const m = miseAJour(planifier([{ reference_interne: "BA-13.200", prix_achat_ht: "4,90", prix_vente_ht: "9" }], sansDroit));
    expect(m.donnees).toEqual({ prixVenteHt: 9 });
    expect(m.message).toContain("Prix d’achat non importé");
  });

  it("seul le prix d'achat différait : ignorée, avec la mention", () => {
    const l = ligne(planifier([{ reference_interne: "BA-13.200", prix_achat_ht: "4,90" }], sansDroit), 2, "ignoree");
    expect(l.message).toContain("Prix d’achat non importé");
  });

  it("un prix d'achat illisible ne bloque pas une ligne dont il ne sera pas importé", () => {
    expect("prixAchatHt" in creation(planifier([{ ...NOUVEAU, prix_achat_ht: "-2" }], sansDroit))).toBe(false);
  });

  it("aucun plan sans le droit ne porte de prix d'achat, où que ce soit", () => {
    const plan = planifier([
      { ...NOUVEAU, prix_achat_ht: "5" },
      { reference_interne: "BA-13.200", prix_achat_ht: "1", designation: "Autre (fictif)" },
      { reference_interne: "VIS-35", prix_achat_ht: "9" },
    ], sansDroit);
    expect(plan.lignes.map((l) => l.statut)).toEqual(["creee", "mise_a_jour", "ignoree"]);
    expect(JSON.stringify(plan.lignes)).not.toContain("prixAchatHt");
  });

  it("avec le droit : importé en création, en mise à jour, et ignoré s'il est identique", () => {
    expect(creation(planifier([{ ...NOUVEAU, prix_achat_ht: "5,00" }])).prixAchatHt).toBe(5);
    expect(miseAJour(planifier([{ reference_interne: "BA-13.200", prix_achat_ht: "4,90" }])).donnees).toEqual({ prixAchatHt: 4.9 });
    ligne(planifier([{ reference_interne: "BA-13.200", prix_achat_ht: "4,20" }]), 2, "ignoree");
    expect(ligne(planifier([{ ...NOUVEAU, prix_achat_ht: "-2" }]), 2, "valeur_invalide").message).toContain("prix_achat_ht");
  });

  it("avec le droit, une création sans prix d'achat n'en porte pas", () => {
    expect("prixAchatHt" in creation(planifier([NOUVEAU]))).toBe(false);
  });
});

describe("en-tête et lecture des cellules", () => {
  it("en-têtes insensibles à la casse et aux blancs, BOM compris", () => {
    const d = creation(planifier([{ "\uFEFF Reference_Interne ": "NEUF-9", " DESIGNATION": "Colle (fictif)", Unite: "kg", "Prix_Vente_HT ": "3" }]));
    expect(d).toMatchObject({ referenceInterne: "NEUF-9", designation: "Colle (fictif)", unite: "kg", prixVenteHt: 3 });
  });

  it("les colonnes inconnues sont signalées, sans bloquer", () => {
    const plan = planifier([{ ...NOUVEAU, Couleur: "rouge", " Remarques ": "x" }]);
    expect(plan.colonnesInconnues).toEqual(["Couleur", "Remarques"]);
    creation(plan);
  });

  it("une colonne présente deux fois : tout est refusé, rien n'est choisi", () => {
    const plan = planifier([
      { ...NOUVEAU, Designation: "Autre (fictif)" },
      { reference_interne: "VIS-35", prix_vente_ht: "20", designation: "", Designation: "" },
    ]);
    expect(plan.colonnesEnDouble).toEqual(["designation"]);
    expect(plan.synthese.refusee).toBe(2);
    expect(plan.lignes[0].message).toContain("« designation »");
  });

  it("une ligne vide est ignorée", () => {
    const l = ligne(planifier([{ reference_interne: "", designation: " ", unite: "" }]), 2, "ignoree");
    expect(l.message).toBe("Ligne vide.");
  });

  it("retire l'échappement anti-formule de csv(), et lui seul", () => {
    const d = creation(planifier([{ ...NOUVEAU, reference_interne: "'-A12", designation: "'=SOMME(A1)", description: "'abc", fabricant: "'+33" }]));
    expect(d).toMatchObject({ referenceInterne: "-A12", designation: "=SOMME(A1)", description: "'abc", fabricant: "+33" });
  });

  it("numérote à partir de 2 (l'en-tête est la ligne 1)", () => {
    expect(planifier([NOUVEAU, { ...NOUVEAU, reference_interne: "NEUF-2" }]).lignes.map((l) => l.numeroLigne)).toEqual([2, 3]);
  });

  it("n'altère ni le fichier, ni le catalogue, ni les fournisseurs", () => {
    const lignes = [{ reference_interne: "BA-13.200", prix_vente_ht: "9" }, NOUVEAU];
    const avant = structuredClone({ lignes, CATALOGUE, FOURNISSEURS });
    planifier(lignes);
    expect({ lignes, CATALOGUE, FOURNISSEURS }).toEqual(avant);
  });
});

describe("fichier mixte : les huit statuts et la synthèse", () => {
  it("produit chaque statut au moins une fois et une synthèse exacte", () => {
    const plan = planifier([
      /* 2 */ NOUVEAU,
      /* 3 */ { reference_interne: "VIS-35", prix_vente_ht: "12,80" },
      /* 4 */ { reference_interne: "BA-13.200", designation: "Plaque BA13 (fictif)" },
      /* 5 */ { reference_interne: "vis 35", prix_vente_ht: "13" },
      /* 6 */ { reference_interne: "", designation: "Orpheline (fictif)", unite: "u", prix_vente_ht: "1" },
      /* 7 */ { reference_interne: "NEUF-2", designation: "Colle (fictif)", unite: "u", prix_vente_ht: "4", fournisseur: "Inconnu SA" },
      /* 8 */ { reference_interne: "NEUF-3", designation: "Primaire (fictif)", unite: "l", prix_vente_ht: "6", taux_tva: "150" },
      /* 9 */ { reference_interne: "NEUF-4", designation: "Bande (fictif)", prix_vente_ht: "2" },
      /* 10 */ { reference_interne: "DUP-1", prix_vente_ht: "3" },
      /* 11 */ { reference_interne: "NEUF-5", designation: "Cornière (fictif)", unite: "ml", prix_vente_ht: "1,20", fournisseur: "FRN-002" },
    ]);
    expect(plan.lignes.map((l) => [l.numeroLigne, l.statut])).toEqual([
      [2, "creee"],
      [3, "mise_a_jour"],
      [4, "ignoree"],
      [5, "doublon"],
      [6, "reference_absente"],
      [7, "fournisseur_inconnu"],
      [8, "valeur_invalide"],
      [9, "refusee"],
      [10, "doublon"],
      [11, "creee"],
    ]);
    expect(plan.synthese).toEqual({
      creee: 2,
      mise_a_jour: 1,
      ignoree: 1,
      doublon: 2,
      reference_absente: 1,
      fournisseur_inconnu: 1,
      valeur_invalide: 1,
      refusee: 1,
    });
    expect(Object.keys(plan.synthese).sort()).toEqual([...STATUTS_LIGNE_IMPORT].sort());
    expect(Object.values(plan.synthese).reduce((a, b) => a + b, 0)).toBe(plan.lignes.length);
    expect(ligne(plan, 9, "refusee").message).toContain("unite est obligatoire");
    expect(creation(plan, 11).fournisseurId).toBe("f2");
  });

  it("un fichier vide donne un plan vide et une synthèse à zéro", () => {
    const plan = planifier([]);
    expect(plan.lignes).toEqual([]);
    expect(Object.values(plan.synthese).every((n) => n === 0)).toBe(true);
  });
});
