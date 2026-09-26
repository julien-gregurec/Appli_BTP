import { describe, expect, it } from "vitest";
import {
  unwrapValidation, validateElementDraft, validateEtageDraft, validatePieceDraft, validateReleveDraft, ReleveValidationError,
} from "./validation";

const ETAGE = "e3000000-0000-0000-0000-000000000001";
const MUR = "e6000000-0000-0000-0000-000000000001";

describe("saisies de structure", () => {
  it("normalise un relevé : textes rognés, vides → null, valeurs par défaut", () => {
    const result = validateReleveDraft({ nom: "  Relevé T3  ", chantierNom: "Rue des Lilas", chantierVille: "   ", notes: "" });
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ nom: "Relevé T3", chantierVille: null, notes: null, statut: "brouillon", visibilite: "prive" }) });
  });

  it("refuse nom et chantier manquants avec des anomalies localisées", () => {
    const result = validateReleveDraft({ nom: " " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.path)).toEqual(["nom", "chantierNom"]);
  });

  it("applique les bornes SQL (longueurs, code postal, date, UUID GP)", () => {
    const result = validateReleveDraft({ nom: "x".repeat(161), chantierNom: "C", chantierCodePostal: "67$", dateReleve: "26/09/2026", chantierGpId: "pas-un-uuid" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => `${issue.path}:${issue.code}`).sort()).toEqual(["chantierCodePostal:invalid_format", "chantierGpId:invalid_format", "dateReleve:invalid_format", "nom:out_of_range"]);
  });

  it("borne niveau d'étage et hauteur sous plafond", () => {
    expect(validateEtageDraft({ nom: "Sous-sol", niveau: -1, hauteurSousPlafondMm: 2200 }).ok).toBe(true);
    expect(validateEtageDraft({ nom: "Tour", niveau: 201 }).ok).toBe(false);
    expect(validateEtageDraft({ nom: "RDC", niveau: 0, hauteurSousPlafondMm: 100 }).ok).toBe(false);
    expect(validateEtageDraft({ nom: "RDC", niveau: 0.5 }).ok).toBe(false);
  });

  it("refuse un usage de pièce inconnu", () => {
    expect(validatePieceDraft({ nom: "Séjour", usage: "salon" }).ok).toBe(false);
    expect(unwrapValidation(validatePieceDraft({ nom: "Séjour" })).usage).toBe("autre");
  });

  it("unwrapValidation lève une erreur structurée", () => {
    expect(() => unwrapValidation(validateReleveDraft({}))).toThrow(ReleveValidationError);
  });
});

describe("éléments métier", () => {
  const mur = { a: { x: 0, y: 0 }, b: { x: 4200, y: 0 }, epaisseurMm: 200, hauteurMm: 2500, typeMur: "porteur" };
  const ouverture = { decalageMm: 600, largeurMm: 900, hauteurMm: 2150, allegeMm: null, typeOuverture: "porte", sens: "gauche" };

  it("accepte un mur rattaché à un étage", () => {
    expect(validateElementDraft({ type: "mur", etageId: ETAGE, donnees: mur }).ok).toBe(true);
  });

  it("miroir des CHECK SQL : mur sans étage, ouverture sans mur hôte, pièce sans étage", () => {
    expect(validateElementDraft({ type: "mur", donnees: mur }).ok).toBe(false);
    expect(validateElementDraft({ type: "ouverture", etageId: ETAGE, donnees: ouverture }).ok).toBe(false);
    expect(validateElementDraft({ type: "ouverture", etageId: ETAGE, parentElementId: MUR, donnees: ouverture }).ok).toBe(true);
    expect(validateElementDraft({ type: "mesure", pieceId: MUR, donnees: {} }).ok).toBe(false);
    expect(validateElementDraft({ type: "mur", etageId: ETAGE, parentElementId: MUR, donnees: mur }).ok).toBe(false);
  });

  it("refuse un mur de longueur nulle ou d'épaisseur nulle", () => {
    expect(validateElementDraft({ type: "mur", etageId: ETAGE, donnees: { ...mur, b: { x: 0, y: 0 } } }).ok).toBe(false);
    expect(validateElementDraft({ type: "mur", etageId: ETAGE, donnees: { ...mur, epaisseurMm: 0 } }).ok).toBe(false);
  });

  it("impose l'unité cohérente au type de mesure", () => {
    const base = { cible: { kind: "piece", id: ETAGE }, valeur: 4200, source: "laser", precisionMm: 2, priseLe: "2026-09-26T10:00:00Z" };
    expect(validateElementDraft({ type: "mesure", donnees: { ...base, typeMesure: "longueur", unite: "mm" } }).ok).toBe(true);
    expect(validateElementDraft({ type: "mesure", donnees: { ...base, typeMesure: "angle", unite: "mm" } }).ok).toBe(false);
  });

  it("valide ancre, matériau et quantité dérivée", () => {
    expect(validateElementDraft({ type: "annotation", donnees: { ancre: { kind: "point", etageId: ETAGE, point: { x: 10, y: 20 } }, texte: "Fissure", mediaAudioId: null } }).ok).toBe(true);
    expect(validateElementDraft({ type: "annotation", donnees: { ancre: { kind: "ailleurs" }, texte: "x" } }).ok).toBe(false);
    expect(validateElementDraft({ type: "materiau", donnees: { libelle: "Carrelage", categorie: "sol", unite: "m2", pertePourcent: 10, gpPrestationRef: null } }).ok).toBe(true);
    expect(validateElementDraft({ type: "quantite", donnees: { cle: "sol", libelle: "Sol", valeur: 18.4, unite: "m2", formule: "L*l", qualite: "exacte", materiauId: null } }).ok).toBe(true);
    expect(validateElementDraft({ type: "quantite", donnees: { cle: "sol", libelle: "Sol", valeur: -1, unite: "m2", formule: "L*l", qualite: "exacte" } }).ok).toBe(false);
  });

  it("refuse des coordonnées hors de l'emprise Engine B (±1 km)", () => {
    expect(validateElementDraft({ type: "mur", etageId: ETAGE, donnees: { ...mur, b: { x: 2_000_000, y: 0 } } }).ok).toBe(false);
  });
});
