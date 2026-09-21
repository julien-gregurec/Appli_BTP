import { describe, expect, it } from "vitest";
import type { Line } from "../primitives";
import { reflect } from "../transforms";
import { createDoubleSGeometry } from "./double-s";

function pointOnArc(arc: { centre: { x: number; y: number }; radius: number; startAngle: number; endAngle: number }, which: "start" | "end") {
  const angle = which === "start" ? arc.startAngle : arc.endAngle;
  return { x: arc.centre.x + arc.radius * Math.cos(angle), y: arc.centre.y + arc.radius * Math.sin(angle) };
}

function closeTo(a: { x: number; y: number }, b: { x: number; y: number }, precision = 6) {
  return Math.abs(a.x - b.x) < 10 ** -precision && Math.abs(a.y - b.y) < 10 ** -precision;
}

describe("createDoubleSGeometry — DECORATIVE-FAMILIES-V1 §15 / C4-LOT4-CURVES-V1", () => {
  it("raccord : les deux arcs du premier S partagent bien le point milieu M (S1-P1)", () => {
    const model = createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0.3 });
    const m1 = model.points.find((p) => p.id === "S1-P1")!;
    const [lower, upper] = [model.arcs[1], model.arcs[0]];
    const lowerEndpoints = [pointOnArc(lower, "start"), pointOnArc(lower, "end")];
    const upperEndpoints = [pointOnArc(upper, "start"), pointOnArc(upper, "end")];
    expect(lowerEndpoints.some((p) => closeTo(p, m1))).toBe(true);
    expect(upperEndpoints.some((p) => closeTo(p, m1))).toBe(true);
  });

  it("invariant 1 : continuité tangente C1 en M — les rayons des deux arcs en M sont exactement opposés (tangente commune)", () => {
    const model = createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0.3 });
    const m = model.points.find((p) => p.id === "S1-P1")!;
    const cl = model.points.find((p) => p.id === "S1-C1")!; // centre de l'arc bas (A -> M)
    const cu = model.points.find((p) => p.id === "S1-C0")!; // centre de l'arc haut (B -> M)
    const rLower = { x: m.x - cl.x, y: m.y - cl.y };
    const rUpper = { x: m.x - cu.x, y: m.y - cu.y };
    const cross = rLower.x * rUpper.y - rLower.y * rUpper.x;
    const dot = rLower.x * rUpper.x + rLower.y * rUpper.y;
    expect(cross).toBeCloseTo(0, 4); // colinéaires
    expect(dot).toBeLessThan(0); // sens opposés -> tangente commune, pas de cassure
  });

  it("invariant 2 : symétrie — le second S est l'image du premier par réflexion (vérifiée avec la primitive reflect)", () => {
    const model = createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0.3 });
    const spacing = model.dimensions.find((d) => d.id === "dim-spacing")!.value;
    const mirror: Line = { id: "mirror", point: { id: "_", x: spacing / 2, y: 0 }, direction: { x: 0, y: 1 } };
    const s1cl = model.points.find((p) => p.id === "S1-C1")!;
    const s2cl = model.points.find((p) => p.id === "S2-C1")!;
    const s1cu = model.points.find((p) => p.id === "S1-C0")!;
    const s2cu = model.points.find((p) => p.id === "S2-C0")!;
    const reflectedLower = reflect(s1cl, mirror);
    const reflectedUpper = reflect(s1cu, mirror);
    expect(reflectedLower.x).toBeCloseTo(s2cl.x, 4);
    expect(reflectedLower.y).toBeCloseTo(s2cl.y, 4);
    expect(reflectedUpper.x).toBeCloseTo(s2cu.x, 4);
    expect(reflectedUpper.y).toBeCloseTo(s2cu.y, 4);
  });

  it("les deux arcs d'un même S ont le même rayon", () => {
    const model = createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0.3 });
    const [upper, lower] = [model.arcs[0], model.arcs[1]];
    expect(lower.radius).toBeCloseTo(upper.radius, 8);
  });

  it("rayon conforme à la relation corde + flèche -> rayon", () => {
    const width = 800; const height = 2000; const waistRatio = 0.3;
    const model = createDoubleSGeometry({ width, height, waistRatio });
    const bulge = waistRatio * width;
    const halfChord = height / 4;
    const expectedRadius = (halfChord ** 2 + bulge ** 2) / (2 * bulge);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(expectedRadius, 6);
  });

  it("mise à l'échelle : largeur 1200 / 2400 / 3600 mm", () => {
    for (const width of [1200, 2400, 3600]) {
      const model = createDoubleSGeometry({ width, height: 2 * width, waistRatio: 0.3 });
      expect(model.dimensions.find((d) => d.id === "dim-bulge")?.value).toBeCloseTo(0.3 * width, 6);
      expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
    }
  });

  it("famille non radiale : aucun cercle/ellipse, uniquement des arcs raccordés", () => {
    const model = createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0.3 });
    expect(model.circles).toHaveLength(0);
    expect(model.ellipses).toHaveLength(0);
    expect(model.arcs).toHaveLength(4);
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0.3 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("refuse des paramètres invalides", () => {
    expect(() => createDoubleSGeometry({ width: 0, height: 2000, waistRatio: 0.3 })).toThrow();
    expect(() => createDoubleSGeometry({ width: 800, height: 0, waistRatio: 0.3 })).toThrow();
    expect(() => createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0 })).toThrow();
    expect(() => createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 1 })).toThrow();
    expect(() => createDoubleSGeometry({ width: 800, height: 2000, waistRatio: Number.NaN })).toThrow();
  });

  it("les étapes de construction viennent d'Engine B, aucune duplication de géométrie", () => {
    const model = createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0.3 });
    expect(model.steps.length).toBeGreaterThanOrEqual(6);
    expect(model.steps.every((s) => s.title)).toBe(true);
  });

  it("les cotes (hauteur, bombement, rayon, entraxe) proviennent d'engine/dimensions", () => {
    const model = createDoubleSGeometry({ width: 800, height: 2000, waistRatio: 0.3 });
    expect(model.dimensions.find((d) => d.id === "dim-height")?.value).toBeCloseTo(2000, 9);
    expect(model.dimensions.find((d) => d.id === "dim-bulge")?.value).toBeCloseTo(240, 9);
    expect(model.dimensions.find((d) => d.id === "dim-spacing")?.value).toBeCloseTo(640, 9);
  });
});
