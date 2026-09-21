import { describe, expect, it } from "vitest";
import {
  addShapeToFreeGeometry,
  checkShapeForFreeGeometry,
  dedupeVerticesForFreeGeometry,
  fitShapeToFreeLimits,
  freeGeometryFromShape,
  freeKindForShape,
  sampleFitForFreeGeometry,
} from "./free-conversion";
import { fitCircle, fitEllipse, sampleEllipse } from "./fitting";
import {
  EMPTY_FREE_GEOMETRY,
  countFreeVertices,
  freeEntityLength,
  MAX_FREE_POLYLINE_VERTICES,
} from "./free-geometry";
import { confirmContour, contourToGeometricShape, createRawContour } from "./vectorization";
import { distance, type Point2D } from "./geometry-port";

function confirmedShape(points: readonly Point2D[], closed = true, id = "forme-1") {
  return contourToGeometricShape(
    confirmContour(createRawContour({ id, points, space: "millimetres", closed, source: "manual" })),
  );
}

function circlePoints(centre: Point2D, radius: number, count: number): Point2D[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * 2 * Math.PI;
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });
}

describe("nettoyage des sommets pour le tracé libre (§11)", () => {
  it("supprime les doublons consécutifs et ne répète pas le premier sommet d'un contour", () => {
    const points: Point2D[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 0 },
    ];
    expect(dedupeVerticesForFreeGeometry(points, true)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("associe la bonne nature libre à la forme vectorisée", () => {
    expect(freeKindForShape({ kind: "polygon", closed: true })).toBe("polygon");
    expect(freeKindForShape({ kind: "polyline", closed: false })).toBe("polyline");
  });
});

describe("la géométrie confirmée devient un tracé libre canonique (§11)", () => {
  it("convertit un contour confirmé en contour libre du canon", () => {
    const shape = confirmedShape([
      { x: 0, y: 0 },
      { x: 1850, y: 0 },
      { x: 1850, y: 1850 },
      { x: 0, y: 1850 },
    ]);
    const result = freeGeometryFromShape(shape);
    expect(result.entity.kind).toBe("polygon");
    expect(result.entity.points).toHaveLength(4);
    expect(result.entity.id).toBe("pg-1");
    expect(result.geometry.entities).toHaveLength(1);
    expect(result.maxDeviationMm).toBe(0);
    // Le périmètre du contour libre est bien celui du relevé : 4 × 1850 mm.
    expect(freeEntityLength(result.entity)).toBeCloseTo(4 * 1850, 6);
  });

  it("empile plusieurs relevés dans le même tracé libre, en numérotant comme le canon", () => {
    const first = freeGeometryFromShape(confirmedShape(circlePoints({ x: 0, y: 0 }, 500, 24), true, "a"));
    const second = addShapeToFreeGeometry(first.geometry, confirmedShape(circlePoints({ x: 3000, y: 0 }, 400, 24), true, "b"));
    expect(second.geometry.entities.map((entity) => entity.id)).toEqual(["pg-1", "pg-2"]);
    expect(countFreeVertices(second.geometry)).toBe(48);
  });

  it("conserve la provenance de mesure et la signale quand elle n'est pas fiable", () => {
    const shape = { ...confirmedShape(circlePoints({ x: 0, y: 0 }, 300, 12)), origin: "approximated" as const };
    const result = freeGeometryFromShape(shape);
    expect(result.origin).toBe("approximated");
    expect(result.notice).toContain("indicatives");
  });
});

describe("plafond de sommets du tracé libre (§11, §19)", () => {
  const dense = circlePoints({ x: 0, y: 0 }, 900, 3000);

  it("refuse un relevé trop dense en disant quoi faire, plutôt que de le tronquer", () => {
    const shape = confirmedShape(dense);
    const check = checkShapeForFreeGeometry(shape);
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.code).toBe("trop-de-sommets");
      expect(check.message).toContain("Simplifiez");
    }
    expect(() => freeGeometryFromShape(shape)).toThrow(/Simplifiez/);
  });

  it("simplifie sur demande et rend l'écart RÉELLEMENT mesuré", () => {
    const result = freeGeometryFromShape(confirmedShape(dense), { simplifyIfNeeded: true });
    expect(result.entity.points.length).toBeLessThanOrEqual(MAX_FREE_POLYLINE_VERTICES);
    expect(result.maxDeviationMm).toBeGreaterThan(0);
    expect(result.notice).toContain("écart maximal");
    // La réduction reste fidèle : le rayon du relevé est conservé au millimètre près.
    for (const vertex of result.entity.points) {
      expect(distance({ x: 0, y: 0 }, vertex)).toBeGreaterThan(895);
      expect(distance({ x: 0, y: 0 }, vertex)).toBeLessThan(905);
    }
  });

  it("retient la tolérance la plus fidèle qui passe sous le plafond", () => {
    const fitted = fitShapeToFreeLimits(dense, true);
    expect(fitted.reduced).toBe(true);
    expect(fitted.vertices.length).toBeLessThanOrEqual(MAX_FREE_POLYLINE_VERTICES);
    expect(fitted.maxDeviationMm).toBeLessThanOrEqual(fitted.toleranceMm);
  });

  it("ne touche pas à un relevé qui tient déjà", () => {
    const fitted = fitShapeToFreeLimits(circlePoints({ x: 0, y: 0 }, 500, 120), true);
    expect(fitted.reduced).toBe(false);
    expect(fitted.maxDeviationMm).toBe(0);
    expect(fitted.vertices).toHaveLength(120);
  });

  it("refuse une forme sortant des limites du tracé libre", () => {
    const shape = confirmedShape([
      { x: 0, y: 0 },
      { x: 2_000_000, y: 0 },
      { x: 0, y: 1000 },
    ]);
    const check = checkShapeForFreeGeometry(shape);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.code).toBe("hors-limites");
  });

  it("refuse un contour qui n'enferme aucune surface", () => {
    const shape = confirmedShape([
      { x: 10, y: 10 },
      { x: 10, y: 10.0000001 },
      { x: 10, y: 10 },
    ]);
    const check = checkShapeForFreeGeometry(shape);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.code).toBe("pas-assez-de-sommets");
  });
});

