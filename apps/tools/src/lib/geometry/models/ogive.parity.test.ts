import { describe, expect, it } from "vitest";
import { createOgiveGeometry } from "./ogive";
import { createArch } from "../engine/arches";
import { offsetShape } from "../engine/api";
import { parametricShapeToTraceModel } from "../adapters";
import { validateTraceModel } from "../trace-model";

/**
 * C4-LOT2-ARCHES-V1 §6/§7 — Parité avant/après migration de `ogive-equilateral` vers Engine B.
 *
 * Fixtures « golden » capturées sur l'implémentation historique (formule locale dans
 * `models/ogive.ts`, avant migration) : coordonnées attendues, figées, pour deux largeurs.
 */
type V = { x: number; y: number };

const GOLDEN: Record<"A" | "B", { width: number; A: V; B: V; S: V; radius: number; height: number }> = {
  A: { width: 1200, A: { x: 0, y: 0 }, B: { x: 1200, y: 0 }, S: { x: 600, y: 1039.2304845413264 }, radius: 1200, height: 1039.2304845413264 },
  B: { width: 2000, A: { x: 0, y: 0 }, B: { x: 2000, y: 0 }, S: { x: 1000, y: 1732.0508075688772 }, radius: 2000, height: 1732.0508075688772 },
};

describe.each(["A", "B"] as const)("parité ogive-equilateral — jeu %s", (key) => {
  const golden = GOLDEN[key];

  it("naissance et sommet reproduisent le golden au flottant près", () => {
    const model = createOgiveGeometry({ width: golden.width });
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const S = model.points.find((p) => p.id === "S")!;
    for (const [actual, expected] of [[A, golden.A], [B, golden.B], [S, golden.S]] as const) {
      expect(actual.x).toBeCloseTo(expected.x, 9);
      expect(actual.y).toBeCloseTo(expected.y, 9);
    }
  });

  it("rayon et hauteur (W√3/2) identiques au golden", () => {
    const model = createOgiveGeometry({ width: golden.width });
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(golden.radius, 9);
    expect(model.dimensions.find((d) => d.id === "dim-height")?.value).toBeCloseTo(golden.height, 6);
    expect(model.dimensions.find((d) => d.id === "dim-height")?.value).toBeCloseTo(golden.width * (Math.sqrt(3) / 2), 6);
  });

  it("centres : un arc centré exactement en A, l'autre exactement en B", () => {
    const model = createOgiveGeometry({ width: golden.width });
    const centres = model.arcs.map((a) => a.centre);
    const nearA = centres.some((c) => Math.hypot(c.x - golden.A.x, c.y - golden.A.y) < 1e-6);
    const nearB = centres.some((c) => Math.hypot(c.x - golden.B.x, c.y - golden.B.y) < 1e-6);
    expect(nearA).toBe(true);
    expect(nearB).toBe(true);
  });

  it("symétrie : les deux arcs sont l'image miroir l'un de l'autre par rapport à l'axe médian", () => {
    const model = createOgiveGeometry({ width: golden.width });
    const mid = golden.width / 2;
    const [arc1, arc2] = model.arcs;
    expect(Math.abs(arc1.centre.x - mid)).toBeCloseTo(Math.abs(arc2.centre.x - mid), 6);
    expect(arc1.radius).toBeCloseTo(arc2.radius, 9);
  });

  it("bounds : naissance, sommet et les deux cercles complets sont entièrement inclus", () => {
    const model = createOgiveGeometry({ width: golden.width });
    const margin = 1e-6;
    for (const p of [golden.A, golden.B, golden.S]) {
      expect(p.x).toBeGreaterThanOrEqual(model.bounds.minX - margin);
      expect(p.x).toBeLessThanOrEqual(model.bounds.maxX + margin);
      expect(p.y).toBeGreaterThanOrEqual(model.bounds.minY - margin);
      expect(p.y).toBeLessThanOrEqual(model.bounds.maxY + margin);
    }
    for (const c of model.circles) {
      expect(c.centre.x - c.radius).toBeGreaterThanOrEqual(model.bounds.minX - margin);
      expect(c.centre.x + c.radius).toBeLessThanOrEqual(model.bounds.maxX + margin);
      expect(c.centre.y - c.radius).toBeGreaterThanOrEqual(model.bounds.minY - margin);
      expect(c.centre.y + c.radius).toBeLessThanOrEqual(model.bounds.maxY + margin);
    }
  });
});

describe("C4-LOT2-ARCHES-V1 §11 — compatibilité offset de l'ogive Engine B", () => {
  it("arch(lancet, equilateral) → offsetShape → parametricShapeToTraceModel → validateTraceModel", () => {
    const shape = createArch({ type: "lancet", width: 1200, pointedness: "equilateral" });
    const offset = offsetShape(shape, -25); // -25 mm = double arc repoussé vers l'extérieur
    const model = parametricShapeToTraceModel(offset, {
      name: "Ogive offset", slug: "ogive-equilateral-offset", categoryId: "tracing",
      difficulty: "intermediate", tags: [], status: "preview", parameters: [],
    });
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.arcs.some((a) => Math.abs(a.radius - 1175) < 1e-6)).toBe(true); // 1200 + (-25)
    // LIMITATION connue : offsetShape ne décale que les primitives, pas la géométrie embarquée
    // dans constructionSteps (steps arc-gauche/arc-droit) ; l'adaptateur matérialise donc des
    // arcs de construction pré-offset en doublon.
    expect(model.arcs.length).toBeGreaterThanOrEqual(2);
  });
});
