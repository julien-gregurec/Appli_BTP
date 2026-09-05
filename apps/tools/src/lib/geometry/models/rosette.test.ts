import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createRosetteGeometry } from "./rosette";

describe("createRosetteGeometry — FIRST-FUNCTIONAL-LOT-V1 §18", () => {
  it("produit 6 centres secondaires", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const secondary = model.points.filter((p) => p.id.startsWith("C"));
    expect(secondary).toHaveLength(6);
  });

  it("rayon cohérent : chaque centre secondaire à R du centre, chaque cercle secondaire de rayon R", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const [O] = model.points;
    const secondary = model.points.filter((p) => p.id.startsWith("C"));
    for (const item of secondary) expect(distance(O, item)).toBeCloseTo(1200, 8);
    const secondaryCircles = model.circles.filter((c) => c.id.startsWith("petal-"));
    expect(secondaryCircles).toHaveLength(6);
    for (const circle of secondaryCircles) expect(circle.radius).toBeCloseTo(1200, 8);
  });

  it("espacement angulaire 60° entre centres secondaires consécutifs", () => {
    const model = createRosetteGeometry({ diameter: 2400, rotation: 0 });
    const [O] = model.points;
    const secondary = model.points.filter((p) => p.id.startsWith("C"));
    for (let index = 0; index < secondary.length; index++) {
      const current = secondary[index];
      const next = secondary[(index + 1) % secondary.length];
      let delta = ((Math.atan2(next.y - O.y, next.x - O.x) - Math.atan2(current.y - O.y, current.x - O.x)) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(60, 6);
    }
  });

  it("symétrie radiale : les 6 centres sont invariants par rotation de 60°", () => {
    const a = createRosetteGeometry({ diameter: 2400, rotation: 0 });
    const b = createRosetteGeometry({ diameter: 2400, rotation: 60 });
    const centresA = a.points.filter((p) => p.id.startsWith("C"));
    const centresB = b.points.filter((p) => p.id.startsWith("C"));
    // Comparaison par tolérance numérique (distance), pas par égalité de chaîne : Math.cos/sin
    // produisent un bruit flottant de l'ordre de 1e-13, jamais une différence géométrique réelle.
    for (const pointA of centresA) {
      const closest = Math.min(...centresB.map((pointB) => distance(pointA, pointB)));
      expect(closest).toBeLessThan(1e-6);
    }
  });

  it("invariant propre à la construction : chaque cercle secondaire passe exactement par le centre O (propriété du triangle équilatéral O-Ci-Ci+1)", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const [O] = model.points;
    const secondaryCircles = model.circles.filter((c) => c.id.startsWith("petal-"));
    for (const circle of secondaryCircles) expect(distance(O, circle.centre)).toBeCloseTo(circle.radius, 8);
  });

  it("invariant propre à la construction : la pointe de chaque pétale est à R√3 du centre (deuxième intersection cercle/cercle)", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const [O] = model.points;
    const R = model.quantities.find((q) => q.id === "q-radius")!.value;
    const tips = model.points.filter((p) => p.id.startsWith("T"));
    expect(tips).toHaveLength(6);
    for (const tip of tips) expect(distance(O, tip)).toBeCloseTo(R * Math.sqrt(3), 6);
  });

  it("aucune coordonnée invalide", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("paramètre dynamique : le diamètre recalcule le rayon utilisé partout (directeur = secondaire)", () => {
    const a = createRosetteGeometry({ diameter: 2400 });
    const b = createRosetteGeometry({ diameter: 3000 });
    expect(a.quantities.find((q) => q.id === "q-radius")?.value).toBeCloseTo(1200, 8);
    expect(b.quantities.find((q) => q.id === "q-radius")?.value).toBeCloseTo(1500, 8);
  });

  it("refuse un diamètre invalide", () => {
    expect(() => createRosetteGeometry({ diameter: 0 })).toThrow();
    expect(() => createRosetteGeometry({ diameter: -50 })).toThrow();
    expect(() => createRosetteGeometry({ diameter: Number.NaN })).toThrow();
  });

  it("explication réellement renseignée, formule documentée", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    expect(model.explanation?.principle).toContain("R");
    expect(model.explanation?.steps?.length).toBeGreaterThan(0);
  });
});
