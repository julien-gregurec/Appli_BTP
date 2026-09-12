import { describe, expect, it } from "vitest";
import {
  ajouterLigneLibre, deplacerElementVers, dupliquerElement, insererLigne, modifierLigneLibre, remisesTvaMixte, validerBrouillon, type EtatElements,
} from "@/lib/devis/editeur-etat";
import { construireVueDocument } from "@/lib/devis/document-modele";
import { paginer } from "@/lib/devis/pagination";
import { baseRemiseSection, lignesClient, sousTotauxSections, totauxDevis } from "@/lib/devis/presentation";
import { sourceFictive } from "@/lib/devis/fixtures/document-fictif";
import { DocumentA4 } from "@/components/documents/DocumentA4";
import { renderToStaticMarkup } from "react-dom/server";

// GP V1, lot C : lignes de structure (titre, sous-total, remise, commentaire, mise en page) dans l'état,
// les totaux, la présentation client, la pagination et le rendu A4.

const prixDe = (e: EtatElements, c: string) => { const x = e.elements.find((y) => y.type === "ligne" && y.ligne.cle === c); return x && x.type === "ligne" ? x.ligne.prixUnitaireHt : null; };
const vide: EtatElements = { elements: [], origines: {} };

function devisStructure(): EtatElements {
  let e = insererLigne(vide, "t", "titre", null, { designation: "Lot 1" });
  e = ajouterLigneLibre(e, "a", { designation: "Plaque", quantite: 40, prixUnitaireHt: 20, tauxTva: 20 });
  e = ajouterLigneLibre(e, "b", { designation: "Pose", quantite: 4, prixUnitaireHt: 50, tauxTva: 20 });
  e = insererLigne(e, "r", "remise", null, { remiseSectionPct: 5 });
  e = insererLigne(e, "s", "sous_total", null);
  e = insererLigne(e, "c", "commentaire", null, { designation: "Hors week-end." });
  e = insererLigne(e, "p", "saut_page", null);
  e = ajouterLigneLibre(e, "d", { designation: "Lot 2 ligne", quantite: 1, prixUnitaireHt: 100, tauxTva: 10 });
  e = insererLigne(e, "s2", "sous_total", null);
  return e;
}

describe("totaux et sous-totaux", () => {
  it("les lignes de structure comptent 0, la remise en % de section est un montant négatif recalculé", () => {
    const e = devisStructure();
    expect(prixDe(e, "r")).toBe(-50);
    expect(totauxDevis(e.elements).totalHt).toBe(1050);
    expect(sousTotauxSections(e.elements).get("s")).toBe(950);
    expect(sousTotauxSections(e.elements).get("s2")).toBe(100);
  });
  it("modifier une ligne de la section recalcule la remise ; une remise fixe n'est pas touchée", () => {
    let e = modifierLigneLibre(devisStructure(), "a", { quantite: 20 });
    expect(prixDe(e, "r")).toBe(-30);
    e = modifierLigneLibre(e, "r", { remiseSectionPct: null, prixUnitaireHt: -12 });
    e = modifierLigneLibre(e, "a", { quantite: 40 });
    expect(prixDe(e, "r")).toBe(-12);
  });
  it("la base d'une remise ignore les autres remises et repart après un sous-total", () => {
    const e = devisStructure();
    expect(baseRemiseSection(e.elements, "r")).toEqual({ montantHt: 1000, tauxTva: [20] });
    const e2 = insererLigne(e, "r2", "remise", "d", { remiseSectionPct: 10 });
    expect(baseRemiseSection(e2.elements, "r2").montantHt).toBe(100);
  });
  it("signale une remise en % sur une section à plusieurs taux de TVA, sans répartir en silence", () => {
    const e = insererLigne(modifierLigneLibre(devisStructure(), "b", { tauxTva: 10 }), "r3", "remise", "b", { remiseSectionPct: 5 });
    expect(remisesTvaMixte(e)).toEqual(["r3", "r"]);
  });
});

