import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createSpiralGeometry } from "./spiral";

function polyline(model: ReturnType<typeof createSpiralGeometry>) {
  const curve = model.polylines?.[0];
  if (!curve) throw new Error("polyligne de la spirale introuvable");
  return curve.points;
}

function centre(model: ReturnType<typeof createSpiralGeometry>) {
  const O = model.points.find((p) => p.id === "O");
  if (!O) throw new Error("centre O introuvable");
  return O;
}

describe("createSpiralGeometry — FUNDAMENTAL-MODELS-V1 §18 / C4-LOT4-CURVES-V1", () => {
  it("rayon initial : le premier point est à startRadius du centre", () => {
    const model = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 3 });
    const O = centre(model);
    const points = polyline(model);
    expect(distance(O, points[0])).toBeCloseTo(50, 6);
  });

  it("rayon final : le dernier point est à endRadius du centre", () => {
    const model = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 3 });
    const O = centre(model);
    const points = polyline(model);
    expect(distance(O, points[points.length - 1])).toBeCloseTo(1000, 6);
  });

  it("nombre de tours : nombre de points cohérent avec 2 tours (au moins quelques échantillons par tour)", () => {
    const model = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 2 });
    const points = polyline(model);
    expect(points.length).toBeGreaterThan(32);
  });

  it("monotonie du rayon : chaque point est au moins aussi loin du centre que le précédent", () => {
    const model = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 3 });
    const O = centre(model);
    const points = polyline(model);
    let previousDistance = -Infinity;
    for (const item of points) {
      const currentDistance = distance(O, item);
      expect(currentDistance).toBeGreaterThanOrEqual(previousDistance - 1e-9);
      previousDistance = currentDistance;
    }
  });

  it("nombre raisonnable de points : plafonné, pas de croissance illimitée avec un grand nombre de tours", () => {
    const few = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 1 });
    const many = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 12 });
    expect(polyline(few).length).toBeLessThan(200);
    expect(polyline(many).length).toBeLessThanOrEqual(481);
  });

  it("aucune coordonnée invalide", () => {
    const model = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 3 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("recalcul dynamique : d'autres paramètres changent le tracé", () => {
    const a = createSpiralGeometry({ startRadius: 0, endRadius: 500, turns: 2 });
    const b = createSpiralGeometry({ startRadius: 100, endRadius: 2000, turns: 4 });
    expect(a.dimensions.find((d) => d.id === "dim-end-radius")?.value).toBeCloseTo(500, 8);
    expect(b.dimensions.find((d) => d.id === "dim-end-radius")?.value).toBeCloseTo(2000, 8);
  });

  it("accepte un rayon de départ nul (spirale partant du centre)", () => {
    const model = createSpiralGeometry({ startRadius: 0, endRadius: 500, turns: 2 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
    const O = centre(model);
    const points = polyline(model);
    expect(distance(O, points[0])).toBeCloseTo(0, 6);
  });

  it("refuse turns <= 0", () => {
    expect(() => createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 0 })).toThrow();
    expect(() => createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: -1 })).toThrow();
  });

  it("refuse endRadius < startRadius (convention : spirale strictement croissante)", () => {
    expect(() => createSpiralGeometry({ startRadius: 1000, endRadius: 500, turns: 2 })).toThrow();
  });

  it("refuse des valeurs non finies", () => {
    expect(() => createSpiralGeometry({ startRadius: Number.NaN, endRadius: 1000, turns: 2 })).toThrow();
    expect(() => createSpiralGeometry({ startRadius: 50, endRadius: Number.POSITIVE_INFINITY, turns: 2 })).toThrow();
  });

  it("refuse un rayon de départ négatif", () => {
    expect(() => createSpiralGeometry({ startRadius: -10, endRadius: 1000, turns: 2 })).toThrow();
  });

  it("les cotes de rayon proviennent d'engine/dimensions, jamais recalculées à la main", () => {
    const model = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 3 });
    expect(model.dimensions.find((d) => d.id === "dim-start-radius")?.value).toBeCloseTo(50, 9);
    expect(model.dimensions.find((d) => d.id === "dim-end-radius")?.value).toBeCloseTo(1000, 9);
  });

  it("les étapes de construction viennent d'Engine B (5 étapes titrées)", () => {
    const model = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 3 });
    expect(model.steps).toHaveLength(5);
    expect(model.steps.every((s) => s.title && s.title !== s.instruction)).toBe(true);
  });
});
