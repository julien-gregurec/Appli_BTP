import { describe, expect, it } from "vitest";
import { createArchFullRoundGeometry } from "./arch-full-round";
import { createArch } from "../engine/arches";
import { offsetShape } from "../engine/api";
import { parametricShapeToTraceModel } from "../adapters";
import { validateTraceModel } from "../trace-model";

/**
 * C4-LOT2-ARCHES-V1 §6/§7 — Parité avant/après migration de `arch-full-round` vers Engine B.
 *
 * Fixtures « golden » capturées sur l'implémentation historique (`shapes.ts::createAdvancedArch`,
 * mode "semicircle", avant migration) : coordonnées attendues, figées, pour deux largeurs.
 */
type V = { x: number; y: number };

const GOLDEN: Record<"A" | "B", { width: number; O: V; A: V; B: V; S: V; radius: number; rise: number }> = {
  A: { width: 1200, O: { x: 600, y: 0 }, A: { x: 0, y: 0 }, B: { x: 1200, y: 0 }, S: { x: 600, y: 600 }, radius: 600, rise: 600 },
  B: { width: 2400, O: { x: 1200, y: 0 }, A: { x: 0, y: 0 }, B: { x: 2400, y: 0 }, S: { x: 1200, y: 1200 }, radius: 1200, rise: 1200 },
};

describe.each(["A", "B"] as const)("parité arch-full-round — jeu %s", (key) => {
  const golden = GOLDEN[key];

  it("centre, naissance et sommet reproduisent le golden au flottant près", () => {
    const model = createArchFullRoundGeometry({ width: golden.width });
    const O = model.points.find((p) => p.id === "O")!;
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const S = model.points.find((p) => p.id === "S")!;
    for (const [actual, expected] of [[O, golden.O], [A, golden.A], [B, golden.B], [S, golden.S]] as const) {
      expect(actual.x).toBeCloseTo(expected.x, 9);
      expect(actual.y).toBeCloseTo(expected.y, 9);
    }
  });

  it("rayon identique au golden", () => {
    const model = createArchFullRoundGeometry({ width: golden.width });
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(golden.radius, 9);
    expect(model.arcs[0].radius).toBeCloseTo(golden.radius, 9);
  });

  it("arc final : mêmes extrémités (A et B) que le golden", () => {
    const model = createArchFullRoundGeometry({ width: golden.width });
    const arc = model.arcs[0];
    const endpoint = (angle: number) => ({ x: arc.centre.x + arc.radius * Math.cos(angle), y: arc.centre.y + arc.radius * Math.sin(angle) });
    const p1 = endpoint(arc.startAngle);
    const p2 = endpoint(arc.endAngle);
    const matches = (p: V, expected: V) => Math.abs(p.x - expected.x) < 1e-6 && Math.abs(p.y - expected.y) < 1e-6;
    const coversAB = (matches(p1, golden.A) && matches(p2, golden.B)) || (matches(p1, golden.B) && matches(p2, golden.A));
    expect(coversAB).toBe(true);
  });

  it("bounds : le sommet et les naissances sont entièrement inclus (aucune troncature)", () => {
    const model = createArchFullRoundGeometry({ width: golden.width });
    const margin = 1e-6;
    for (const p of [golden.O, golden.A, golden.B, golden.S]) {
      expect(p.x).toBeGreaterThanOrEqual(model.bounds.minX - margin);
      expect(p.x).toBeLessThanOrEqual(model.bounds.maxX + margin);
      expect(p.y).toBeGreaterThanOrEqual(model.bounds.minY - margin);
      expect(p.y).toBeLessThanOrEqual(model.bounds.maxY + margin);
    }
    // L'arc entier (haut du demi-cercle) doit aussi être couvert, pas seulement les 4 points nommés.
    expect(golden.O.y + golden.radius).toBeLessThanOrEqual(model.bounds.maxY + margin);
  });
});

describe("C4-LOT2-ARCHES-V1 §11 — compatibilité offset de l'arche Engine B", () => {
  it("arch(semicircular) → offsetShape → parametricShapeToTraceModel → validateTraceModel", () => {
    const shape = createArch({ type: "semicircular", width: 1200 });
    const offset = offsetShape(shape, -30); // -30 mm = arc repoussé vers l'extérieur
    const model = parametricShapeToTraceModel(offset, {
      name: "Arche offset", slug: "arch-full-round-offset", categoryId: "tracing",
      difficulty: "easy", tags: [], status: "preview", parameters: [],
    });
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.arcs.some((a) => Math.abs(a.radius - 570) < 1e-6)).toBe(true); // 600 + (-30)
    // LIMITATION connue (déjà documentée pour star-5/heart en C3/C4-LOT1) : offsetShape ne décale
    // que les primitives, pas la géométrie embarquée dans constructionSteps ; l'adaptateur
    // matérialise donc un arc de construction pré-offset en doublon (step-trace).
    expect(model.arcs.length).toBeGreaterThanOrEqual(1);
  });
});
