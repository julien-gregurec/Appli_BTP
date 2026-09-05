import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createArchFullRoundGeometry } from "./arch-full-round";

// C4-LOT2-ARCHES-V1 : mêmes invariants qu'en FUNDAMENTAL-MODELS-V1 §15, contrôlés sur la sortie
// désormais produite via Engine B (`createArch({type:"semicircular"})`) puis le pont
// `parametricShapeToTraceModel`. Points nommés inchangés (O, A, B, S, L, R).
describe("createArchFullRoundGeometry — C4-LOT2 (Engine B)", () => {
  it("width = 1200 -> radius = 600", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(600, 8);
  });

  it("sommet à rayon correct : distance O -> S = rayon", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    const O = model.points.find((p) => p.id === "O")!;
    const S = model.points.find((p) => p.id === "S")!;
    const radius = model.dimensions.find((d) => d.id === "dim-radius")!.value;
    expect(distance(O, S)).toBeCloseTo(radius, 6);
  });

  it("symétrie : A et B équidistants du centre, sommet sur l'axe médian", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    const O = model.points.find((p) => p.id === "O")!;
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const S = model.points.find((p) => p.id === "S")!;
    expect(distance(O, A)).toBeCloseTo(distance(O, B), 8);
    expect(S.x).toBeCloseTo((A.x + B.x) / 2, 8);
  });

  it("naissance gauche/droite correctement espacée de la largeur", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    expect(distance(A, B)).toBeCloseTo(1200, 8);
  });

  it("hauteur calculée : pour un plein cintre, la flèche vaut la demi-largeur", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    expect(model.dimensions.find((d) => d.id === "dim-rise")?.value).toBeCloseTo(600, 8);
  });

  it("paramètres dynamiques : une autre largeur recalcule tout", () => {
    const model = createArchFullRoundGeometry({ width: 2000 });
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(1000, 8);
  });

  it("rôles : un seul arc en tracé final, ligne de naissance en construction, axe vertical visible", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    expect(model.arcs).toHaveLength(1);
    expect(model.arcs[0].role).not.toBe("construction");
    expect(model.constructionLines.some((l) => l.role === "construction")).toBe(true);
    expect(model.constructionLines.some((l) => l.role === "axis")).toBe(true);
  });

  it("pas-à-pas : au moins 5 étapes titrées, dont un contrôle final", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    expect(model.steps.length).toBeGreaterThanOrEqual(5);
    for (const step of model.steps) expect(step.title.length).toBeGreaterThan(0);
    expect(model.steps.at(-1)!.title.toLowerCase()).toContain("contrôl");
  });

  it("reste interne : slug/statut cohérents avec un usage non publié", () => {
    const model = createArchFullRoundGeometry();
    expect(model.slug).toBe("arch-full-round");
    expect(model.status).toBe("preview");
  });

  it("explication réellement renseignée", () => {
    const model = createArchFullRoundGeometry();
    expect(model.explanation?.objective).toBeTruthy();
    expect(model.explanation?.steps?.length).toBeGreaterThan(0);
  });

  it("refuse une largeur invalide", () => {
    expect(() => createArchFullRoundGeometry({ width: 0 })).toThrow();
    expect(() => createArchFullRoundGeometry({ width: -10 })).toThrow();
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });
});
