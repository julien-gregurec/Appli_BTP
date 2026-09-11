import { describe, expect, it } from "vitest";
import {
  ajouterSelection,
  avertissementArchive,
  doublonsDeReference,
  instantaneLigne,
  normaliser,
  rangCorrespondance,
  rechercherArticles,
  type ArticleCatalogue,
} from "@/lib/devis/recherche-articles";

const A = "ent-a";
const B = "ent-b";

function article(p: Partial<ArticleCatalogue> & { id: string }): ArticleCatalogue {
  return {
    entrepriseId: A, source: "article", referenceInterne: null, referenceFabricant: null,
    designation: "Article", description: null, fabricant: null, fournisseur: null, codeBarres: null,
    unite: "u", prixAchatHt: 10, prixVenteHt: 20, tauxTva: 20, stockDisponible: 5, actif: true, ...p,
  };
}

const plaque = article({ id: "p1", referenceInterne: "BA13-200", referenceFabricant: "PLACO-4521", designation: "Plaque de plâtre BA13" });
const rail = article({ id: "r1", referenceInterne: "RAIL-48", referenceFabricant: "BA13-200", designation: "Rail métallique 48" });
const vis = article({ id: "v1", referenceInterne: "VIS-25", designation: "Vis placo", fabricant: "Placoplatre" });

describe("1–2. recherche exacte", () => {
  it("trouve par référence interne exacte", () => {
    expect(rechercherArticles([vis, plaque], "BA13-200", A)[0].id).toBe("p1");
  });
  it("trouve par référence fabricant exacte", () => {
    expect(rechercherArticles([vis, plaque], "PLACO-4521", A).map((a) => a.id)).toEqual(["p1"]);
  });
});

describe("3. plusieurs articles portant la même référence", () => {
  it("les montre TOUS, sans jamais les fusionner", () => {
    const jumeau = article({ id: "p2", referenceInterne: "BA13-200", designation: "Plaque BA13 hydro" });
    const resultats = rechercherArticles([plaque, jumeau], "ba13-200", A);
    expect(resultats.map((a) => a.id).sort()).toEqual(["p1", "p2"]);
  });
  it("signale le doublon au sein d'une entreprise, sans le résoudre", () => {
    const jumeau = article({ id: "p2", referenceInterne: "ba13 200" });
    const groupes = doublonsDeReference([plaque, jumeau], "referenceInterne");
    expect([...groupes.values()]).toEqual([["p1", "p2"]]);
  });
  it("ne voit pas de doublon entre deux entreprises", () => {
    const ailleurs = article({ id: "x1", entrepriseId: B, referenceInterne: "BA13-200" });
    expect(doublonsDeReference([plaque, ailleurs], "referenceInterne").size).toBe(0);
  });
});

describe("4. classement", () => {
  it("met la référence interne exacte AVANT la référence fabricant exacte", () => {
    // « BA13-200 » est la référence INTERNE de la plaque et la référence FABRICANT du rail.
    expect(rechercherArticles([rail, plaque], "BA13-200", A).map((a) => a.id)).toEqual(["p1", "r1"]);
  });
  it("respecte les sept niveaux", () => {
    const scanne = article({ id: "c1", referenceInterne: "CHEV-6", codeBarres: "3760123456789", designation: "Cheville" });
    expect(rangCorrespondance(plaque, "BA13-200")).toBe(1);
    expect(rangCorrespondance(rail, "BA13-200")).toBe(2);
    expect(rangCorrespondance(plaque, "BA13")).toBe(3);
    expect(rangCorrespondance(plaque, "PLACO")).toBe(4);
    expect(rangCorrespondance(scanne, "3760123456789")).toBe(5);
    expect(rangCorrespondance(plaque, "4521")).toBe(6);
    expect(rangCorrespondance(scanne, "456789")).toBe(6);
    expect(rangCorrespondance(vis, "Placoplatre")).toBe(7);
    expect(rangCorrespondance(vis, "introuvable")).toBeNull();
  });
  it("place un code-barres scanné devant une référence qui le contient seulement", () => {
    const scanne = article({ id: "c1", codeBarres: "3760123456789", designation: "Cheville" });
    const contient = article({ id: "c2", referenceInterne: "X3760123456789Y", designation: "Autre" });
    expect(rechercherArticles([contient, scanne], "3760123456789", A).map((a) => a.id)).toEqual(["c1", "c2"]);
  });
  it("ne confond jamais code-barres et référence : chacun garde son champ", () => {
    const scanne = article({ id: "c1", referenceInterne: "CHEV-6", codeBarres: "3760123456789" });
    const [trouve] = rechercherArticles([scanne], "3760123456789", A);
    expect(trouve.referenceInterne).toBe("CHEV-6");
    expect(trouve.codeBarres).toBe("3760123456789");
  });
});

