import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createFlower6ElongatedGeometry } from "./flower6-elongated";
import { createRosetteGeometry } from "./rosette";

describe("createFlower6ElongatedGeometry — DECORATIVE-FAMILIES-V1 §15", () => {
  it("invariant 1 : symétrie radiale de 60° entre pétales consécutifs", () => {
    const model = createFlower6ElongatedGeometry({ diameter: 1800, rotation: 0 });
    const [O] = model.points;
    const centres = model.points.filter((p) => p.id.startsWith("C"));
    expect(centres).toHaveLength(6);
    for (let index = 0; index < centres.length; index++) {
      const current = centres[index];
      const next = centres[(index + 1) % centres.length];
      let delta = ((Math.atan2(next.y - O.y, next.x - O.x) - Math.atan2(current.y - O.y, current.x - O.x)) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(60, 6);
    }
  });

  it("invariant 2 : longueurs/rayons attendus — les 6 pétales ont exactement la même demi-longueur et demi-largeur", () => {
    const model = createFlower6ElongatedGeometry({ diameter: 1800 });
    expect(model.ellipses).toHaveLength(6);
    const expectedHalfLength = model.quantities.find((q) => q.id === "q-petal-half-length")!.value;
    const expectedHalfWidth = model.quantities.find((q) => q.id === "q-petal-half-width")!.value;
    for (const petal of model.ellipses) {
      expect(petal.radiusY).toBeCloseTo(expectedHalfLength, 8);
      expect(petal.radiusX).toBeCloseTo(expectedHalfWidth, 8);
    }
  });

  it("chaque centre de pétale est à distance constante de O", () => {
    const model = createFlower6ElongatedGeometry({ diameter: 1800 });
    const [O] = model.points;
    const centres = model.points.filter((p) => p.id.startsWith("C"));
    const distances = centres.map((c) => distance(O, c));
    for (const value of distances) expect(value).toBeCloseTo(distances[0], 6);
  });

  it("construction réellement différente de rosette-6 : ellipses allongées, pas des cercles pleins de même rayon", () => {
    const flower = createFlower6ElongatedGeometry({ diameter: 1800 });
    const rosette = createRosetteGeometry({ diameter: 1800 });
    expect(flower.ellipses.length).toBeGreaterThan(0);
    // La rosace utilise 6 cercles pleins de rayon = rayon directeur (recouvrement) ; la fleur
    // allongée utilise des ellipses dont le petit axe est nettement inférieur au grand axe.
    const petal = flower.ellipses[0];
    expect(petal.radiusX).toBeLessThan(petal.radiusY);
    // rosette-6 migré vers Engine B (C4-LOT3-ROSETTES-V1) : les 6 pétales n'ont plus d'id fixe
    // ("petal-N"), le cercle directeur non plus ("circle-directing") — distingués ici par rôle.
    const rosetteSecondaryRadius = rosette.circles.find((c) => c.role !== "construction")!.radius;
    const rosetteDirectingRadius = rosette.circles.find((c) => c.role === "construction")!.radius;
    expect(rosetteSecondaryRadius).toBeCloseTo(rosetteDirectingRadius, 8); // rosette-6 : même rayon partout.
    expect(petal.radiusX).not.toBeCloseTo(petal.radiusY, 1); // fleur allongée : rayons très différents.
  });

  it("mise à l'échelle : 1200 / 2400 / 3600 mm", () => {
    for (const diameter of [1200, 2400, 3600]) {
      const model = createFlower6ElongatedGeometry({ diameter });
      expect(model.quantities.find((q) => q.id === "q-petal-half-length")?.value).toBeCloseTo(diameter / 4, 8);
    }
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createFlower6ElongatedGeometry({ diameter: 1800 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("refuse un diamètre invalide", () => {
    expect(() => createFlower6ElongatedGeometry({ diameter: 0 })).toThrow();
    expect(() => createFlower6ElongatedGeometry({ diameter: Number.NaN })).toThrow();
  });
});
