import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createTurbineGeometry } from "./turbine";

// C4-LOT1-V1 : mêmes invariants qu'en DECORATIVE-FAMILIES-V1 §15, contrôlés sur la sortie
// désormais produite via Engine B (`createStar` généralisé avec `innerAngleOffsetDegrees`) puis
// le pont `parametricShapeToTraceModel`. Schéma d'identifiants Engine B (comme star-5) : centre
// "O", sommets extérieurs "T1..TN", sommets intérieurs décalés "V1..VN".
const angleAround = (centre: { x: number; y: number }, p: { x: number; y: number }) => Math.atan2(p.y - centre.y, p.x - centre.x);
const isOuter = (id: string) => /^T\d+$/.test(id);
const isInner = (id: string) => /^V\d+$/.test(id);

describe("createTurbineGeometry — C4-LOT1 (Engine B)", () => {
  it("invariant 1 : répétition régulière — angle constant (360/branches) entre points extérieurs consécutifs", () => {
    const model = createTurbineGeometry({ diameter: 1800, branches: 6, twist: 25, rotation: 0 });
    const O = model.points.find((p) => p.id === "O")!;
    const outer = model.points.filter((p) => isOuter(p.id));
    expect(outer).toHaveLength(6);
    for (let index = 0; index < outer.length; index++) {
      const next = outer[(index + 1) % outer.length];
      let delta = ((angleAround(O, next) - angleAround(O, outer[index])) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(60, 6);
    }
  });

  it("invariant 2 : décalage angulaire constant (le twist) entre chaque point extérieur et son point intérieur", () => {
    const twist = 25;
    const model = createTurbineGeometry({ diameter: 1800, branches: 6, twist, rotation: 0 });
    const O = model.points.find((p) => p.id === "O")!;
    const outer = model.points.filter((p) => isOuter(p.id));
    const inner = model.points.filter((p) => isInner(p.id));
    expect(inner).toHaveLength(6);
    for (let index = 0; index < 6; index++) {
      let delta = ((angleAround(O, inner[index]) - angleAround(O, outer[index])) * 180) / Math.PI;
      while (delta > 180) delta -= 360;
      while (delta <= -180) delta += 360;
      expect(delta).toBeCloseTo(twist, 6);
    }
  });

  it("twist = 0 est refusé (le paramètre doit correspondre à un décalage réel reportable)", () => {
    expect(() => createTurbineGeometry({ diameter: 1800, branches: 6, twist: 0, rotation: 0 })).toThrow();
  });

  it("le motif final est un polygone fermé de 2*branches sommets", () => {
    const model = createTurbineGeometry({ diameter: 1800, branches: 6, twist: 25 });
    const polygon = model.polygons?.[0];
    expect(polygon).toBeDefined();
    expect(polygon!.points).toHaveLength(12);
  });

  it("points extérieurs à outerRadius, intérieurs à innerRadius", () => {
    const model = createTurbineGeometry({ diameter: 1800, branches: 6, twist: 25 });
    const O = model.points.find((p) => p.id === "O")!;
    for (const p of model.points.filter((p) => isOuter(p.id))) expect(distance(O, p)).toBeCloseTo(900, 6);
    for (const q of model.points.filter((p) => isInner(p.id))) expect(distance(O, q)).toBeCloseTo(360, 6);
  });

  it("mise à l'échelle : 1200 / 2400 / 3600 mm", () => {
    for (const diameter of [1200, 2400, 3600]) {
      const model = createTurbineGeometry({ diameter, branches: 6, twist: 25 });
      expect(model.dimensions.find((d) => d.id === "dim-outer-radius")?.value).toBeCloseTo(diameter / 2, 8);
      expect(model.dimensions.find((d) => d.id === "dim-outer-diameter")?.value).toBeCloseTo(diameter, 8);
    }
  });

  it("cotations : Ø extérieur, R extérieur, angle entre branches, twist", () => {
    const model = createTurbineGeometry({ diameter: 1800, branches: 6, twist: 25 });
    expect(model.dimensions.find((d) => d.id === "dim-outer-diameter")?.value).toBeCloseTo(1800, 8);
    expect(model.dimensions.find((d) => d.id === "dim-outer-radius")?.value).toBeCloseTo(900, 8);
    expect(model.dimensions.find((d) => d.id === "dim-sector")?.value).toBeCloseTo(60, 6);
    expect(model.dimensions.find((d) => d.id === "dim-twist")?.value).toBeCloseTo(25, 6);
  });

  it("fonctionne pour d'autres nombres de branches", () => {
    for (const branches of [3, 4, 8, 12]) {
      const model = createTurbineGeometry({ diameter: 1800, branches, twist: 20 });
      expect(model.polygons?.[0].points).toHaveLength(branches * 2);
      expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
    }
  });

  it("refuse des paramètres invalides", () => {
    expect(() => createTurbineGeometry({ diameter: 0, branches: 6, twist: 25 })).toThrow();
    expect(() => createTurbineGeometry({ diameter: 1800, branches: 2, twist: 25 })).toThrow();
    expect(() => createTurbineGeometry({ diameter: 1800, branches: 6.5, twist: 25 })).toThrow();
    expect(() => createTurbineGeometry({ diameter: 1800, branches: 6, twist: Number.NaN })).toThrow();
  });

  it("explication réellement renseignée", () => {
    const model = createTurbineGeometry({ diameter: 1800, branches: 6, twist: 25 });
    expect(model.explanation?.objective).toBeTruthy();
    expect(model.explanation?.steps?.length).toBeGreaterThan(0);
  });
});
