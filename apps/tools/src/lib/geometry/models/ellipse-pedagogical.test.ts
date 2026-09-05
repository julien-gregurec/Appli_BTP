import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createEllipsePedagogicalGeometry } from "./ellipse-pedagogical";

describe("createEllipsePedagogicalGeometry — FUNDAMENTAL-MODELS-V1 §17", () => {
  it("width=2400 / height=1600 -> a=1200, b=800, c=sqrt(1200²-800²)", () => {
    const model = createEllipsePedagogicalGeometry({ width: 2400, height: 1600 });
    const expectedC = Math.sqrt(1200 ** 2 - 800 ** 2);
    expect(model.quantities.find((q) => q.id === "q-a")?.value).toBeCloseTo(1200, 8);
    expect(model.quantities.find((q) => q.id === "q-b")?.value).toBeCloseTo(800, 8);
    expect(model.quantities.find((q) => q.id === "q-c")?.value).toBeCloseTo(expectedC, 8);
  });

  it("foyers symétriques par rapport au centre, sur le grand axe", () => {
    const model = createEllipsePedagogicalGeometry({ width: 2400, height: 1600 });
    const O = model.points.find((p) => p.id === "O")!;
    const F1 = model.points.find((p) => p.id === "F1")!;
    const F2 = model.points.find((p) => p.id === "F2")!;
    expect(distance(O, F1)).toBeCloseTo(distance(O, F2), 8);
    expect(F1.x).toBeCloseTo(-F2.x, 8);
    expect(F1.y).toBeCloseTo(-F2.y, 8);
  });

  it("contour valide : l'ellipse rendue a les bons demi-axes", () => {
    const model = createEllipsePedagogicalGeometry({ width: 2400, height: 1600 });
    const ellipse = model.ellipses[0];
    expect(ellipse.radiusX).toBeCloseTo(1200, 8);
    expect(ellipse.radiusY).toBeCloseTo(800, 8);
  });

  it("cas height > width : l'orientation s'adapte sans erreur (grand axe vertical)", () => {
    const model = createEllipsePedagogicalGeometry({ width: 1600, height: 2400 });
    expect(model.quantities.find((q) => q.id === "q-a")?.value).toBeCloseTo(1200, 8);
    expect(model.quantities.find((q) => q.id === "q-b")?.value).toBeCloseTo(800, 8);
    const F1 = model.points.find((p) => p.id === "F1")!;
    // Grand axe vertical -> foyers sur Y, pas sur X.
    expect(F1.x).toBeCloseTo(0, 8);
    expect(Math.abs(F1.y)).toBeGreaterThan(0);
  });

  it("paramètres dynamiques : d'autres dimensions recalculent a/b/c", () => {
    const model = createEllipsePedagogicalGeometry({ width: 3000, height: 2000 });
    expect(model.quantities.find((q) => q.id === "q-a")?.value).toBeCloseTo(1500, 8);
    expect(model.quantities.find((q) => q.id === "q-b")?.value).toBeCloseTo(1000, 8);
  });

  it("longueur de ficelle = 2a", () => {
    const model = createEllipsePedagogicalGeometry({ width: 2400, height: 1600 });
    expect(model.controls.find((c) => c.id === "control-string")?.value).toBeCloseTo(2400, 8);
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createEllipsePedagogicalGeometry({ width: 2400, height: 1600 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("cas cercle (width = height) : c = 0", () => {
    const model = createEllipsePedagogicalGeometry({ width: 2000, height: 2000 });
    expect(model.quantities.find((q) => q.id === "q-c")?.value).toBeCloseTo(0, 8);
  });

  it("refuse des dimensions invalides", () => {
    expect(() => createEllipsePedagogicalGeometry({ width: 0, height: 1600 })).toThrow();
    expect(() => createEllipsePedagogicalGeometry({ width: 2400, height: 0 })).toThrow();
    expect(() => createEllipsePedagogicalGeometry({ width: Number.NaN, height: 1600 })).toThrow();
  });
});
