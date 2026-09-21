import { describe, expect, it } from "vitest";
import { createHeartGeometry } from "./heart";
import { createHeart } from "../engine/hearts";
import { offsetShape } from "../engine/api";
import { parametricShapeToTraceModel } from "../adapters";
import { validateTraceModel } from "../trace-model";

/**
 * C4-LOT1-V1 §5 — Parité avant/après migration de `heart` vers Engine B.
 *
 * Fixtures « golden » capturées sur l'implémentation historique (formule locale dans
 * `models/heart.ts`, avant migration). Le schéma d'identifiants change (C1/C2/N/P/T-left/T-right
 * -> leftLobe/rightLobe/cusp + tangentes anonymes) : la comparaison se fait donc par géométrie
 * (centres, rayons, points d'ancrage), jamais par id.
 */
type V = { x: number; y: number };

const GOLDEN: Record<"A" | "B", { input: { width: number; height: number }; leftCentre: V; rightCentre: V; tip: V; radius: number; leftTangent: V; rightTangent: V }> = {
  A: {
    input: { width: 1200, height: 1400 },
    leftCentre: { x: -300, y: 0 },
    rightCentre: { x: 300, y: 0 },
    tip: { x: 0, y: -1100 },
    radius: 300,
    leftTangent: { x: -558.4615384615385, y: -152.3076923076923 },
    rightTangent: { x: 558.4615384615385, y: -152.30769230769232 },
  },
  B: {
    input: { width: 2000, height: 1800 },
    leftCentre: { x: -500, y: 0 },
    rightCentre: { x: 500, y: 0 },
    tip: { x: 0, y: -1300 },
    radius: 500,
    leftTangent: { x: -871.1340206185566, y: -335.05154639175254 },
    rightTangent: { x: 871.1340206185566, y: -335.0515463917526 },
  },
};

describe.each(["A", "B"] as const)("parité heart — jeu %s", (key) => {
  const golden = GOLDEN[key];

  it("centres des lobes, pointe et rayon identiques au golden", () => {
    const model = createHeartGeometry(golden.input);
    const c1 = model.points.find((p) => p.id === "leftLobe")!;
    const c2 = model.points.find((p) => p.id === "rightLobe")!;
    const tip = model.points.find((p) => p.id === "cusp")!;
    expect(c1.x).toBeCloseTo(golden.leftCentre.x, 9);
    expect(c1.y).toBeCloseTo(golden.leftCentre.y, 9);
    expect(c2.x).toBeCloseTo(golden.rightCentre.x, 9);
    expect(c2.y).toBeCloseTo(golden.rightCentre.y, 9);
    expect(tip.x).toBeCloseTo(golden.tip.x, 9);
    expect(tip.y).toBeCloseTo(golden.tip.y, 9);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(golden.radius, 9);
  });

  it("points de tangence identiques au golden (extrémités des segments finaux)", () => {
    const model = createHeartGeometry(golden.input);
    const cusp = model.points.find((p) => p.id === "cusp")!;
    const other = (s: (typeof model.segments)[number]) => (Math.hypot(s.start.x - cusp.x, s.start.y - cusp.y) < 1e-6 ? s.end : s.start);
    const left = model.segments.map(other).find((p) => p.x < 0)!;
    const right = model.segments.map(other).find((p) => p.x > 0)!;
    expect(left.x).toBeCloseTo(golden.leftTangent.x, 6);
    expect(left.y).toBeCloseTo(golden.leftTangent.y, 6);
    expect(right.x).toBeCloseTo(golden.rightTangent.x, 6);
    expect(right.y).toBeCloseTo(golden.rightTangent.y, 6);
  });

  it("bounds : l'enveloppe réelle de la géométrie (lobes + pointe) contient tout le tracé", () => {
    const model = createHeartGeometry(golden.input);
    const margin = 1e-3;
    const check = (p: V) => {
      expect(p.x).toBeGreaterThanOrEqual(model.bounds.minX - margin);
      expect(p.x).toBeLessThanOrEqual(model.bounds.maxX + margin);
      expect(p.y).toBeGreaterThanOrEqual(model.bounds.minY - margin);
      expect(p.y).toBeLessThanOrEqual(model.bounds.maxY + margin);
    };
    check({ x: golden.leftCentre.x - golden.radius, y: golden.leftCentre.y - golden.radius });
    check({ x: golden.rightCentre.x + golden.radius, y: golden.rightCentre.y + golden.radius });
    check(golden.tip);
  });
});

describe("C4-LOT1-V1 §9 — compatibilité offset du cœur Engine B", () => {
  it("createHeart → offsetShape → parametricShapeToTraceModel → validateTraceModel", () => {
    const shape = createHeart({ width: 1200, height: 1400 });
    const offset = offsetShape(shape, 20);
    const model = parametricShapeToTraceModel(offset, {
      name: "Cœur offset", slug: "heart-offset", categoryId: "forms-design",
      difficulty: "intermediate", tags: [], status: "preview", parameters: [],
    });
    // Le contour décalé se convertit en TraceModel structurellement valide.
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.arcs.some((a) => Math.abs(a.radius - 320) < 1e-6)).toBe(true); // lobe R=300 + 20
    expect(model.segments.length).toBeGreaterThanOrEqual(2);
    // LIMITATION connue (déjà documentée pour star-5 en C3, §28) : offsetShape ne décale que les
    // primitives, pas la géométrie embarquée dans constructionSteps ; l'adaptateur matérialise
    // donc des arcs de construction pré-offset en doublon (ici : 2 arcs décalés + 2 arcs
    // matérialisés depuis l'étape "step-sides" au rayon d'origine).
    expect(model.arcs.length).toBeGreaterThanOrEqual(2);
  });
});
