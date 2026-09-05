import { describe, expect, it } from "vitest";
import type { TraceModelMetadata } from "./parametric-to-trace-model";
import { dimensionResultToDimension, parametricShapeToTraceModel, validateParametricShape } from "./parametric-to-trace-model";
import { validateTraceModel } from "../trace-model";
import { createCircle } from "../engine/basic-shapes";
import { createRegularPolygon } from "../engine/polygons";
import { createStar } from "../engine/stars";
import { createLeaf } from "../engine/petals";
import { createArch } from "../engine/arches";
import { createHeart } from "../engine/hearts";
import { createRadialPattern } from "../engine/radial-pattern";
import { offsetShape } from "../engine/api";
import { createDiameterDimension, createRadiusDimension, createAlignedDimension, createAngleDimension } from "../engine/dimensions";

const baseMetadata = (overrides: Partial<TraceModelMetadata>): TraceModelMetadata => ({
  name: "Pilote", slug: "pilote", categoryId: "forms-design", difficulty: "intermediate", tags: [], status: "preview", parameters: [],
  ...overrides,
});

/**
 * §13/14 — Pilotes obligatoires : 5 générateurs Engine B de familles différentes + 1 pilote
 * radial. Aucune UI : on vérifie uniquement Engine B params → ParametricShape → adapter →
 * TraceModel → validateTraceModel, sans exception.
 */
