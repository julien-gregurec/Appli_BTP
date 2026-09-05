import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createTurbineGeometry } from "./turbine";

const angleAround = (centre: { x: number; y: number }, p: { x: number; y: number }) => Math.atan2(p.y - centre.y, p.x - centre.x);

describe("createTurbineGeometry — DECORATIVE-FAMILIES-V1 §15", () => {
  it("invariant 1 : répétition régulière — angle constant (360/branches) entre points extérieurs consécutifs", () => {
    const model = createTurbineGeometry({ diameter: 1800, branches: 6, twist: 25, rotation: 0 });
    const [O] = model.points;
    const outer = model.points.filter((p) => p.id.startsWith("P"));
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
    const [O] = model.points;
    const outer = model.points.filter((p) => p.id.startsWith("P"));
    const inner = model.points.filter((p) => p.id.startsWith("Q"));
    expect(inner).toHaveLength(6);
    for (let index = 0; index < 6; index++) {
      let delta = ((angleAround(O, inner[index]) - angleAround(O, outer[index])) * 180) / Math.PI;
      // normaliser dans (-180, 180]
      while (delta > 180) delta -= 360;
      while (delta <= -180) delta += 360;
      expect(delta).toBeCloseTo(twist, 6);
    }
  });

  it("twist = 0 est refusé (le paramètre doit correspondre à un décalage réel reportable)", () => {
    expect(() => createTurbineGeometry({ diameter: 1800, branches: 6, twist: 0, rotation: 0 })).toThrow();
  });

  it("le motif final est un polygone fermé de 2*branches sommets référençant la géométrie existante", () => {
    const model = createTurbineGeometry({ diameter: 1800, branches: 6, twist: 25 });
    const polygon = model.polygons?.find((p) => p.id === "turbine-polygon");
    expect(polygon).toBeDefined();
    expect(polygon!.points).toHaveLength(12);
    const modelIds = new Set(model.points.map((p) => p.id));
    for (const pt of polygon!.points) expect(modelIds.has(pt.id)).toBe(true);
  });

  it("points extérieurs à outerRadius, intérieurs à innerRadius", () => {
    const model = createTurbineGeometry({ diameter: 1800, branches: 6, twist: 25 });
    const [O] = model.points;
    for (const p of model.points.filter((p) => p.id.startsWith("P"))) expect(distance(O, p)).toBeCloseTo(900, 6);
    for (const q of model.points.filter((p) => p.id.startsWith("Q"))) expect(distance(O, q)).toBeCloseTo(360, 6);
  });

  it("mise à l'échelle : 1200 / 2400 / 3600 mm", () => {
    for (const diameter of [1200, 2400, 3600]) {
      const model = createTurbineGeometry({ diameter, branches: 6, twist: 25 });
      expect(model.quantities.find((q) => q.id === "q-outer-radius")?.value).toBeCloseTo(diameter / 2, 8);
    }
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
});
