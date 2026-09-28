import { describe, expect, it } from "vitest";
import { OUVERTURE_MODELES } from "./model";
import {
  diffPlan, EMPTY_PLAN_DOCUMENT, isPlanOperationsEmpty, OPENING_ISSUE_CODES, ouvertureDonnees, ouvertureFromElement, ouvertureModele, overlappingOpenings,
  validatePlanDocument, validatePlanOuverture, type PlanDocument, type PlanMur, type PlanOuverture,
} from "./plan";
import { photoWallTargets } from "./photo";

const mur = (id: string, length = 4000, hauteurMm: number | null = 2500): PlanMur => ({
  id, pieceId: null, a: { x: 0, y: 0 }, b: { x: length, y: 0 }, epaisseurMm: 200, hauteurMm, typeMur: "porteur",
});
const porte = (id: string, decalageMm: number, extra: Partial<PlanOuverture> = {}): PlanOuverture => ({
  id, murId: "m", decalageMm, largeurMm: 900, hauteurMm: 2040, allegeMm: null, typeOuverture: "porte", sens: "gauche", ...extra,
});

describe("Lot 6 — validations d'ouverture (miroir serveur)", () => {
  it("codes : largeur nulle, plus large que le mur, hors mur, hauteur incohérente, menuiserie inconnue", () => {
    const codes = (o: PlanOuverture, m: PlanMur = mur("m")) => validatePlanOuverture(o, m).map((issue) => issue.code);
    expect(codes(porte("o", 100))).toEqual([]);
    expect(codes(porte("o", 100, { largeurMm: 0 }))).toContain("largeur_nulle");
    expect(codes(porte("o", 0, { largeurMm: 5000 }))).toEqual(["plus_large_que_mur"]);
    expect(codes(porte("o", 3500))).toEqual(["hors_mur"]);
    expect(codes(porte("o", 100, { allegeMm: 900, hauteurMm: 1800 }))).toEqual(["hauteur_incoherente"]);
    expect(codes(porte("o", 100, { allegeMm: 900, hauteurMm: 1800 }), mur("m", 4000, null))).toEqual([]);
    expect(codes(porte("o", 100, { vantaux: 3 as never, poussee: "lateral" as never, modele: "guillotine" as never }))).toEqual(["invalide", "invalide", "invalide"]);
    expect(OPENING_ISSUE_CODES).toContain("jonction");
  });
  it("chevauchement détecté au niveau du document (tolérance d'arrondi 1 mm)", () => {
    const doc: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, murs: [mur("m")], ouvertures: [porte("a", 100), porte("b", 999.5), porte("c", 2500)] };
    expect(overlappingOpenings(doc.ouvertures)).toEqual([]);
    const overlapping = { ...doc, ouvertures: [...doc.ouvertures, porte("d", 2900)] };
    expect(overlappingOpenings(overlapping.ouvertures)).toEqual([["c", "d"]]);
    expect(validatePlanDocument(overlapping).map((issue) => issue.code)).toEqual(["chevauchement"]);
  });
});

describe("Lot 6 — attributs de menuiserie", () => {
  it("relus et réécrits à l'identique ; absents d'une ouverture du Lot 5 (pas de réécriture)", () => {
    const legacy = { id: "o", parentElementId: "m", donnees: { decalageMm: 100, largeurMm: 900, hauteurMm: 2040, allegeMm: null, typeOuverture: "porte", sens: "gauche" } } as never;
    const read = ouvertureFromElement(legacy);
    expect(Object.keys(ouvertureDonnees(read)).sort()).toEqual(["allegeMm", "decalageMm", "hauteurMm", "largeurMm", "sens", "typeOuverture"]);
    const rich = ouvertureFromElement({ id: "o", parentElementId: "m", donnees: { ...(legacy as { donnees: object }).donnees, vantaux: 2, poussee: "poussant", modele: "battant" } } as never);
    expect(rich).toMatchObject({ vantaux: 2, poussee: "poussant", modele: "battant" });
    expect(ouvertureDonnees(rich)).toMatchObject({ vantaux: 2, poussee: "poussant", modele: "battant" });
    const doc: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, murs: [mur("m")], ouvertures: [read] };
    expect(isPlanOperationsEmpty(diffPlan(doc, { ...doc, ouvertures: [ouvertureFromElement(legacy)] }))).toBe(true);
    expect(diffPlan(doc, { ...doc, ouvertures: [{ ...read, poussee: "poussant" }] }).ouvertures).toHaveLength(1);
  });
  it("modèle effectif par défaut selon le type", () => {
    expect(ouvertureModele(porte("o", 0))).toBe("battant");
    expect(ouvertureModele(porte("o", 0, { sens: "coulissant" }))).toBe("coulissant");
    expect(ouvertureModele(porte("o", 0, { typeOuverture: "baie", sens: "aucun" }))).toBe("coulissant");
    expect(ouvertureModele(porte("o", 0, { typeOuverture: "passage", sens: "aucun" }))).toBeNull();
    expect(OUVERTURE_MODELES).toContain("fixe");
  });
});

describe("Lot 6 — sélecteur de cible photo : un mur par lignée", () => {
  const wall = (id: string, origineId?: string, deletedAt: string | null = null) => ({ id, type: "mur" as const, deletedAt, donnees: { origineId } });
  it("un mur recopié dans un plan dérivé n'apparaît qu'une fois (copie la plus récente)", () => {
    const elements = [wall("a"), wall("b"), wall("a2", "a"), wall("b2", "b"), wall("a3", "a2"), wall("c"), { id: "e", type: "equipement" as const, deletedAt: null, donnees: {} }];
    expect(photoWallTargets(elements as never).map((row) => row.id)).toEqual(["b2", "a3", "c"]);
  });
  it("copie supprimée dans le dérivé : l'original reste proposé ; la cible actuelle est conservée", () => {
    const elements = [wall("a"), wall("a2", "a", "2026-09-28T00:00:00Z"), wall("b"), wall("b2", "b")];
    expect(photoWallTargets(elements as never).map((row) => row.id)).toEqual(["a", "b2"]);
    expect(photoWallTargets(elements as never, "b").map((row) => row.id)).toEqual(["a", "b", "b2"]);
  });
});

describe("Lot 6 — pré-contrôle de l'enregistrement (miroir serveur)", () => {
  it("une anomalie sur un mur non touché ne bloque pas le lot ; sur un mur touché, si", async () => {
    const { validatePlanSave } = await import("./plan");
    const other: PlanMur = { ...mur("n"), a: { x: 0, y: 3000 }, b: { x: 4000, y: 3000 } };
    const legacy: PlanDocument = { ...EMPTY_PLAN_DOCUMENT, murs: [mur("m"), other], ouvertures: [porte("a", 100), porte("b", 500)] };
    const movedOther = { ...legacy, murs: [legacy.murs[0], { ...other, b: { x: 4200, y: 3000 } }] };
    expect(validatePlanSave(movedOther, diffPlan(legacy, movedOther))).toEqual([]);
    const movedHost = { ...legacy, murs: [{ ...legacy.murs[0], b: { x: 4200, y: 0 } }, other] };
    expect(validatePlanSave(movedHost, diffPlan(legacy, movedHost)).map((issue) => issue.code)).toEqual(["chevauchement"]);
  });
});
