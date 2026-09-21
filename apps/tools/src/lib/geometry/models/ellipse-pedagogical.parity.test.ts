// Parité géométrique avant/après migration vers Engine B (C4-LOT6-ELLIPSE-FINAL-V1 §7). Valeurs
// figées extraites de l'ancien modèle (commit 6192c5f3b7c13bd7eeb0db7eca506148b1c98dda) via
// `git show <commit>:.../models/ellipse-pedagogical.ts` dans un fichier temporaire, dumpées puis
// supprimées — jamais recalculées ici.
//
// Note bounds : comparaison sur l'enveloppe TIGHT (radiusX/radiusY, rotation=0 donc exacte), pas
// sur `model.bounds` (padding formule différente entre ancien modèle et adaptateur — convention
// établie depuis C4-LOT1/C4-LOT4/C4-LOT5 : le padding n'est pas une divergence géométrique).
import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createEllipsePedagogicalGeometry } from "./ellipse-pedagogical";

describe("createEllipsePedagogicalGeometry — parité Engine B (jeu A : width >= height)", () => {
  const model = createEllipsePedagogicalGeometry({ width: 2400, height: 1600 });
  const O = model.points.find((p) => p.id === "O")!;
  const F1 = model.points.find((p) => p.id === "F1")!;
  const F2 = model.points.find((p) => p.id === "F2")!;
  const ellipse = model.ellipses[0];

  it("centre et foyers", () => {
    expect(O.x).toBeCloseTo(0, 9);
    expect(O.y).toBeCloseTo(0, 9);
    expect(F1.x).toBeCloseTo(-894.4271909999159, 6);
    expect(F1.y).toBeCloseTo(0, 9);
    expect(F2.x).toBeCloseTo(894.4271909999159, 6);
    expect(F2.y).toBeCloseTo(0, 9);
  });

  it("axes (radiusX/radiusY)", () => {
    expect(ellipse.radiusX).toBeCloseTo(1200, 9);
    expect(ellipse.radiusY).toBeCloseTo(800, 9);
  });

  it("a, b, c", () => {
    expect(Math.max(ellipse.radiusX, ellipse.radiusY)).toBeCloseTo(1200, 9);
    expect(Math.min(ellipse.radiusX, ellipse.radiusY)).toBeCloseTo(800, 9);
    expect(distance(O, F1)).toBeCloseTo(894.4271909999159, 6);
  });

  it("enveloppe serrée (rotation nulle : exacte)", () => {
    expect(ellipse.centre.x - ellipse.radiusX).toBeCloseTo(-1200, 9);
    expect(ellipse.centre.x + ellipse.radiusX).toBeCloseTo(1200, 9);
    expect(ellipse.centre.y - ellipse.radiusY).toBeCloseTo(-800, 9);
    expect(ellipse.centre.y + ellipse.radiusY).toBeCloseTo(800, 9);
  });

  it("cotes : grand axe, petit axe, foyers", () => {
    expect(model.dimensions.find((d) => d.id === "dim-major")?.value).toBeCloseTo(2400, 9);
    expect(model.dimensions.find((d) => d.id === "dim-minor")?.value).toBeCloseTo(1600, 9);
    expect(model.dimensions.find((d) => d.id === "dim-foci")?.value).toBeCloseTo(2 * 894.4271909999159, 6);
  });
});

describe("createEllipsePedagogicalGeometry — parité Engine B (jeu B : width < height, permutation d'axe)", () => {
  const model = createEllipsePedagogicalGeometry({ width: 900, height: 2100 });
  const O = model.points.find((p) => p.id === "O")!;
  const F1 = model.points.find((p) => p.id === "F1")!;
  const F2 = model.points.find((p) => p.id === "F2")!;
  const ellipse = model.ellipses[0];

  it("centre et foyers sur l'axe vertical", () => {
    expect(F1.x).toBeCloseTo(0, 9);
    expect(F1.y).toBeCloseTo(-948.6832980505138, 6);
    expect(F2.x).toBeCloseTo(0, 9);
    expect(F2.y).toBeCloseTo(948.6832980505138, 6);
  });

  it("axes (radiusX/radiusY)", () => {
    expect(ellipse.radiusX).toBeCloseTo(450, 9);
    expect(ellipse.radiusY).toBeCloseTo(1050, 9);
  });

  it("a, b, c", () => {
    expect(Math.max(ellipse.radiusX, ellipse.radiusY)).toBeCloseTo(1050, 9);
    expect(Math.min(ellipse.radiusX, ellipse.radiusY)).toBeCloseTo(450, 9);
    expect(distance(O, F1)).toBeCloseTo(948.6832980505138, 6);
  });

  it("enveloppe serrée (rotation nulle : exacte)", () => {
    expect(ellipse.centre.x - ellipse.radiusX).toBeCloseTo(-450, 9);
    expect(ellipse.centre.x + ellipse.radiusX).toBeCloseTo(450, 9);
    expect(ellipse.centre.y - ellipse.radiusY).toBeCloseTo(-1050, 9);
    expect(ellipse.centre.y + ellipse.radiusY).toBeCloseTo(1050, 9);
  });

  it("cotes : grand axe vertical, petit axe horizontal, foyers", () => {
    expect(model.dimensions.find((d) => d.id === "dim-major")?.value).toBeCloseTo(2100, 9);
    expect(model.dimensions.find((d) => d.id === "dim-minor")?.value).toBeCloseTo(900, 9);
    expect(model.dimensions.find((d) => d.id === "dim-foci")?.value).toBeCloseTo(2 * 948.6832980505138, 6);
  });
});

describe("createEllipsePedagogicalGeometry — parité Engine B (jeu C : cercle, width === height)", () => {
  const model = createEllipsePedagogicalGeometry({ width: 1400, height: 1400 });
  const O = model.points.find((p) => p.id === "O")!;
  const F1 = model.points.find((p) => p.id === "F1")!;
  const F2 = model.points.find((p) => p.id === "F2")!;
  const ellipse = model.ellipses[0];

  it("foyers confondus avec O", () => {
    expect(distance(O, F1)).toBeCloseTo(0, 9);
    expect(distance(O, F2)).toBeCloseTo(0, 9);
  });

  it("axes égaux (700/700)", () => {
    expect(ellipse.radiusX).toBeCloseTo(700, 9);
    expect(ellipse.radiusY).toBeCloseTo(700, 9);
  });

  it("enveloppe serrée (rotation nulle : exacte)", () => {
    expect(ellipse.centre.x - ellipse.radiusX).toBeCloseTo(-700, 9);
    expect(ellipse.centre.x + ellipse.radiusX).toBeCloseTo(700, 9);
    expect(ellipse.centre.y - ellipse.radiusY).toBeCloseTo(-700, 9);
    expect(ellipse.centre.y + ellipse.radiusY).toBeCloseTo(700, 9);
  });

  it("cote foyers nulle", () => {
    expect(model.dimensions.find((d) => d.id === "dim-foci")?.value).toBeCloseTo(0, 9);
  });
});