describe("5. tolérance de saisie", () => {
  it("ignore casse, espaces, tirets, points et accents", () => {
    for (const saisie of ["ba13-200", "BA13 200", "BA13.200", "ba13200", " Bà13-2.00 "]) {
      expect(rangCorrespondance(plaque, saisie), saisie).toBe(1);
    }
  });
  it("conserve la valeur ORIGINALE : la normalisation ne sert qu'à comparer", () => {
    const [trouve] = rechercherArticles([plaque], "ba13200", A);
    expect(trouve.referenceInterne).toBe("BA13-200");
  });
  it("traite les ligatures comme la base : « Cœur » = « coeur », « Æ » = « ae »", () => {
    expect(normaliser("Bloc-Cœur 12")).toBe("bloccoeur12");
    expect(normaliser("ÆRO.5")).toBe("aero5");
  });
  it("normalise sans jamais confondre deux références distinctes", () => {
    expect(normaliser("BA13-200")).not.toBe(normaliser("BA13-201"));
  });
});

describe("6. isolation entre entreprises", () => {
  it("n'expose jamais un article d'une autre entreprise, même s'il était renvoyé", () => {
    const ailleurs = article({ id: "x1", entrepriseId: B, referenceInterne: "BA13-200" });
    expect(rechercherArticles([plaque, ailleurs], "BA13-200", A).map((a) => a.id)).toEqual(["p1"]);
  });
});

describe("7–8. sélection multiple, quantités différentes", () => {
  it("crée une ligne par article, chacune avec sa quantité, en une action", () => {
    const issue = ajouterSelection([], [
      { articleId: "p1", quantite: 12 },
      { articleId: "r1", quantite: 3.5 },
      { articleId: "v1", quantite: 400 },
    ], [plaque, rail, vis]);
    expect(issue.etat).toBe("ajoute");
    if (issue.etat !== "ajoute") return;
    expect(issue.lignes.map((l) => [l.sourceId, l.quantite])).toEqual([["p1", 12], ["r1", 3.5], ["v1", 400]]);
  });
  it("refuse une quantité nulle ou négative", () => {
    expect(ajouterSelection([], [{ articleId: "p1", quantite: 0 }], [plaque]).etat).toBe("refuse");
    expect(ajouterSelection([], [{ articleId: "p1", quantite: -1 }], [plaque]).etat).toBe("refuse");
  });
  it("respecte un prix de vente saisi à la sélection, et refuse un prix négatif", () => {
    const issue = ajouterSelection([], [{ articleId: "p1", quantite: 1, prixUnitaireHt: 18.5 }], [plaque]);
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    expect(issue.lignes[0].prixUnitaireHt).toBe(18.5);
    expect(ajouterSelection([], [{ articleId: "p1", quantite: 1, prixUnitaireHt: -1 }], [plaque]).etat).toBe("refuse");
  });
  it("respecte une unité et une description modifiées", () => {
    const issue = ajouterSelection([], [{ articleId: "p1", quantite: 2, unite: "m²", description: "Pose comprise" }], [plaque]);
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    expect(issue.lignes[0]).toMatchObject({ unite: "m²", description: "Pose comprise" });
  });
});

