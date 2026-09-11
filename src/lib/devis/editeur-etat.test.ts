import { describe, expect, it } from "vitest";
import {
  ajouterLigneLibre,
  ajouterOuvrage,
  appliquerSelectionArticles,
  cleElement,
  deplacerElement,
  modifierLigneLibre,
  retirerElement,
  validerBrouillon,
  type EtatElements,
} from "@/lib/devis/editeur-etat";
import { instancierOuvrage } from "@/lib/devis/ouvrages";
import type { ArticleCatalogue } from "@/lib/devis/recherche-articles";
import { plancherChauffantFictif } from "@/lib/devis/fixtures/plancher-chauffant-fictif";

const A = "ent-a";
const article = (p: Partial<ArticleCatalogue> & { id: string }): ArticleCatalogue => ({
  entrepriseId: A, source: "prestation", referenceInterne: null, referenceFabricant: null, designation: "Article",
  description: null, fabricant: null, fournisseur: null, codeBarres: null, unite: "u", prixAchatHt: 10, prixVenteHt: 20,
  tauxTva: 20, stockDisponible: null, actif: true, ...p,
});
const plaque = article({ id: "p1", referenceInterne: "BA13-200", referenceFabricant: "PLACO-4521", designation: "Plaque BA13", typeLigne: "fourniture" });
const pose = article({ id: "p2", referenceInterne: "POSE-01", designation: "Pose", unite: "h", prixVenteHt: 55, typeLigne: "main_oeuvre", tauxTva: 10 });
const stock = article({ id: "s1", source: "article", referenceInterne: "STK-9", designation: "Cheville", tauxTva: null, prixAchatHt: null });

const vide: EtatElements = { elements: [], origines: {} };
let compteur = 0;
const cle = () => `c${++compteur}`;

describe("7–8. sélection multiple dans l'éditeur", () => {
  it("ajoute trois articles en une action, une ligne chacun, avec leurs quantités", () => {
    compteur = 0;
    const issue = appliquerSelectionArticles(vide, [
      { articleId: "p1", quantite: 12 }, { articleId: "p2", quantite: 3.5 }, { articleId: "s1", quantite: 40 },
    ], [plaque, pose, stock], {}, cle);
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    const lignes = issue.suivant.elements.map((e) => (e.type === "ligne" ? e.ligne : null)!);
    expect(lignes.map((l) => [l.designation, l.quantite, l.type])).toEqual([
      ["Plaque BA13", 12, "fourniture"], ["Pose", 3.5, "main_oeuvre"], ["Cheville", 40, "fourniture"],
    ]);
    expect(lignes[2].tauxTva).toBe(20); // taux par défaut quand le stock n'en porte pas
    expect(issue.clesAjoutees).toEqual(["c1", "c2", "c3"]);
    expect(issue.suivant.origines.c1).toMatchObject({ origine: "catalogue", sourceId: "p1", referenceInterne: "BA13-200", referenceFabricant: "PLACO-4521", prixAchatHt: 10 });
    expect(issue.suivant.origines.c3.prixAchatHt).toBeNull();
  });
  it("respecte le prix, l'unité et la description saisis pour chaque article", () => {
    const issue = appliquerSelectionArticles(vide, [{ articleId: "p1", quantite: 2, prixUnitaireHt: 18, unite: "m²", description: "Pose comprise" }], [plaque], {}, cle);
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    const e = issue.suivant.elements[0];
    expect(e.type === "ligne" && e.ligne).toMatchObject({ prixUnitaireHt: 18, unite: "m²", description: "Pose comprise" });
  });
});

describe("9. article déjà présent", () => {
  const initial = () => {
    const issue = appliquerSelectionArticles(vide, [{ articleId: "p1", quantite: 10 }], [plaque], {}, () => "x1");
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    return issue.suivant;
  };
  it("demande une décision et n'ajoute rien sans elle", () => {
    expect(appliquerSelectionArticles(initial(), [{ articleId: "p1", quantite: 5 }], [plaque], {}, cle))
      .toEqual({ etat: "decision_requise", articlesDejaPresents: ["p1"] });
  });
  it("additionne sur la ligne existante, en gardant sa clé", () => {
    const issue = appliquerSelectionArticles(initial(), [{ articleId: "p1", quantite: 5 }], [plaque], { p1: "additionner" }, cle);
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    expect(issue.suivant.elements).toHaveLength(1);
    expect(issue.suivant.elements[0].type === "ligne" && issue.suivant.elements[0].ligne).toMatchObject({ cle: "x1", quantite: 15 });
  });
  it("remplace la ligne par l'instantané actuel du catalogue, en gardant sa clé", () => {
    const perimee = modifierLigneLibre(initial(), "x1", { prixUnitaireHt: 15 });
    const catalogueAJour = { ...plaque, prixVenteHt: 22, referenceInterne: "BA13-200-V2" };
    const issue = appliquerSelectionArticles(perimee, [{ articleId: "p1", quantite: 4 }], [catalogueAJour], { p1: "remplacer" }, cle);
    if (issue.etat !== "ajoute") throw new Error(issue.etat);
    expect(issue.suivant.elements[0].type === "ligne" && issue.suivant.elements[0].ligne).toMatchObject({ cle: "x1", quantite: 4, prixUnitaireHt: 22 });
    expect(issue.suivant.origines.x1.referenceInterne).toBe("BA13-200-V2");
  });
  it("crée une nouvelle ligne ou annule, sur demande", () => {
    const nouvelle = appliquerSelectionArticles(initial(), [{ articleId: "p1", quantite: 5 }], [plaque], { p1: "nouvelle_ligne" }, cle);
    if (nouvelle.etat !== "ajoute") throw new Error(nouvelle.etat);
    expect(nouvelle.suivant.elements).toHaveLength(2);
    const annule = appliquerSelectionArticles(initial(), [{ articleId: "p1", quantite: 5 }], [plaque], { p1: "annuler" }, cle);
    if (annule.etat !== "ajoute") throw new Error(annule.etat);
    expect(annule.suivant).toEqual(initial());
  });
  it("une ligne saisie à la main n'est jamais considérée comme « déjà présente »", () => {
    const libre = ajouterLigneLibre(vide, "l1", { designation: "Plaque BA13" });
    expect(appliquerSelectionArticles(libre, [{ articleId: "p1", quantite: 1 }], [plaque], {}, cle).etat).toBe("ajoute");
  });
});