describe("pilotes de convergence ParametricShape → TraceModel", () => {
  it("pilote 1 — cercle", () => {
    const shape = createCircle({ radius: 500 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Cercle pilote", slug: "pilot-circle" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.circles).toHaveLength(1);
    expect(model.circles[0].radius).toBe(500);
    expect(model.steps.length).toBeGreaterThan(0);
  });

  it("pilote 2 — polygone régulier (hexagone)", () => {
    const shape = createRegularPolygon({ sides: 6, radius: 300 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Hexagone pilote", slug: "pilot-hexagon" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.polygons?.[0]?.points).toHaveLength(6);
    expect(model.segments).toHaveLength(6);
  });

  it("pilote 3 — étoile générique", () => {
    const shape = createStar({ points: 5, outerRadius: 300, innerRadius: 120 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Étoile pilote", slug: "pilot-star" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.polygons?.[0]?.points).toHaveLength(10);
    expect(model.circles).toHaveLength(2); // cercles directeurs extérieur/intérieur
  });

  it("pilote 3 bis — les titres courts de ConstructionStep sont transférés en SiteStep.title", () => {
    const shape = createStar({ points: 5, outerRadius: 300, innerRadius: 120 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Étoile titrée", slug: "pilot-star-titled" }));
    // createStar fournit des titres courts distincts de l'instruction complète.
    expect(model.steps[0].title).toBe("Tracer le cercle extérieur");
    expect(model.steps[0].instruction.length).toBeGreaterThan(model.steps[0].title.length);
    expect(model.steps.every((s) => s.title.length > 0)).toBe(true);
  });

  it("pilote 4 — pétale (feuille)", () => {
    const shape = createLeaf({ width: 200, height: 400 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Pétale pilote", slug: "pilot-leaf" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.arcs).toHaveLength(2);
  });

  it("pilote 5a — arche", () => {
    const shape = createArch({ type: "semicircular", width: 1000 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Arche pilote", slug: "pilot-arch" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.arcs.length).toBeGreaterThan(0);
  });

  it("pilote 5b — cœur", () => {
    const shape = createHeart({ width: 400, height: 400 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Cœur pilote", slug: "pilot-heart" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.arcs).toHaveLength(2);
    expect(model.segments).toHaveLength(2);
  });
});

/**
 * §14 — Pilote radial structurant pour les futures rosaces/fleurs : source = pétale, 6
 * répétitions via `createRadialPattern`, puis conversion. Vérifie l'absence de perte
 * d'entité et la stabilité de l'ordre.
 */
describe("pilote radial — pétale × 6", () => {
  it("6 répétitions, ordre stable, aucune perte d'entité, géométrie valide, steps cohérents", () => {
    const leaf = createLeaf({ width: 150, height: 300, centre: { x: 400, y: 0 } });
    expect(leaf.primitives.arcs).toHaveLength(2);

    const pattern = createRadialPattern({ source: leaf.primitives.arcs, count: 6 });
    // 2 arcs par pétale × 6 répétitions = 12 arcs, sans perte.
    expect(pattern.primitives.arcs).toHaveLength(12);

    const model = parametricShapeToTraceModel(pattern, baseMetadata({ name: "Rosace pilote (pétale ×6)", slug: "pilot-radial-petal-6" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.arcs).toHaveLength(12);

    // Ordre stable : les ids générés suivent l'ordre d'apparition dans `primitives.arcs`
    // (index croissant), donc les deux arcs du pétale n dans `pattern.primitives.arcs`
    // doivent se retrouver consécutifs dans `model.arcs` avec des ids `-arc-{2n}`/`-arc-{2n+1}`.
    for (let i = 0; i < 12; i++) expect(model.arcs[i].id).toBe(`${model.id}-arc-${i}`);

    // Aucune perte : chaque arc du modèle a un rayon fini et positif, cohérent avec la source.
    for (const arc of model.arcs) {
      expect(Number.isFinite(arc.radius)).toBe(true);
      expect(arc.radius).toBeGreaterThan(0);
    }
  });
});

/**
 * §10 — Compatibilité offset : une forme après `offsetShape(...)` doit se convertir en
 * TraceModel structurellement valide.
 */
describe("compatibilité offset", () => {
  it("cercle → offsetShape → adaptateur → TraceModel valide", () => {
    const shape = createCircle({ radius: 200 });
    const offset = offsetShape(shape, 30);
    expect(offset.primitives.circles[0].radius).toBe(230);
    const model = parametricShapeToTraceModel(offset, baseMetadata({ name: "Cercle offset pilote", slug: "pilot-circle-offset" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.circles[0].radius).toBe(230);
  });
});

/**
 * §11 — Cotations : les résultats de `engine/dimensions.ts` se transfèrent sans être
 * réécrits à la main (mêmes valeurs numériques).
 */
describe("cotations transférées depuis engine/dimensions", () => {
  it("diamètre, rayon, longueur alignée et angle se retrouvent identiques dans le TraceModel", () => {
    const shape = createCircle({ radius: 250 });
    const circle = shape.primitives.circles[0];
    const diameterResult = createDiameterDimension(circle);
    const radiusResult = createRadiusDimension(circle);
    const alignedResult = createAlignedDimension({ x: 0, y: 0 }, { x: 30, y: 40 });
    const angleResult = createAngleDimension({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 });

    const dimensions = [
      dimensionResultToDimension("dim-diameter", `Ø ${diameterResult.value} mm`, diameterResult),
      dimensionResultToDimension("dim-radius", `R ${radiusResult.value} mm`, radiusResult),
      dimensionResultToDimension("dim-aligned", `${alignedResult.value} mm`, alignedResult),
      dimensionResultToDimension("dim-angle", `${angleResult.value}°`, angleResult),
    ];

    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Cercle coté", slug: "pilot-circle-dims" }), { dimensions });
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.dimensions).toHaveLength(4);
    expect(model.dimensions.find((d) => d.id === "dim-diameter")?.value).toBe(500);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBe(250);
    expect(model.dimensions.find((d) => d.id === "dim-aligned")?.value).toBe(50);
    expect(model.dimensions.find((d) => d.id === "dim-angle")?.kind).toBe("angle");
    expect(model.dimensions.find((d) => d.id === "dim-angle")?.value).toBeCloseTo(90, 8);
  });
});

/**
 * §16 — Validation : le résultat de l'adaptateur passe les validateurs existants sans
 * modification de leur logique (ids uniques, références valides, nombres finis, bounds).
 */
describe("validation du résultat de l'adaptateur", () => {
  it("une ParametricShape valide produit un TraceModel qui passe validateTraceModel", () => {
    const shape = createStar({ points: 6, outerRadius: 400, innerRadius: 150 });
    expect(validateParametricShape(shape)).toHaveLength(0);
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Étoile validée", slug: "pilot-star-valid" }));
    expect(() => validateTraceModel(model)).not.toThrow();
  });

  it("les ids générés sont uniques même pour une forme à nombreuses primitives (rosace)", () => {
    const leaf = createLeaf({ width: 100, height: 200 });
    const pattern = createRadialPattern({ source: [leaf.primitives.arcs[0], leaf.primitives.arcs[1]], count: 8 });
    const model = parametricShapeToTraceModel(pattern, baseMetadata({ name: "Rosace 8", slug: "pilot-rosace-8" }));
    const allIds = [...model.points, ...model.segments, ...model.arcs, ...model.circles, ...model.ellipses, ...model.constructionLines, ...model.dimensions, ...model.controls, ...model.steps].map((e) => e.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
