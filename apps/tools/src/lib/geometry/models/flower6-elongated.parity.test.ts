// Parité géométrique avant/après migration vers Engine B (C4-LOT5-FLOWER6-V1 §7). Valeurs figées
// extraites de l'ancien modèle (commit f78d0bc672ce13903a875cba90849948f1b66b48) via
// `git show <commit>:.../models/flower6-elongated.ts` dans un fichier temporaire, dumpées puis
// supprimées — jamais recalculées ici.
//
// Note bounds (§8) : PAS de comparaison ancien/nouveau sur les bounds. Investigation : l'ancien
// modèle calculait `boundsFromPoints([O, ...petalCentres], padding)` — c'est-à-dire à partir des
// CENTRES des pétales uniquement, jamais de leur rayon/étendue réelle. Pour le jeu A par défaut
// (rotation=-90°), la pointe du premier pétale est en (0,-900) alors que l'ancien `bounds.minY`
// valait -630 : l'ancien modèle risquait donc DÉJÀ une troncature visuelle de la pointe du pétale
// dans le viewer, un bug latent préexistant. Le nouveau modèle (via l'adaptateur, cf. correction
// C4-LOT1) calcule l'enveloppe à partir de la géométrie réelle des ellipses (cercle circonscrit
// max(radiusX,radiusY) par ellipse, un sur-ensemble sûr) : les bounds sont plus larges par
// construction et ne tronquent plus jamais un pétale — une amélioration, pas une divergence à
// faire correspondre à l'ancien calcul erroné.
import { describe, expect, it } from "vitest";
import { createFlower6ElongatedGeometry } from "./flower6-elongated";

describe("createFlower6ElongatedGeometry — parité Engine B (jeu A : valeurs historiques par défaut)", () => {
  const model = createFlower6ElongatedGeometry({ diameter: 1800, rotation: -90 });

  it("6 centres, 6 ellipses, aucune entité finale de plus ou de moins", () => {
    expect(model.ellipses).toHaveLength(6);
    expect(model.points.filter((p) => p.id.startsWith("C"))).toHaveLength(6);
    expect(model.circles).toHaveLength(2); // directeur (construction) + central (shape)
  });

  it("centres, rayons et rotations des 6 pétales", () => {
    const expected = [
      { centre: { x: 2.7554552980815446e-14, y: -450 }, rotation: -3.141592653589793 },
      { centre: { x: 389.71143170299734, y: -225 }, rotation: -2.0943951023931957 },
      { centre: { x: 389.7114317029974, y: 224.99999999999991 }, rotation: -1.0471975511965979 },
      { centre: { x: 2.7554552980815446e-14, y: 450 }, rotation: 0 },
      { centre: { x: -389.71143170299734, y: 225.00000000000014 }, rotation: 1.0471975511965974 },
      { centre: { x: -389.7114317029976, y: -224.99999999999972 }, rotation: 2.094395102393195 },
    ];
    model.ellipses.forEach((ellipse, i) => {
      expect(ellipse.radiusX).toBeCloseTo(189, 6);
      expect(ellipse.radiusY).toBeCloseTo(450, 6);
      expect(ellipse.centre.x).toBeCloseTo(expected[i].centre.x, 4);
      expect(ellipse.centre.y).toBeCloseTo(expected[i].centre.y, 4);
      // Rotation comparée modulo 2π : l'adaptateur/radialPattern peut normaliser différemment
      // sans changer l'orientation géométrique réelle de l'ellipse.
      const raw = ellipse.rotation! - expected[i].rotation;
      const diff = raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI));
      expect(Math.abs(diff)).toBeLessThan(1e-6);
    });
  });

  it("cotes : diamètre, grand axe, petit axe, secteur", () => {
    expect(model.dimensions.find((d) => d.id === "dim-diameter")?.value).toBeCloseTo(1800, 9);
    expect(model.dimensions.find((d) => d.id === "dim-major-axis")?.value).toBeCloseTo(900, 6);
    expect(model.dimensions.find((d) => d.id === "dim-minor-axis")?.value).toBeCloseTo(378, 4);
    expect(model.dimensions.find((d) => d.id === "dim-sector")?.value).toBeCloseTo(60, 9);
  });
});

describe("createFlower6ElongatedGeometry — parité Engine B (jeu B : dimensions différentes + rotation)", () => {
  const model = createFlower6ElongatedGeometry({ diameter: 3200, rotation: 15 });

  it("centres et rotations des 6 pétales", () => {
    const expected = [
      { centre: { x: 772.7406610312546, y: 207.0552360820166 }, rotation: -1.3089969389957472 },
      { centre: { x: 207.05523608201676, y: 772.7406610312546 }, rotation: -0.2617993877991496 },
      { centre: { x: -565.6854249492379, y: 565.685424949238 }, rotation: 0.7853981633974483 },
      { centre: { x: -772.7406610312546, y: -207.05523608201665 }, rotation: 1.8325957145940461 },
      { centre: { x: -207.05523608201722, y: -772.7406610312545 }, rotation: 2.879793265790643 },
      { centre: { x: 565.6854249492375, y: -565.6854249492387 }, rotation: 3.9269908169872405 },
    ];
    model.ellipses.forEach((ellipse, i) => {
      expect(ellipse.radiusX).toBeCloseTo(336, 4);
      expect(ellipse.radiusY).toBeCloseTo(800, 4);
      expect(ellipse.centre.x).toBeCloseTo(expected[i].centre.x, 3);
      expect(ellipse.centre.y).toBeCloseTo(expected[i].centre.y, 3);
      const raw = ellipse.rotation! - expected[i].rotation;
      const diff = raw - 2 * Math.PI * Math.round(raw / (2 * Math.PI));
      expect(Math.abs(diff)).toBeLessThan(1e-6);
    });
  });

  it("cotes : diamètre, grand axe, petit axe, secteur", () => {
    expect(model.dimensions.find((d) => d.id === "dim-diameter")?.value).toBeCloseTo(3200, 9);
    expect(model.dimensions.find((d) => d.id === "dim-major-axis")?.value).toBeCloseTo(1600, 5);
    expect(model.dimensions.find((d) => d.id === "dim-minor-axis")?.value).toBeCloseTo(672, 3);
    expect(model.dimensions.find((d) => d.id === "dim-sector")?.value).toBeCloseTo(60, 9);
  });
});
