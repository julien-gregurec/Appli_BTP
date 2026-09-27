import { describe, expect, it } from "vitest";
import { polygonArea } from "./area";
import { alignmentGuides, constrainToAngleStep } from "./guides";
import { offsetPolygonEdges } from "./offset";
import { findEnclosedFaces, interiorPoint, pointInPolygon, polygonCentroid } from "./planar-faces";
import type { Point2D, Segment2D } from "./types";

const seg = (ax: number, ay: number, bx: number, by: number): Segment2D => ({ start: { x: ax, y: ay }, end: { x: bx, y: by } });
const rect = (x0: number, y0: number, x1: number, y1: number): Segment2D[] => [
  seg(x0, y0, x1, y0), seg(x1, y0, x1, y1), seg(x1, y1, x0, y1), seg(x0, y1, x0, y0),
];

describe("findEnclosedFaces", () => {
  it("un rectangle fermé donne une face, orientée en sens trigonométrique", () => {
    const faces = findEnclosedFaces(rect(0, 0, 4000, 3000));
    expect(faces).toHaveLength(1);
    expect(faces[0].area).toBeCloseTo(12_000_000);
    expect(faces[0].segmentIndices.sort()).toEqual([0, 1, 2, 3]);
  });

  it("un contour ouvert ne donne aucune face", () => {
    expect(findEnclosedFaces(rect(0, 0, 4000, 3000).slice(0, 3))).toHaveLength(0);
  });

  it("une cloison intérieure en T coupe la pièce en deux faces", () => {
    const faces = findEnclosedFaces([...rect(0, 0, 6000, 3000), seg(2000, 0, 2000, 3000)]);
    expect(faces.map((f) => Math.round(f.area))).toEqual([12_000_000, 6_000_000]);
  });

  it("des murs qui se croisent sont coupés à leur intersection", () => {
    const faces = findEnclosedFaces([seg(-100, 0, 4100, 0), seg(4000, -100, 4000, 3100), seg(4100, 3000, -100, 3000), seg(0, 3100, 0, -100)]);
    expect(faces).toHaveLength(1);
    expect(faces[0].area).toBeCloseTo(12_000_000);
  });

  it("un coin presque fermé (0,3 mm) est fermé à la tolérance de 0,5 mm", () => {
    const segments = rect(0, 0, 4000, 3000);
    segments[3] = seg(0, 3000, 0.3, 0.2);
    expect(findEnclosedFaces(segments, { tolerance: 0.5 })).toHaveLength(1);
    expect(findEnclosedFaces(segments, { tolerance: 0.01 })).toHaveLength(0);
  });

  it("les arêtes pendantes sont ignorées", () => {
    const faces = findEnclosedFaces([...rect(0, 0, 4000, 3000), seg(4000, 1500, 6000, 1500)]);
    expect(faces).toHaveLength(1);
  });

  it("une grille 10 × 10 donne 100 faces en un temps raisonnable", () => {
    const segments: Segment2D[] = [];
    for (let i = 0; i <= 10; i++) { segments.push(seg(0, i * 1000, 10_000, i * 1000)); segments.push(seg(i * 1000, 0, i * 1000, 10_000)); }
    const started = performance.now();
    const faces = findEnclosedFaces(segments);
    expect(faces).toHaveLength(100);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("points de polygone", () => {
  const l: Point2D[] = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 4000 }, { x: 0, y: 4000 }];
  it("pointInPolygon", () => {
    expect(pointInPolygon({ x: 500, y: 500 }, { points: l })).toBe(true);
    expect(pointInPolygon({ x: 3000, y: 3000 }, { points: l })).toBe(false);
  });
  it("polygonCentroid d'un rectangle", () => {
    expect(polygonCentroid({ points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }] })).toEqual({ x: 2, y: 1 });
  });
  it("interiorPoint reste dans un L même si le centroïde en sort", () => {
    const thin: Point2D[] = [{ x: 0, y: 0 }, { x: 10_000, y: 0 }, { x: 10_000, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 10_000 }, { x: 0, y: 10_000 }];
    expect(pointInPolygon(polygonCentroid({ points: thin }), { points: thin })).toBe(false);
    expect(pointInPolygon(interiorPoint({ points: thin }), { points: thin })).toBe(true);
  });
});

describe("offsetPolygonEdges", () => {
  it("décale chaque arête de sa propre distance vers l'intérieur", () => {
    const inner = offsetPolygonEdges([{ x: 0, y: 0 }, { x: 4200, y: 0 }, { x: 4200, y: 3200 }, { x: 0, y: 3200 }], [100, 100, 100, 50]);
    expect(polygonArea({ points: inner })).toBeCloseTo((4200 - 150) * 3000);
  });
  it("refuse un décalage qui retourne le contour", () => {
    expect(() => offsetPolygonEdges([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], [80, 80, 80, 80])).toThrow();
  });
});

describe("guides directionnels", () => {
  it("contraint à l'horizontale / verticale (pas de 90°)", () => {
    const guide = constrainToAngleStep({ x: 0, y: 0 }, { x: 3000, y: 40 }, 90, 5);
    expect(guide?.degrees).toBe(0);
    expect(guide?.point.x).toBeCloseTo(Math.hypot(3000, 40));
    expect(guide?.point.y).toBeCloseTo(0);
  });
  it("angles usuels : 45° par pas de 15°", () => {
    expect(constrainToAngleStep({ x: 0, y: 0 }, { x: 1000, y: 1030 }, 15, 3)?.degrees).toBe(45);
  });
  it("hors tolérance : aucun guide", () => {
    expect(constrainToAngleStep({ x: 0, y: 0 }, { x: 1000, y: 300 }, 90, 5)).toBeNull();
    expect(constrainToAngleStep({ x: 0, y: 0 }, { x: 0, y: 0 }, 90, 5)).toBeNull();
  });
  it("alignements X / Y sur des points existants", () => {
    const guides = alignmentGuides({ x: 1003, y: 2500 }, [{ x: 1000, y: 0 }, { x: 5000, y: 2498 }], 10);
    expect(guides.x?.value).toBe(1000);
    expect(guides.y?.value).toBe(2498);
    expect(alignmentGuides({ x: 0, y: 0 }, [{ x: 500, y: 500 }], 10)).toEqual({ x: null, y: null });
  });
});
