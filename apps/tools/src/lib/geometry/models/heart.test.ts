import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createHeartGeometry } from "./heart";

describe("createHeartGeometry — FUNDAMENTAL-MODELS-V1 §14", () => {
  it("symétrie par rapport à l'axe vertical : les deux centres sont à ±R de l'axe, même distance à la pointe", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    const c1 = model.points.find((p) => p.id === "C1")!;
    const c2 = model.points.find((p) => p.id === "C2")!;
    const tip = model.points.find((p) => p.id === "P")!;
    expect(c1.x).toBeCloseTo(-c2.x, 8);
    expect(c1.y).toBeCloseTo(c2.y, 8);
    expect(distance(c1, tip)).toBeCloseTo(distance(c2, tip), 8);
  });

  it("largeur correcte : R = width/4, span total des deux cercles = width", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    expect(model.quantities.find((q) => q.id === "q-radius")?.value).toBeCloseTo(300, 8);
    expect(model.dimensions.find((d) => d.id === "dim-width")?.value).toBeCloseTo(1200, 8);
  });

  it("hauteur correcte : distance du sommet des bulbes à la pointe = height", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    expect(model.dimensions.find((d) => d.id === "dim-height")?.value).toBeCloseTo(1400, 8);
  });

  it("arcs raccordés correctement : chaque arc part de sa tangente et arrive exactement au creux", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    const notch = model.points.find((p) => p.id === "N")!;
    const arcLeft = model.arcs.find((a) => a.id === "arc-left")!;
    const arcRight = model.arcs.find((a) => a.id === "arc-right")!;
    const endpointLeft = { x: arcLeft.centre.x + arcLeft.radius * Math.cos(arcLeft.startAngle), y: arcLeft.centre.y + arcLeft.radius * Math.sin(arcLeft.startAngle) };
    const endpointRight = { x: arcRight.centre.x + arcRight.radius * Math.cos(arcRight.endAngle), y: arcRight.centre.y + arcRight.radius * Math.sin(arcRight.endAngle) };
    const notchFromLeft = { x: arcLeft.centre.x + arcLeft.radius * Math.cos(arcLeft.endAngle), y: arcLeft.centre.y + arcLeft.radius * Math.sin(arcLeft.endAngle) };
    const notchFromRight = { x: arcRight.centre.x + arcRight.radius * Math.cos(arcRight.startAngle), y: arcRight.centre.y + arcRight.radius * Math.sin(arcRight.startAngle) };
    expect(notchFromLeft.x).toBeCloseTo(notch.x, 6);
    expect(notchFromLeft.y).toBeCloseTo(notch.y, 6);
    expect(notchFromRight.x).toBeCloseTo(notch.x, 6);
    expect(notchFromRight.y).toBeCloseTo(notch.y, 6);
    expect(Number.isFinite(endpointLeft.x) && Number.isFinite(endpointRight.x)).toBe(true);
  });

  it("invariant propre à la construction : la longueur de tangente vaut sqrt(d² - R²) (théorème de la tangente)", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    const centreRight = model.points.find((p) => p.id === "C2")!;
    const tip = model.points.find((p) => p.id === "P")!;
    const radius = model.quantities.find((q) => q.id === "q-radius")!.value;
    const d = distance(tip, centreRight);
    const expectedTangentLength = Math.sqrt(d ** 2 - radius ** 2);
    expect(model.quantities.find((q) => q.id === "q-tangent-length")?.value).toBeCloseTo(expectedTangentLength, 6);
  });

  it("les deux cercles sont exactement tangents (distance entre centres = 2R)", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    const c1 = model.points.find((p) => p.id === "C1")!;
    const c2 = model.points.find((p) => p.id === "C2")!;
    const radius = model.quantities.find((q) => q.id === "q-radius")!.value;
    expect(distance(c1, c2)).toBeCloseTo(2 * radius, 8);
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createHeartGeometry({ width: 1200, height: 1400 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("paramètres dynamiques : changer width/height recalcule tout", () => {
    const a = createHeartGeometry({ width: 1200, height: 1400 });
    const b = createHeartGeometry({ width: 2400, height: 2800 });
    expect(b.quantities.find((q) => q.id === "q-radius")?.value).toBeCloseTo((a.quantities.find((q) => q.id === "q-radius")?.value ?? 0) * 2, 8);
  });

  it("refuse une largeur ou une hauteur invalide", () => {
    expect(() => createHeartGeometry({ width: 0, height: 1400 })).toThrow();
    expect(() => createHeartGeometry({ width: 1200, height: 0 })).toThrow();
    expect(() => createHeartGeometry({ width: 1200, height: Number.NaN })).toThrow();
  });

  it("refuse un rapport largeur/hauteur invalide (pointe qui rentrerait dans les cercles)", () => {
    expect(() => createHeartGeometry({ width: 1200, height: 200 })).toThrow();
  });
});
