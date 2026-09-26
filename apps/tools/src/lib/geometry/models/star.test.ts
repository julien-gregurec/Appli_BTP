import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createStarGeometry } from "./star";

// C3-PILOT-V1 : mêmes invariants qu'en FIRST-FUNCTIONAL-LOT-V1 §17, contrôlés sur la sortie
// désormais produite via Engine B (`createStar`) puis le pont `parametricShapeToTraceModel`.
// Schéma d'identifiants Engine B : centre "O", sommets extérieurs "T1..T5", creux "V1..V5".
const isOuter = (id: string) => /^T\d+$/.test(id);
const isInner = (id: string) => /^V\d+$/.test(id);

describe("createStarGeometry — C3-PILOT (Engine B)", () => {
  it("produit 5 sommets extérieurs, 5 sommets intérieurs, 1 centre = 11 points", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4, rotation: -90 });
    expect(model.points).toHaveLength(11);
    expect(model.points.filter((p) => isOuter(p.id))).toHaveLength(5);
    expect(model.points.filter((p) => isInner(p.id))).toHaveLength(5);
    expect(model.points.find((p) => p.id === "O")?.role).toBe("center");
  });

  it("chaque sommet extérieur est à outerRadius du centre", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    const centre = model.points.find((p) => p.id === "O")!;
    for (const item of model.points.filter((p) => isOuter(p.id))) expect(distance(centre, item)).toBeCloseTo(1000, 8);
  });

  it("chaque sommet intérieur est à innerRadius du centre", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    const centre = model.points.find((p) => p.id === "O")!;
    for (const item of model.points.filter((p) => isInner(p.id))) expect(distance(centre, item)).toBeCloseTo(400, 8);
  });

  it("symétrie : 72° entre sommets extérieurs consécutifs, 36° entre un sommet extérieur et son intérieur voisin", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4, rotation: 0 });
    const centre = model.points.find((p) => p.id === "O")!;
    const outer = model.points.filter((p) => isOuter(p.id));
    const inner = model.points.filter((p) => isInner(p.id));
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

  it("le polygone étoilé est fermé : 10 sommets alternant rayon extérieur / rayon intérieur", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    const centre = model.points.find((p) => p.id === "O")!;
    const polygon = model.polygons?.[0];
    expect(polygon).toBeDefined();
    expect(polygon!.points).toHaveLength(10);
    polygon!.points.forEach((p, index) => {
      expect(distance(centre, p)).toBeCloseTo(index % 2 === 0 ? 1000 : 400, 6);
    });
  });

  it("rotation appliquée : orientation -90° place le premier sommet extérieur en bas", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4, rotation: -90 });
    const t1 = model.points.find((p) => p.id === "T1")!;
    expect(t1.x).toBeCloseTo(0, 6);
    expect(t1.y).toBeCloseTo(-1000, 6);
  });

  it("paramètre dynamique : le diamètre extérieur recalcule tous les rayons", () => {
    const small = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    const big = createStarGeometry({ outerDiameter: 4000, innerRatio: 0.4 });
    const rOf = (m: ReturnType<typeof createStarGeometry>) => m.dimensions.find((d) => d.id === "dim-outer-radius")?.value ?? 0;
    expect(rOf(big)).toBeCloseTo(rOf(small) * 2, 8);
  });

  it("cotations : Ø extérieur, R extérieur, R intérieur, angle de division", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    expect(model.dimensions.find((d) => d.id === "dim-outer-diameter")?.value).toBeCloseTo(2000, 8);
    expect(model.dimensions.find((d) => d.id === "dim-outer-radius")?.value).toBeCloseTo(1000, 8);
    expect(model.dimensions.find((d) => d.id === "dim-inner-radius")?.value).toBeCloseTo(400, 8);
    expect(model.dimensions.find((d) => d.id === "dim-division-angle")?.value).toBeCloseTo(72, 6);
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

  it("refuse une orientation non finie", () => {
    expect(() => createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4, rotation: Number.NaN })).toThrow();
  });

  it("explication réellement renseignée", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    expect(model.explanation?.objective).toBeTruthy();
    expect(model.explanation?.steps?.length).toBe(6);
  });

  it("pas-à-pas : 6 étapes titrées et distinctes de leur instruction", () => {
    const model = createStarGeometry({ outerDiameter: 2000, innerRatio: 0.4 });
    expect(model.steps).toHaveLength(6);
    for (const step of model.steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.instruction.length).toBeGreaterThan(step.title.length);
    }
    expect(model.steps[0].title).toBe("Tracer le cercle extérieur");
    expect(model.steps.at(-1)!.title).toBe("Vérifier la symétrie");
  });
});
