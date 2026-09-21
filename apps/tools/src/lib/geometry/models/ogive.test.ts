import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createOgiveGeometry } from "./ogive";

// C4-LOT2-ARCHES-V1 : mêmes invariants qu'en FUNDAMENTAL-MODELS-V1 §16, contrôlés sur la sortie
// désormais produite via Engine B (`createArch({type:"lancet", pointedness:"equilateral"})`) puis
// le pont `parametricShapeToTraceModel`. Points nommés inchangés (A, B, S) ; les arcs n'ont plus
// d'id fixe ("arc-from-a"/"arc-from-b") — identifiés ici par proximité de leur centre à A/B.
describe("createOgiveGeometry — C4-LOT2 (Engine B)", () => {
  it("centres corrects : un arc est centré en A, l'autre en B (variante équilatérale)", () => {
    const model = createOgiveGeometry({ width: 1200 });
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const arcAtA = model.arcs.find((a) => distance(a.centre, A) < 1e-6);
    const arcAtB = model.arcs.find((a) => distance(a.centre, B) < 1e-6);
    expect(arcAtA).toBeDefined();
    expect(arcAtB).toBeDefined();
  });

  it("sommet commun aux deux arcs (dans la tolérance flottante)", () => {
    const model = createOgiveGeometry({ width: 1200 });
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const S = model.points.find((p) => p.id === "S")!;
    expect(distance(A, S)).toBeCloseTo(1200, 6);
    expect(distance(B, S)).toBeCloseTo(1200, 6);
  });

  it("rayons cohérents : rayon = largeur, identique pour les deux arcs", () => {
    const model = createOgiveGeometry({ width: 1200 });
    expect(model.arcs).toHaveLength(2);
    expect(model.arcs.every((a) => Math.abs(a.radius - 1200) < 1e-6)).toBe(true);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(1200, 8);
  });

  it("symétrie : le sommet est sur l'axe médian de A-B", () => {
    const model = createOgiveGeometry({ width: 1200 });
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const S = model.points.find((p) => p.id === "S")!;
    expect(S.x).toBeCloseTo((A.x + B.x) / 2, 6);
  });

  it("intersection valide : la hauteur suit la formule de l'équilatéral W√3/2", () => {
    const model = createOgiveGeometry({ width: 1200 });
    const height = model.dimensions.find((d) => d.id === "dim-height")!.value;
    expect(height).toBeCloseTo(1200 * (Math.sqrt(3) / 2), 6);
  });

  it("recalcul avec une autre largeur", () => {
    const model = createOgiveGeometry({ width: 2000 });
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(2000, 8);
    expect(model.dimensions.find((d) => d.id === "dim-height")?.value).toBeCloseTo(2000 * (Math.sqrt(3) / 2), 6);
  });

  it("nommé clairement comme une variante précise, pas une famille générale", () => {
    const model = createOgiveGeometry();
    expect(model.name).toBe("Ogive équilatérale à deux centres");
    expect(model.slug).toBe("ogive-equilateral");
  });

  it("rôles : les deux arcs en tracé final, les deux cercles complets en construction, l'axe visible", () => {
    const model = createOgiveGeometry({ width: 1200 });
    expect(model.arcs).toHaveLength(2);
    expect(model.arcs.every((a) => a.role !== "construction")).toBe(true);
    expect(model.circles).toHaveLength(2);
    expect(model.circles.every((c) => c.role === "construction")).toBe(true);
    expect(model.constructionLines.some((l) => l.role === "axis")).toBe(true);
  });

  it("pas-à-pas : 6 étapes titrées (naissance, centres, rayon, arc gauche, arc droit, sommet)", () => {
    const model = createOgiveGeometry({ width: 1200 });
    expect(model.steps).toHaveLength(6);
    for (const step of model.steps) {
      expect(step.title.length).toBeGreaterThan(0);
    }
    expect(model.steps.at(-1)!.title.toLowerCase()).toContain("sommet");
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createOgiveGeometry({ width: 1200 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("refuse une largeur invalide", () => {
    expect(() => createOgiveGeometry({ width: 0 })).toThrow();
    expect(() => createOgiveGeometry({ width: -100 })).toThrow();
    expect(() => createOgiveGeometry({ width: Number.NaN })).toThrow();
  });
});
