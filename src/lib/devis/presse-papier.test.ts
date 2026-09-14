import { describe, expect, it } from "vitest";
import { ajouterOuvrage, cleElement, insererLigne, type EtatElements } from "./editeur-etat";
import { instancierOuvrage, type VersionOuvrage } from "./ouvrages";
import { sousTotauxSections, totauxDevis } from "./presentation";
import { collerElements, copierElements, FORMAT_PRESSE_PAPIER, lirePressePapier, messageRefus, serialiserPressePapier } from "./presse-papier";

const A = "e0000000-0000-4000-8000-000000000001";
const B = "e0000000-0000-4000-8000-000000000002";
let compteur = 0;
const cle = () => `k${++compteur}`;

function modeleOuvrage(): VersionOuvrage {
  return {
    ouvrageId: "ouv-1", entrepriseId: A, version: 1, referenceInterne: "OUV-0001", nom: "Cloison vitrée", descriptionInterne: null, descriptionClient: null,
    categorie: null, unitePrincipale: "m²", quantitePrincipale: 1, statut: "actif", auteur: "u-1", creeLe: "2026-09-13T00:00:00Z", modifieLe: "2026-09-13T00:00:00Z",
    composants: [
      { cle: "vitrage", designation: "Vitrage", unite: "m²", coefficient: 1, base: { type: "principale" }, quantiteFixe: null, saisieRequise: false, pertePct: 0, arrondi: { mode: "aucun" }, quantiteMin: null, condition: { type: "toujours" }, ordre: 1, nature: "article", source: null, referenceInterne: "ART-0006", referenceFabricant: null, fabricant: null, fournisseur: null, descriptionClient: null, prixAchatHt: null, prixVenteHt: 145, tauxTva: 20, visibleClient: true },
      { cle: "pose", designation: "Pose", unite: "h", coefficient: 0.8, base: { type: "principale" }, quantiteFixe: null, saisieRequise: false, pertePct: 0, arrondi: { mode: "aucun" }, quantiteMin: null, condition: { type: "toujours" }, ordre: 2, nature: "main_oeuvre", source: null, referenceInterne: "MO-0002", referenceFabricant: null, fabricant: null, fournisseur: null, descriptionClient: null, prixAchatHt: null, prixVenteHt: 48, tauxTva: 20, visibleClient: false },
    ],
  };
}

/** Devis source : titre, article (avec coût), libre, commentaire, remise 10 % de section, sous-total, ouvrage 12 m². */
function devisSource(): EtatElements {
  let e: EtatElements = { elements: [], origines: {} };
  e = insererLigne(e, "t", "titre", null, { designation: "Aménagement" });
  e = insererLigne(e, "a", "article", "t", { designation: "Plaque BA13", quantite: 24, prixUnitaireHt: 13.5, referenceInterne: "ART-0002" });
  e = { ...e, origines: { ...e.origines, a: { origine: "catalogue", sourceCatalogue: "prestation", sourceId: "art-2", referenceInterne: "ART-0002", referenceFabricant: "BA13-HYDRO", prixAchatHt: 8.4, coefficient: 1.6 } } };
  e = insererLigne(e, "l", "libre", "a", { designation: "Reprise peinture", quantite: 2, prixUnitaireHt: 250 });
  e = insererLigne(e, "c", "commentaire", "l", { designation: "Horaires de bureau" });
  e = insererLigne(e, "r", "remise", "c", { designation: "Remise", remiseSectionPct: 10 });
  e = insererLigne(e, "s", "sous_total", "r", { designation: "Sous-total" });
  const issue = instancierOuvrage(modeleOuvrage(), { cle: "o", ordre: 0, quantitePrincipale: 12 });
  if (issue.etat !== "pret") throw new Error("ouvrage attendu");
  const instance = { ...issue.instance, lignes: issue.instance.lignes.map((l) => ({ ...l, prixAchatHt: l.cle === "vitrage" ? 98 : 31 })) };
  return ajouterOuvrage(e, instance);
}

