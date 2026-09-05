import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createFlower6ElongatedGeometry } from "./flower6-elongated";
import { createRosetteGeometry } from "./rosette";

describe("createFlower6ElongatedGeometry — DECORATIVE-FAMILIES-V1 §15 / C4-LOT5-FLOWER6-V1", () => {
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
    const expectedHalfLength = model.ellipses[0].radiusY;
    const expectedHalfWidth = model.ellipses[0].radiusX;
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
    const petal = flower.ellipses[0];
    expect(petal.radiusX).toBeLessThan(petal.radiusY);
    const rosetteSecondaryRadius = rosette.circles.find((c) => c.role !== "construction")!.radius;
    const rosetteDirectingRadius = rosette.circles.find((c) => c.role === "construction")!.radius;
    expect(rosetteSecondaryRadius).toBeCloseTo(rosetteDirectingRadius, 8); // rosette-6 : même rayon partout.
    expect(petal.radiusX).not.toBeCloseTo(petal.radiusY, 1); // fleur allongée : rayons très différents.
  });

  it("mise à l'échelle : 1200 / 2400 / 3600 mm", () => {
    for (const diameter of [1200, 2400, 3600]) {
      const model = createFlower6ElongatedGeometry({ diameter });
      expect(model.ellipses[0].radiusY).toBeCloseTo(diameter / 4, 8);
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

  it("le petit cercle central touche le bord du cercle directeur uniquement par sa pointe (pétale de O à la circonférence)", () => {
    const model = createFlower6ElongatedGeometry({ diameter: 1800, rotation: 0 });
    const [O] = model.points;
    const petal = model.ellipses[0];
    // Le pétale est centré à mi-rayon (radiusY = distance(O, centre)) : sa pointe extérieure
    // touche exactement le cercle directeur, son autre extrémité touche exactement O.
    expect(distance(O, petal.centre)).toBeCloseTo(petal.radiusY, 6);
  });

  it("les cotes (diamètre, grand axe, petit axe, secteur) proviennent d'engine/dimensions", () => {
    const model = createFlower6ElongatedGeometry({ diameter: 1800, rotation: -90 });
    expect(model.dimensions.find((d) => d.id === "dim-diameter")?.value).toBeCloseTo(1800, 9);
    expect(model.dimensions.find((d) => d.id === "dim-major-axis")?.value).toBeCloseTo(900, 6);
    expect(model.dimensions.find((d) => d.id === "dim-minor-axis")?.value).toBeCloseTo(900 * 0.42, 4);
    expect(model.dimensions.find((d) => d.id === "dim-sector")?.value).toBeCloseTo(60, 9);
  });

  it("les étapes de construction viennent d'Engine B, aucune géométrie dupliquée", () => {
    const model = createFlower6ElongatedGeometry({ diameter: 1800 });
    expect(model.steps.length).toBeGreaterThanOrEqual(6);
    expect(model.steps.every((s) => s.title)).toBe(true);
  });

  it("bounds : aucune troncature — chaque pétale (ellipse complète) reste dans le cadre", () => {
    const model = createFlower6ElongatedGeometry({ diameter: 1800, rotation: 37 });
    for (const ellipse of model.ellipses) {
      const rotation = ellipse.rotation ?? 0;
      const halfWidth = Math.hypot(ellipse.radiusX * Math.cos(rotation), ellipse.radiusY * Math.sin(rotation));
      const halfHeight = Math.hypot(ellipse.radiusX * Math.sin(rotation), ellipse.radiusY * Math.cos(rotation));
      expect(ellipse.centre.x - halfWidth).toBeGreaterThanOrEqual(model.bounds.minX);
      expect(ellipse.centre.x + halfWidth).toBeLessThanOrEqual(model.bounds.maxX);
      expect(ellipse.centre.y - halfHeight).toBeGreaterThanOrEqual(model.bounds.minY);
      expect(ellipse.centre.y + halfHeight).toBeLessThanOrEqual(model.bounds.maxY);
    }
  });
});
