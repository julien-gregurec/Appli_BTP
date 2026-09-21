import { describe, expect, it } from "vitest";
import { point, type Arc, type Circle, type Ellipse, type Point, type Polygon, type Polyline, type Segment } from "../primitives";
import { circleArea, circularSectorArea, distance, ellipseArea, lineCircleIntersection, polygonArea, polylineLength, segmentLength } from "../engine";
import { asPoint2D, withId } from "./point-compat";

/**
 * C1 — Vérification par exécution : de vraies valeurs Engine A (avec `id`/`label`/`role`)
 * passées directement à de vraies fonctions pures Engine B, sans aucune conversion.
 * `point-compat.ts` prouve la compilation ; ce fichier prouve le résultat numérique.
 */
describe("compatibilité de types Engine A → Engine B (exécution réelle, pas seulement typecheck)", () => {
  it("Point : distance() d'Engine B accepte directement un Point d'Engine A", () => {
    const a: Point = point("A", 0, 0, "Origine", "reference");
    const b: Point = point("B", 30, 40, "Cible", "control");
    expect(distance(a, b)).toBe(50);
  });

  it("Segment : segmentLength() d'Engine B accepte directement un Segment d'Engine A", () => {
    const s: Segment = { id: "s1", start: point("A", 0, 0), end: point("B", 3, 4), role: "construction" };
    expect(segmentLength(s)).toBe(5);
  });

  it("Circle : circleArea()/intersections d'Engine B acceptent directement un Circle d'Engine A", () => {
    const c: Circle = { id: "c1", centre: point("O", 0, 0), radius: 10, role: "shape" };
    expect(circleArea(c)).toBeCloseTo(Math.PI * 100, 8);
    const result = lineCircleIntersection({ point: { x: -20, y: 0 }, direction: { x: 1, y: 0 } }, c);
    expect(result.kind).toBe("two");
  });

  it("Arc : circularSectorArea() d'Engine B accepte directement un Arc d'Engine A", () => {
    const arc: Arc = { id: "a1", centre: point("O", 0, 0), radius: 10, startAngle: 0, endAngle: Math.PI / 2, counterClockwise: true, role: "shape" };
    expect(circularSectorArea(arc)).toBeCloseTo((Math.PI * 10 ** 2) / 4, 8);
  });

  it("Ellipse : ellipseArea() d'Engine B accepte directement une Ellipse d'Engine A", () => {
    const e: Ellipse = { id: "e1", centre: point("O", 0, 0), radiusX: 10, radiusY: 5, role: "shape" };
    expect(ellipseArea(e)).toBeCloseTo(Math.PI * 10 * 5, 8);
  });

  it("Polyline : polylineLength() d'Engine B accepte une Polyline d'Engine A (toujours ouverte, closed=undefined)", () => {
    const p: Polyline = { id: "pl1", points: [point("A", 0, 0), point("B", 10, 0), point("C", 10, 10)], role: "shape" };
    expect(polylineLength(p)).toBe(20);
  });

  it("Polygon : polygonArea() d'Engine B accepte un Polygon d'Engine A (fermeture implicite identique)", () => {
    const p: Polygon = { id: "sq1", points: [point("A", 0, 0), point("B", 100, 0), point("C", 100, 100), point("D", 0, 100)], role: "shape" };
    expect(polygonArea(p)).toBe(10000);
  });

  it("withId (B → A) génère un Point exploitable par les fonctions Engine A", () => {
    const raw = { x: 12, y: 34 };
    const named = withId("X", raw, "Point X", "reference");
    expect(named).toEqual({ id: "X", x: 12, y: 34, label: "Point X", role: "reference" });
  });

  it("asPoint2D (A → B) est une identité documentée sans coût", () => {
    const a = point("A", 5, 6);
    expect(asPoint2D(a)).toBe(a);
  });
});
