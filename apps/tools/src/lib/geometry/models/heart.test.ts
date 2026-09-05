import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createHeartGeometry } from "./heart";

// C4-LOT1-V1 : mêmes invariants qu'en FUNDAMENTAL-MODELS-V1 §14, contrôlés sur la sortie
// désormais produite via Engine B (`createHeart`) puis le pont `parametricShapeToTraceModel`.
// Schéma d'identifiants Engine B : centres "leftLobe"/"rightLobe", pointe "cusp" — pas de point
// nommé pour les tangentes (extrémités de `model.segments`, identifiées ici par signe de x).
function tangentSegments(model: ReturnType<typeof createHeartGeometry>) {
  const cusp = model.points.find((p) => p.id === "cusp")!;
  const withEndpoint = (seg: (typeof model.segments)[number]) => (Math.abs(seg.start.x - cusp.x) < 1e-9 && Math.abs(seg.start.y - cusp.y) < 1e-9 ? seg.end : seg.start);
  const left = model.segments.find((s) => withEndpoint(s).x < 0)!;
  const right = model.segments.find((s) => withEndpoint(s).x > 0)!;
  return { left, right, leftTangent: withEndpoint(left), rightTangent: withEndpoint(right) };
}

describe("createHeartGeometry — C4-LOT1 (Engine B)", () => {
  it("symétrie par rapport à l'axe vertical : les deux centres sont à ±R de l'axe, même distance à la pointe", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    const c1 = model.points.find((p) => p.id === "leftLobe")!;
    const c2 = model.points.find((p) => p.id === "rightLobe")!;
    const tip = model.points.find((p) => p.id === "cusp")!;
    expect(c1.x).toBeCloseTo(-c2.x, 8);
    expect(c1.y).toBeCloseTo(c2.y, 8);
    expect(distance(c1, tip)).toBeCloseTo(distance(c2, tip), 8);
  });

  it("largeur correcte : R = width/4, span des deux cercles = width", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(300, 8);
    expect(model.dimensions.find((d) => d.id === "dim-width")?.value).toBeCloseTo(1200, 8);
  });

  it("hauteur correcte : distance du sommet des bulbes à la pointe = height", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    expect(model.dimensions.find((d) => d.id === "dim-height")?.value).toBeCloseTo(1400, 8);
  });

  it("arcs raccordés correctement : chaque arc part de sa tangente et arrive exactement au creux (0,0)", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    const arcLeft = model.arcs.find((a) => a.centre.x < 0)!;
    const arcRight = model.arcs.find((a) => a.centre.x > 0)!;
    const pointOnArc = (arc: typeof arcLeft, angle: number) => ({ x: arc.centre.x + arc.radius * Math.cos(angle), y: arc.centre.y + arc.radius * Math.sin(angle) });
    const notchFromLeft = pointOnArc(arcLeft, arcLeft.startAngle);
    const notchFromRight = pointOnArc(arcRight, arcRight.endAngle);
    expect(notchFromLeft.x).toBeCloseTo(0, 6);
    expect(notchFromLeft.y).toBeCloseTo(0, 6);
    expect(notchFromRight.x).toBeCloseTo(0, 6);
    expect(notchFromRight.y).toBeCloseTo(0, 6);
  });

  it("invariant propre à la construction : la longueur de tangente vaut sqrt(d² - R²) (théorème de la tangente)", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    const centreRight = model.points.find((p) => p.id === "rightLobe")!;
    const tip = model.points.find((p) => p.id === "cusp")!;
    const radius = model.dimensions.find((d) => d.id === "dim-radius")!.value;
    const d = distance(tip, centreRight);
    const expectedTangentLength = Math.sqrt(d ** 2 - radius ** 2);
    const { right, rightTangent } = tangentSegments(model);
    expect(right).toBeDefined();
    expect(distance(tip, rightTangent)).toBeCloseTo(expectedTangentLength, 6);
  });

  it("les deux cercles sont exactement tangents (distance entre centres = 2R)", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    const c1 = model.points.find((p) => p.id === "leftLobe")!;
    const c2 = model.points.find((p) => p.id === "rightLobe")!;
    const radius = model.dimensions.find((d) => d.id === "dim-radius")!.value;
    expect(distance(c1, c2)).toBeCloseTo(2 * radius, 8);
  });

  it("rôles : lobes en construction, axe dans les axes, arcs/tangentes dans le tracé final", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    expect(model.circles).toHaveLength(2);
    expect(model.circles.every((c) => c.role === "construction")).toBe(true);
    expect(model.constructionLines.some((l) => l.role === "axis")).toBe(true);
    expect(model.arcs).toHaveLength(2);
    expect(model.segments).toHaveLength(2);
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("paramètres dynamiques : changer width/height recalcule tout", () => {
    const a = createHeartGeometry({ width: 1200, height: 1400 });
    const b = createHeartGeometry({ width: 2400, height: 2800 });
    expect(b.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo((a.dimensions.find((d) => d.id === "dim-radius")?.value ?? 0) * 2, 8);
  });

  it("refuse une largeur ou une hauteur invalide", () => {
    expect(() => createHeartGeometry({ width: 0, height: 1400 })).toThrow();
    expect(() => createHeartGeometry({ width: 1200, height: 0 })).toThrow();
    expect(() => createHeartGeometry({ width: 1200, height: Number.NaN })).toThrow();
  });

  it("refuse un rapport largeur/hauteur invalide (pointe qui rentrerait dans les cercles)", () => {
    expect(() => createHeartGeometry({ width: 1200, height: 200 })).toThrow();
  });

  it("explication réellement renseignée", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    expect(model.explanation?.objective).toBeTruthy();
    expect(model.explanation?.steps?.length).toBeGreaterThan(0);
  });
});