describe("9. article déjà présent dans le devis", () => {
  const existante = instantaneLigne(plaque, { articleId: "p1", quantite: 10 });

  it("n'ajoute RIEN sans décision explicite, et dit ce qu'il faut trancher", () => {
    const issue = ajouterSelection([existante], [{ articleId: "p1", quantite: 5 }], [plaque]);
    expect(issue).toEqual({ etat: "decision_requise", articlesDejaPresents: ["p1"] });
  });
  it("additionne sur demande, sans créer de ligne", () => {
    const issue = ajouterSelection([existante], [{ articleId: "p1", quantite: 5 }], [plaque], { p1: "additionner" });
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    expect(issue.lignes).toHaveLength(1);
    expect(issue.lignes[0].quantite).toBe(15);
  });
  it("crée une nouvelle ligne sur demande", () => {
    const issue = ajouterSelection([existante], [{ articleId: "p1", quantite: 5 }], [plaque], { p1: "nouvelle_ligne" });
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    expect(issue.lignes.map((l) => l.quantite)).toEqual([10, 5]);
  });
  it("annule sur demande, sans toucher à la ligne existante", () => {
    const issue = ajouterSelection([existante], [{ articleId: "p1", quantite: 5 }], [plaque], { p1: "annuler" });
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    expect(issue.lignes).toEqual([existante]);
  });
  it("remplace sur demande la première ligne par un instantané frais, sans créer de ligne", () => {
    const perimee = { ...existante, prixUnitaireHt: 15, designation: "Ancienne désignation" };
    const issue = ajouterSelection([perimee], [{ articleId: "p1", quantite: 7 }], [plaque], { p1: "remplacer" });
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    expect(issue.lignes).toHaveLength(1);
    expect(issue.lignes[0]).toMatchObject({ quantite: 7, prixUnitaireHt: 20, designation: "Plaque de plâtre BA13" });
  });
  it("ne modifie jamais les lignes existantes en place", () => {
    const avant = JSON.stringify(existante);
    ajouterSelection([existante], [{ articleId: "p1", quantite: 5 }], [plaque], { p1: "additionner" });
    expect(JSON.stringify(existante)).toBe(avant);
  });
});

describe("10. article archivé", () => {
  const archive = article({ id: "a1", designation: "Ancien rail", actif: false });
  it("n'est pas ajouté sans confirmation explicite", () => {
    expect(ajouterSelection([], [{ articleId: "a1", quantite: 1 }], [archive]).etat).toBe("refuse");
  });
  it("est ajouté une fois l'ajout consenti", () => {
    expect(ajouterSelection([], [{ articleId: "a1", quantite: 1, confirmeArchive: true }], [archive]).etat).toBe("ajoute");
  });
  it("porte un avertissement ; un article actif n'en porte pas", () => {
    expect(avertissementArchive(archive)).toMatch(/archivé/);
    expect(avertissementArchive(plaque)).toBeNull();
  });
  it("passe après un article actif de même pertinence", () => {
    const actif = article({ id: "b1", referenceInterne: "RAIL", designation: "Rail neuf" });
    const ancien = article({ id: "b2", referenceInterne: "RAIL", designation: "Ancien rail", actif: false });
    expect(rechercherArticles([ancien, actif], "RAIL", A).map((a) => a.id)).toEqual(["b1", "b2"]);
  });
});

describe("11. prix d'achat", () => {
  it("n'est jamais reconstitué quand l'utilisateur n'y a pas droit", () => {
    // La base renvoie `null` sans la permission `voir_prix_stock` ; le module ne l'invente pas.
    const sansDroit = article({ id: "s1", prixAchatHt: null });
    const ligne = instantaneLigne(sansDroit, { articleId: "s1", quantite: 1 });
    expect(Object.values(ligne)).not.toContain(10);
    expect("prixAchatHt" in ligne).toBe(false);
  });
});

describe("14–15. instantané de la ligne de devis", () => {
  it("fige les deux références, distinctes, au moment de l'ajout", () => {
    const ligne = instantaneLigne(plaque, { articleId: "p1", quantite: 1 });
    expect(ligne.referenceInterneInstantane).toBe("BA13-200");
    expect(ligne.referenceFabricantInstantane).toBe("PLACO-4521");
  });
  it("ne change pas quand le catalogue change ensuite", () => {
    const catalogue = { ...plaque };
    const ligne = instantaneLigne(catalogue, { articleId: "p1", quantite: 1 });
    catalogue.referenceInterne = "BA13-200-V2";
    catalogue.designation = "Plaque renommée";
    catalogue.prixVenteHt = 99;
    expect(ligne).toMatchObject({ referenceInterneInstantane: "BA13-200", designation: "Plaque de plâtre BA13", prixUnitaireHt: 20 });
  });
});
