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
import { createRosette } from "../engine/rosettes";
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

  it("pilote 5a bis — l'arche : ligne de naissance en construction, axe visible, bounds couvrant le sommet de l'arc (C4-LOT2-ARCHES-V1 §7/§10)", () => {
    const shape = createArch({ type: "semicircular", width: 1000 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Arche rôles", slug: "pilot-arch-roles" }));
    expect(model.arcs[0].role).not.toBe("construction");
    expect(model.constructionLines.some((l) => l.role === "construction")).toBe(true);
    expect(model.constructionLines.some((l) => l.role === "axis")).toBe(true);
    const arc = model.arcs[0];
    expect(arc.centre.y + arc.radius).toBeLessThanOrEqual(model.bounds.maxY + 1e-6);
  });

  it("pilote 5a ter — l'ogive : deux cercles complets en construction, deux arcs en tracé final", () => {
    const shape = createArch({ type: "lancet", width: 1000, pointedness: "equilateral" });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Ogive rôles", slug: "pilot-ogive-roles" }));
    expect(model.circles).toHaveLength(2);
    expect(model.circles.every((c) => c.role === "construction")).toBe(true);
    expect(model.arcs).toHaveLength(2);
    expect(model.arcs.every((a) => a.role !== "construction")).toBe(true);
    for (const c of model.circles) {
      expect(c.centre.y + c.radius).toBeLessThanOrEqual(model.bounds.maxY + 1e-6);
      expect(c.centre.y - c.radius).toBeGreaterThanOrEqual(model.bounds.minY - 1e-6);
    }
  });

  it("pilote 5c — rosace classique (sans diamètre intérieur) : cercles secondaires en tracé final, cercle directeur matérialisé en construction (C4-LOT3-ROSETTES-V1 §9)", () => {
    const shape = createRosette({ outerDiameter: 2400, count: 6, elementType: "circle", rotationDegrees: -90 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Rosace pilote", slug: "pilot-rosette" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    const secondary = model.circles.filter((c) => c.role !== "construction");
    expect(secondary).toHaveLength(6);
    for (const c of secondary) expect(c.centre.x ** 2 + c.centre.y ** 2).toBeCloseTo(c.radius ** 2, 4); // passe par O
    expect(model.circles.some((c) => c.role === "construction")).toBe(true);
    // Bounds : l'enveloppe des pointes (au-delà du cercle directeur) doit être couverte.
    for (const c of secondary) {
      expect(c.centre.x + c.radius).toBeLessThanOrEqual(model.bounds.maxX + 1e-6);
      expect(c.centre.x - c.radius).toBeGreaterThanOrEqual(model.bounds.minX - 1e-6);
    }
  });

  it("pilote 5b — cœur", () => {
    const shape = createHeart({ width: 400, height: 400 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Cœur pilote", slug: "pilot-heart" }));
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.arcs).toHaveLength(2);
    expect(model.segments).toHaveLength(2);
  });

  it("pilote 5b bis — les cercles de construction et l'axe du cœur sont classés hors du tracé final (C4-LOT1-V1 §8)", () => {
    const shape = createHeart({ width: 400, height: 500 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Cœur rôles", slug: "pilot-heart-roles" }));
    expect(model.circles).toHaveLength(2);
    expect(model.circles.every((c) => c.role === "construction")).toBe(true);
    // Un segment "axis" ne doit jamais atterrir dans `segments` (tracé final) : uniquement 2
    // tangentes (role "shape" implicite) doivent s'y trouver.
    expect(model.segments).toHaveLength(2);
    expect(model.constructionLines.some((l) => l.role === "axis")).toBe(true);
  });

  it("pilote 5b ter — les bounds couvrent toute la géométrie (arcs/cercles), pas seulement les points nommés (C4-LOT1-V1 §27)", () => {
    const shape = createHeart({ width: 400, height: 500 });
    const model = parametricShapeToTraceModel(shape, baseMetadata({ name: "Cœur bounds", slug: "pilot-heart-bounds" }));
    // Le sommet des lobes (centre + rayon) doit être visible : avant le correctif, les bounds
    // n'étaient calculés qu'à partir des points nommés (centres, jamais du bord des cercles).
    for (const arc of model.arcs) {
      expect(arc.centre.y + arc.radius).toBeLessThanOrEqual(model.bounds.maxY + 1e-6);
      expect(arc.centre.y - arc.radius).toBeGreaterThanOrEqual(model.bounds.minY - 1e-6);
    }
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