describe("validation", () => {
  it("accepte un devis structuré, refuse un titre chiffré ou une remise positive", () => {
    const e = devisStructure();
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: e.elements })).toBeNull();
    const titreChiffre = e.elements.map((x) => (x.type === "ligne" && x.ligne.cle === "t" ? { ...x, ligne: { ...x.ligne, quantite: 2 } } : x));
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: titreChiffre })).toMatch(/ne porte ni quantité/);
    const remisePositive = e.elements.map((x) => (x.type === "ligne" && x.ligne.cle === "r" ? { ...x, ligne: { ...x.ligne, prixUnitaireHt: 5 } } : x));
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: remisePositive })).toMatch(/montant négatif/);
  });
  it("une ligne vide n'exige pas de désignation", () => {
    const e = insererLigne(ajouterLigneLibre(vide, "a", { designation: "X" }), "v", "vide", null);
    expect(validerBrouillon({ clientId: "c", remiseGlobalePct: 0, elements: e.elements })).toBeNull();
  });
});

describe("duplication et déplacement libre", () => {
  it("duplique juste après, avec l'origine, puis déplace à un index", () => {
    let e = ajouterLigneLibre(ajouterLigneLibre(vide, "a", { designation: "A" }), "b", { designation: "B" });
    e = { ...e, origines: { ...e.origines, a: { origine: "catalogue", sourceId: "p1", prixAchatHt: 3 } } };
    e = dupliquerElement(e, "a", "a2");
    expect(e.elements.map((x) => x.type === "ligne" && x.ligne.cle)).toEqual(["a", "a2", "b"]);
    expect(e.origines.a2).toMatchObject({ sourceId: "p1", prixAchatHt: 3 });
    e = deplacerElementVers(e, "b", 0);
    expect(e.elements.map((x) => x.type === "ligne" && x.ligne.cle)).toEqual(["b", "a", "a2"]);
    expect(e.elements.map((x) => x.ordre)).toEqual([1, 2, 3]);
    expect(deplacerElementVers(e, "b", 0).elements.map((x) => x.ordre)).toEqual([1, 2, 3]);
  });
});

describe("présentation, pagination et rendu", () => {
  it("chaque ligne de structure a son genre ; le sous-total porte le montant calculé", () => {
    const l = lignesClient(devisStructure().elements);
    expect(l.map((x) => x.genre)).toEqual(["titre", "ligne", "ligne", "remise", "sous_total", "commentaire", "saut_page", "ligne", "sous_total"]);
    expect(l.find((x) => x.genre === "sous_total")).toMatchObject({ totalHt: 950, quantite: null, prixUnitaireHt: null });
    expect(l.find((x) => x.genre === "remise")).toMatchObject({ totalHt: -50, description: "5 % de la section" });
  });
  it("un saut de page coupe la page et n'est jamais rendu ; les autres lignes le sont toutes, une fois", () => {
    const vue = construireVueDocument({ ...sourceFictive(), elements: devisStructure().elements });
    const pages = paginer(vue);
    expect(pages).toHaveLength(2);
    const rendues = pages.flatMap((p) => p.blocs.flatMap((b) => (b.type === "tableau" ? b.lignes.map((x) => x.cle) : [])));
    expect(rendues).toEqual(["t", "a", "b", "r", "s", "c", "d", "s2"]);
    const html = renderToStaticMarkup(DocumentA4({ vue, pages }));
    expect(html).toContain('data-genre="titre"');
    expect(html).toContain('data-genre="sous_total"');
    expect(html).not.toContain('data-genre="saut_page"');
    expect(html).toContain("950,00");
    expect((html.match(/data-page="/g) ?? []).length).toBe(2);
  });
  it("un saut de page en tête ou doublé est sans effet", () => {
    const e = insererLigne(insererLigne(insererLigne(vide, "p0", "saut_page", null), "p1", "saut_page", null), "a", "libre", null, { designation: "A", quantite: 1, prixUnitaireHt: 1 });
    const vue = construireVueDocument({ ...sourceFictive(), elements: e.elements });
    expect(paginer(vue)).toHaveLength(1);
  });
});