describe("un ajustement reste une mesure, pas une primitive libre (§13)", () => {
  it("échantillonne un cercle sous la flèche demandée et le dit", () => {
    const fit = fitCircle(circlePoints({ x: 1000, y: 500 }, 602, 90));
    const sampled = sampleFitForFreeGeometry(fit, 1);
    expect(sampled.closed).toBe(true);
    expect(sampled.maxSagittaMm).toBeLessThanOrEqual(1);
    expect(sampled.notice).toContain("rayon 602");
    expect(sampled.notice).toContain("approximation polygonale");
    for (const point of sampled.points) expect(distance({ x: 1000, y: 500 }, point)).toBeCloseTo(602, 6);
  });

  it("échantillonne plus finement quand on demande une flèche plus serrée", () => {
    const fit = fitCircle(circlePoints({ x: 0, y: 0 }, 1000, 90));
    const coarse = sampleFitForFreeGeometry(fit, 5);
    const fine = sampleFitForFreeGeometry(fit, 0.5);
    expect(fine.points.length).toBeGreaterThan(coarse.points.length);
    expect(fine.maxSagittaMm).toBeLessThan(coarse.maxSagittaMm);
  });

  it("annonce qu'une ellipse ne se trace pas au compas", () => {
    const ellipse = { centre: { x: 0, y: 0 }, radiusX: 900, radiusY: 500, rotation: 0 };
    const sampled = sampleFitForFreeGeometry(fitEllipse(sampleEllipse(ellipse, 120)), 1);
    expect(sampled.closed).toBe(true);
    expect(sampled.notice).toContain("ne se trace pas au compas");
    expect(sampled.points.length).toBeLessThanOrEqual(MAX_FREE_POLYLINE_VERTICES);
  });

  it("rend une droite telle quelle, sans flèche", () => {
    const sampled = sampleFitForFreeGeometry({
      kind: "line",
      segment: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      maxError: 0,
      rmsError: 0,
      pointCount: 2,
    });
    expect(sampled.points).toHaveLength(2);
    expect(sampled.maxSagittaMm).toBe(0);
  });

  it("un cercle échantillonné entre dans le tracé libre sans dépasser le plafond", () => {
    const fit = fitCircle(circlePoints({ x: 0, y: 0 }, 602, 90));
    const sampled = sampleFitForFreeGeometry(fit, 1);
    const shape = confirmedShape(sampled.points, true, "cercle-1");
    const result = addShapeToFreeGeometry(EMPTY_FREE_GEOMETRY, shape);
    expect(result.entity.kind).toBe("polygon");
    expect(result.entity.points.length).toBeLessThanOrEqual(MAX_FREE_POLYLINE_VERTICES);
  });
});