describe("10. article archivé", () => {
  it("n'est ajouté qu'avec une confirmation explicite", () => {
    const archive = { ...pose, actif: false };
    expect(appliquerSelectionArticles(vide, [{ articleId: "p2", quantite: 1 }], [archive], {}, cle).etat).toBe("refuse");
    expect(appliquerSelectionArticles(vide, [{ articleId: "p2", quantite: 1, confirmeArchive: true }], [archive], {}, cle).etat).toBe("ajoute");
  });
});

describe("validation serveur d'un brouillon", () => {
  const ok = ajouterLigneLibre(vide, "l1", { designation: "Dépose", prixUnitaireHt: 100 });
  it("accepte un brouillon correct", () => {
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 5, elements: ok.elements })).toBeNull();
  });
  it("refuse client absent, remise hors bornes, devis vide", () => {
    expect(validerBrouillon({ clientId: null, remiseGlobalePct: 0, elements: ok.elements })).toMatch(/client/);
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 150, elements: ok.elements })).toMatch(/remise globale/);
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: [] })).toMatch(/au moins une ligne/);
  });
  it("refuse une ligne sans désignation, une remise ou une TVA hors bornes, une quantité non finie", () => {
    const sans = modifierLigneLibre(ok, "l1", { designation: " " });
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: sans.elements })).toMatch(/désignation/);
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: modifierLigneLibre(ok, "l1", { remiseLignePct: 120 }).elements })).toMatch(/remise/);
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: modifierLigneLibre(ok, "l1", { tauxTva: -1 }).elements })).toMatch(/TVA/);
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: modifierLigneLibre(ok, "l1", { quantite: Number.NaN }).elements })).toMatch(/quantité/);
  });
  it("refuse un ouvrage sans composant ou à quantité principale nulle", () => {
    const issue = instancierOuvrage(plancherChauffantFictif(), { cle: "o", ordre: 1, quantitePrincipale: 10, saisies: { bande: 4 } });
    if (issue.etat !== "pret") throw new Error(issue.motif);
    const vide1 = ajouterOuvrage(vide, { ...issue.instance, lignes: [] });
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: vide1.elements })).toMatch(/aucun composant/);
    const zero = ajouterOuvrage(vide, { ...issue.instance, quantitePrincipale: 0 });
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: zero.elements })).toMatch(/strictement positive/);
  });
});

describe("opérations sur les éléments", () => {
  const etat = () => {
    const issue = instancierOuvrage(plancherChauffantFictif(), { cle: "ouv1", ordre: 0, quantitePrincipale: 120, saisies: { bande: 44 } });
    if (issue.etat !== "pret") throw new Error(issue.motif);
    return ajouterLigneLibre(ajouterOuvrage(ajouterLigneLibre(vide, "l1", { designation: "Dépose" }), issue.instance), "l2", { designation: "Nettoyage" });
  };
  it("garde l'ordre d'insertion et renumérote après retrait", () => {
    expect(etat().elements.map(cleElement)).toEqual(["l1", "ouv1", "l2"]);
    const r = retirerElement(etat(), "ouv1");
    expect(r.elements.map((e) => [cleElement(e), e.ordre])).toEqual([["l1", 1], ["l2", 2]]);
    expect("l1" in retirerElement(etat(), "l1").origines).toBe(false);
  });
  it("monte et descend un élément sans rien perdre, sans effet aux extrémités", () => {
    expect(deplacerElement(etat(), "l2", -1).elements.map(cleElement)).toEqual(["l1", "l2", "ouv1"]);
    expect(deplacerElement(etat(), "l1", -1).elements.map(cleElement)).toEqual(["l1", "ouv1", "l2"]);
    expect(deplacerElement(etat(), "l2", 1).elements.map(cleElement)).toEqual(["l1", "ouv1", "l2"]);
  });
  it("ne modifie jamais l'état reçu", () => {
    const e = etat();
    const avant = JSON.stringify(e);
    retirerElement(e, "l1");
    deplacerElement(e, "l2", -1);
    modifierLigneLibre(e, "l1", { quantite: 9 });
    expect(JSON.stringify(e)).toBe(avant);
  });
});