describe("copierElements", () => {
  it("copie dans l'ordre du devis, sans clé ni identifiant technique, avec les coûts pour qui les voit", () => {
    const etat = devisSource();
    const p = copierElements(etat, ["o", "a", "t"], { entrepriseId: A, voirCouts: true }, new Date("2026-09-13T10:00:00Z"));
    expect(p.format).toBe(FORMAT_PRESSE_PAPIER);
    expect(p.entrepriseId).toBe(A);
    expect(p.elements.map((x) => x.type)).toEqual(["ligne", "ligne", "ouvrage"]);
    const article = p.elements[1];
    if (article.type !== "ligne") throw new Error();
    expect("cle" in article.ligne).toBe(false);
    expect(article.origine?.prixAchatHt).toBe(8.4);
    const ouvrage = p.elements[2];
    if (ouvrage.type !== "ouvrage") throw new Error();
    expect("cle" in ouvrage.instance).toBe(false);
    expect(ouvrage.instance.lignes.map((l) => l.prixAchatHt)).toEqual([98, 31]);
    expect(JSON.stringify(p)).not.toMatch(/devis_id|created_at|"auteur":"[^"]+"/);
  });

  it("retire tout coût pour qui ne voit pas les coûts", () => {
    const p = copierElements(devisSource(), ["a", "o"], { entrepriseId: A, voirCouts: false });
    const article = p.elements[0]; const ouvrage = p.elements[1];
    if (article.type !== "ligne" || ouvrage.type !== "ouvrage") throw new Error();
    expect(article.origine).toEqual({ origine: "catalogue", sourceCatalogue: "prestation", sourceId: "art-2", referenceInterne: "ART-0002", referenceFabricant: "BA13-HYDRO" });
    expect(ouvrage.instance.lignes.every((l) => l.prixAchatHt === null)).toBe(true);
    expect(JSON.stringify(p)).not.toMatch(/"prixAchatHt":[0-9]|coefficient":1\.6|coutMainOeuvreHt/);
  });
});

describe("lirePressePapier", () => {
  const texte = () => serialiserPressePapier(copierElements(devisSource(), ["t", "a", "l", "c", "r", "s", "o"], { entrepriseId: A, voirCouts: true }));

  it("relit un presse-papier valide", () => {
    const lu = lirePressePapier(texte(), { entrepriseId: A, voirCouts: true });
    expect(lu.ok).toBe(true);
    if (lu.ok) expect(lu.payload.elements).toHaveLength(7);
  });
  it("refuse une autre entreprise sans rien lire", () => {
    const lu = lirePressePapier(texte(), { entrepriseId: B, voirCouts: true });
    expect(lu).toEqual({ ok: false, motif: "entreprise" });
    expect(messageRefus("entreprise")).toMatch(/autre entreprise/);
  });
  it("laisse passer le texte ordinaire (collage de texte dans une cellule)", () => {
    expect(lirePressePapier("Plaque de plâtre BA13", { entrepriseId: A, voirCouts: true })).toEqual({ ok: false, motif: "format" });
    expect(lirePressePapier(42, { entrepriseId: A, voirCouts: true })).toEqual({ ok: false, motif: "format" });
  });
  it("refuse un document corrompu ou forgé", () => {
    const base = JSON.parse(texte());
    expect(lirePressePapier(`{"format":"${FORMAT_PRESSE_PAPIER}"`, { entrepriseId: A, voirCouts: true })).toEqual({ ok: false, motif: "invalide" });
    expect(lirePressePapier(JSON.stringify({ ...base, version: 2 }), { entrepriseId: A, voirCouts: true })).toEqual({ ok: false, motif: "invalide" });
    expect(lirePressePapier(JSON.stringify({ ...base, elements: [] }), { entrepriseId: A, voirCouts: true })).toEqual({ ok: false, motif: "vide" });
    const mauvaise = { ...base, elements: [{ type: "ligne", ligne: { ...base.elements[1].ligne, quantite: "24" } }] };
    expect(lirePressePapier(JSON.stringify(mauvaise), { entrepriseId: A, voirCouts: true })).toEqual({ ok: false, motif: "invalide" });
    const typeInconnu = { ...base, elements: [{ type: "ligne", ligne: { ...base.elements[1].ligne, typeLigne: "facture" } }] };
    expect(lirePressePapier(JSON.stringify(typeInconnu), { entrepriseId: A, voirCouts: true })).toEqual({ ok: false, motif: "invalide" });
    const demiOuvrage = { ...base, elements: [{ type: "ouvrage", instance: { ...base.elements[6].instance, lignes: [{ cle: "x" }] } }] };
    expect(lirePressePapier(JSON.stringify(demiOuvrage), { entrepriseId: A, voirCouts: true })).toEqual({ ok: false, motif: "invalide" });
  });
  it("retire les coûts d'un presse-papier forgé quand l'utilisateur ne les voit pas", () => {
    const lu = lirePressePapier(texte(), { entrepriseId: A, voirCouts: false });
    if (!lu.ok) throw new Error();
    expect(JSON.stringify(lu.payload)).not.toMatch(/"prixAchatHt":[0-9]|"coefficient":1\.6/);
  });
  it("ignore les clés inconnues d'une origine et refuse une valeur du mauvais type", () => {
    const base = JSON.parse(texte());
    const inconnue = { ...base, elements: [{ type: "ligne", ligne: base.elements[1].ligne, origine: { ...base.elements[1].origine, devisId: "x", auteur: "y" } }] };
    const lu = lirePressePapier(JSON.stringify(inconnue), { entrepriseId: A, voirCouts: true });
    if (!lu.ok) throw new Error();
    expect(JSON.stringify(lu.payload)).not.toMatch(/devisId|auteur/);
    const mauvaise = { ...base, elements: [{ type: "ligne", ligne: base.elements[1].ligne, origine: { prixAchatHt: "8,4" } }] };
    expect(lirePressePapier(JSON.stringify(mauvaise), { entrepriseId: A, voirCouts: true })).toEqual({ ok: false, motif: "invalide" });
  });
});

describe("collerElements", () => {
  it("colle avec de nouvelles clés, recopie les origines, recalcule remise et sous-total dans la cible", () => {
    const source = devisSource();
    const lu = lirePressePapier(serialiserPressePapier(copierElements(source, ["t", "a", "l", "r", "s", "o"], { entrepriseId: A, voirCouts: true })), { entrepriseId: A, voirCouts: true });
    if (!lu.ok) throw new Error();
    let cible: EtatElements = insererLigne({ elements: [], origines: {} }, "x", "libre", null, { designation: "Existante", quantite: 1, prixUnitaireHt: 100 });
    const colle = collerElements(cible, lu.payload.elements, { type: "fin" }, cle);
    cible = colle.etat;
    expect(colle.clesAjoutees).toHaveLength(6);
    expect(new Set(colle.clesAjoutees).size).toBe(6);
    expect(colle.clesAjoutees.some((k) => ["t", "a", "l", "r", "s", "o"].includes(k))).toBe(false);
    expect(cible.elements.map(cleElement)).toEqual(["x", ...colle.clesAjoutees]);
    expect(cible.origines[colle.clesAjoutees[1]]?.prixAchatHt).toBe(8.4);
    // Dans la source, la remise valait 10 % de (24 × 13,5 + 2 × 250) = 82,40. Dans la cible, la section
    // court depuis le début du devis et inclut la ligne existante (100) : la remise est RECALCULÉE à
    // 10 % de 924 = 92,40, et le sous-total est calculé, jamais recopié.
    const remiseSource = source.elements.find((e) => cleElement(e) === "r");
    if (!remiseSource || remiseSource.type !== "ligne") throw new Error();
    expect(remiseSource.ligne.prixUnitaireHt).toBe(-82.4);
    const remise = cible.elements.find((e) => cleElement(e) === colle.clesAjoutees[3]);
    if (!remise || remise.type !== "ligne") throw new Error();
    expect(remise.ligne.prixUnitaireHt).toBe(-92.4);
    const sousTotaux = sousTotauxSections(cible.elements);
    expect(sousTotaux.get(colle.clesAjoutees[4])).toBeCloseTo(100 + 324 + 500 - 92.4, 2);
    // Modifier la cible ne touche pas la source (aucune référence partagée).
    const ouvrageColle = cible.elements.find((e) => cleElement(e) === colle.clesAjoutees[5]);
    if (!ouvrageColle || ouvrageColle.type !== "ouvrage") throw new Error();
    ouvrageColle.instance.lignes[0].quantite = 999;
    const ouvrageSource = source.elements.find((e) => cleElement(e) === "o");
    if (!ouvrageSource || ouvrageSource.type !== "ouvrage") throw new Error();
    expect(ouvrageSource.instance.lignes[0].quantite).toBe(12);
  });

  it("positions : après, avant, fin ; le même presse-papier se colle plusieurs fois", () => {
    const source = devisSource();
    const lu = lirePressePapier(serialiserPressePapier(copierElements(source, ["l"], { entrepriseId: A, voirCouts: true })), { entrepriseId: A, voirCouts: true });
    if (!lu.ok) throw new Error();
    let cible: EtatElements = insererLigne({ elements: [], origines: {} }, "p", "libre", null, { designation: "P" });
    cible = insererLigne(cible, "q", "libre", "p", { designation: "Q" });
    const c1 = collerElements(cible, lu.payload.elements, { type: "apres", cle: "p" }, cle);
    expect(c1.etat.elements.map(cleElement)).toEqual(["p", c1.clesAjoutees[0], "q"]);
    const c2 = collerElements(c1.etat, lu.payload.elements, { type: "avant", cle: "p" }, cle);
    expect(c2.etat.elements.map(cleElement)[0]).toBe(c2.clesAjoutees[0]);
    const c3 = collerElements(c2.etat, lu.payload.elements, { type: "fin" }, cle);
    expect(c3.etat.elements.map(cleElement).at(-1)).toBe(c3.clesAjoutees[0]);
    expect(c3.etat.elements.map((e) => e.ordre)).toEqual([1, 2, 3, 4, 5]);
    expect(totauxDevis(c3.etat.elements, 0).totalHt).toBe(1500);
  });

  it("colle un ouvrage atomiquement : parent + composants + modèle", () => {
    const lu = lirePressePapier(serialiserPressePapier(copierElements(devisSource(), ["o"], { entrepriseId: A, voirCouts: true })), { entrepriseId: A, voirCouts: true });
    if (!lu.ok) throw new Error();
    const colle = collerElements({ elements: [], origines: {} }, lu.payload.elements, { type: "fin" }, cle);
    const o = colle.etat.elements[0];
    if (o.type !== "ouvrage") throw new Error();
    expect(o.instance.lignes).toHaveLength(2);
    expect(o.instance.modele.composants).toHaveLength(2);
    expect(o.instance.quantitePrincipale).toBe(12);
    expect(o.instance.cle).toBe(colle.clesAjoutees[0]);
  });
});
