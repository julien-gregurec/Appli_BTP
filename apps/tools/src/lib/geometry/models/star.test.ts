import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createStarGeometry } from "./star";

describe("createStarGeometry — FIRST-FUNCTIONAL-LOT-V1 §17", () => {
  it("produit 5 sommets extérieurs, 5 sommets intérieurs, 10 points au total", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4, rotation: -90 });
    const [, ...rest] = model.points;
    expect(rest).toHaveLength(10);
    const outer = rest.filter((p) => p.id.startsWith("outer"));
    const inner = rest.filter((p) => p.id.startsWith("inner"));
    expect(outer).toHaveLength(5);
    expect(inner).toHaveLength(5);
  });

  it("chaque sommet extérieur est à outerRadius du centre", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    const [centre] = model.points;
    const outer = model.points.filter((p) => p.id.startsWith("outer"));
    for (const item of outer) expect(distance(centre, item)).toBeCloseTo(1000, 8);
  });

  it("chaque sommet intérieur est à innerRadius du centre", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    const [centre] = model.points;
    const inner = model.points.filter((p) => p.id.startsWith("inner"));
    for (const item of inner) expect(distance(centre, item)).toBeCloseTo(400, 8);
  });

  it("symétrie : 72° entre sommets extérieurs consécutifs, 36° entre un sommet extérieur et son intérieur voisin", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4, rotation: 0 });
    const [centre] = model.points;
    const outer = model.points.filter((p) => p.id.startsWith("outer"));
    const inner = model.points.filter((p) => p.id.startsWith("inner"));
    const angleOf = (p: { x: number; y: number }) => (Math.atan2(p.y - centre.y, p.x - centre.x) * 180) / Math.PI;

    for (let index = 0; index < outer.length; index++) {
      const next = outer[(index + 1) % outer.length];
      let delta = angleOf(next) - angleOf(outer[index]);
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(72, 6);
    }
    let deltaInner = angleOf(inner[0]) - angleOf(outer[0]);
    if (deltaInner < 0) deltaInner += 360;
    expect(deltaInner).toBeCloseTo(36, 6);
  });

  it("le polygone étoilé est logiquement fermé : 10 sommets alternés référençant la géométrie existante", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    const polygon = model.polygons?.find((item) => item.id === "star-polygon");
    expect(polygon).toBeDefined();
    expect(polygon!.points).toHaveLength(10);
    const kinds = polygon!.points.map((p) => (p.id.startsWith("outer") ? "outer" : "inner"));
    for (let index = 0; index < kinds.length; index++) expect(kinds[index]).toBe(index % 2 === 0 ? "outer" : "inner");
    // Les points du polygone sont bien les mêmes objets que ceux du modèle (pas de géométrie dupliquée).
    const modelIds = new Set(model.points.map((p) => p.id));
    for (const item of polygon!.points) expect(modelIds.has(item.id)).toBe(true);
  });

  it("paramètre dynamique : le diamètre extérieur recalcule tous les rayons", () => {
    const small = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    const big = createStarGeometry({ outerDiameter: 4000, innerRatio: 0.4 });
    expect(big.quantities.find((q) => q.id === "q-outer-radius")?.value).toBeCloseTo((small.quantities.find((q) => q.id === "q-outer-radius")?.value ?? 0) * 2, 8);
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("refuse un diamètre extérieur invalide", () => {
    expect(() => createStarGeometry({ outerDiameter: 0, innerRatio: 0.4 })).toThrow();
    expect(() => createStarGeometry({ outerDiameter: -10, innerRatio: 0.4 })).toThrow();
  });

  it("refuse un ratio intérieur hors plage", () => {
    expect(() => createStarGeometry({ outerDiameter: 2000, innerRatio: 0 })).toThrow();
    expect(() => createStarGeometry({ outerDiameter: 2000, innerRatio: 1 })).toThrow();
    expect(() => createStarGeometry({ outerDiameter: 2000, innerRatio: 1.2 })).toThrow();
    expect(() => createStarGeometry({ outerDiameter: 2000, innerRatio: Number.NaN })).toThrow();
  });

  it("explication réellement renseignée", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    expect(model.explanation?.objective).toBeTruthy();
    expect(model.explanation?.steps?.length).toBe(6);
  });
});
