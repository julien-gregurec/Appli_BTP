import { describe, expect, it } from "vitest";
import { createStarGeometry } from "./star";
import { createStar } from "../engine/stars";
import { offsetShape } from "../engine/api";
import { parametricShapeToTraceModel } from "../adapters";
import { validateTraceModel } from "../trace-model";

/**
 * C3-PILOT-V1 §11 — Parité avant/après migration de `star-5` vers Engine B.
 *
 * Les fixtures « golden » ci-dessous ont été capturées sur l'implémentation historique
 * (`createStarGeometry` pré-migration, formule locale dans `models/star.ts`). Ce ne sont pas une
 * seconde formule : ce sont les coordonnées attendues, figées, du contour final pour deux jeux
 * de paramètres. La migration est validée si la sortie Engine B les reproduit exactement.
 */
type V = { x: number; y: number };

const GOLDEN: Record<"A" | "B", { input: { outerDiameter: number; innerRatio: number; rotation: number }; polygon: V[] }> = {
  A: {
    input: { outerDiameter: 2000, innerRatio: 0.4, rotation: -90 },
    polygon: [
      { x: 6.123233995736766e-14, y: -1000 },
      { x: 235.11410091698926, y: -323.60679774997897 },
      { x: 951.0565162951535, y: -309.0169943749474 },
      { x: 380.4226065180614, y: 123.60679774997895 },
      { x: 587.7852522924732, y: 809.0169943749474 },
      { x: 2.4492935982947064e-14, y: 400 },
      { x: -587.785252292473, y: 809.0169943749474 },
      { x: -380.4226065180614, y: 123.60679774997901 },
      { x: -951.0565162951536, y: -309.0169943749473 },
      { x: -235.1141009169893, y: -323.6067977499789 },
    ],
  },
  B: {
    input: { outerDiameter: 3200, innerRatio: 0.5, rotation: 0 },
    polygon: [
      { x: 1600, y: 0 },
      { x: 647.2135954999579, y: 470.2282018339785 },
      { x: 494.4271909999159, y: 1521.6904260722456 },
      { x: -247.21359549995788, y: 760.8452130361229 },
      { x: -1294.4271909999156, y: 940.4564036679571 },
      { x: -800, y: 9.797174393178826e-14 },
      { x: -1294.4271909999159, y: -940.4564036679568 },
      { x: -247.21359549995805, y: -760.8452130361228 },
      { x: 494.4271909999156, y: -1521.6904260722458 },
      { x: 647.2135954999578, y: -470.2282018339787 },
    ],
  },
};

const tightBounds = (pts: readonly V[]) => ({
  minX: Math.min(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxX: Math.max(...pts.map((p) => p.x)),
  maxY: Math.max(...pts.map((p) => p.y)),
});

describe.each(["A", "B"] as const)("parité star-5 — jeu %s", (key) => {
  const { input, polygon: golden } = GOLDEN[key];

  it("le contour final Engine B reproduit le golden au flottant près", () => {
    const model = createStarGeometry(input);
    const pts = model.polygons![0].points;
    expect(pts).toHaveLength(golden.length);
    golden.forEach((g, i) => {
      expect(pts[i].x).toBeCloseTo(g.x, 9);
      expect(pts[i].y).toBeCloseTo(g.y, 9);
    });
  });

  it("bounds : l'étendue réelle (min/max des sommets) est identique au golden", () => {
    const model = createStarGeometry(input);
    const now = tightBounds(model.polygons![0].points);
    const then = tightBounds(golden);
    expect(now.minX).toBeCloseTo(then.minX, 9);
    expect(now.minY).toBeCloseTo(then.minY, 9);
    expect(now.maxX).toBeCloseTo(then.maxX, 9);
    expect(now.maxY).toBeCloseTo(then.maxY, 9);
  });

  it("nombre de sommets et rayons alternés conformes", () => {
    const model = createStarGeometry(input);
    const O = model.points.find((p) => p.id === "O")!;
    const outerRadius = input.outerDiameter / 2;
    const innerRadius = outerRadius * input.innerRatio;
    model.polygons![0].points.forEach((p, i) => {
      const r = Math.hypot(p.x - O.x, p.y - O.y);
      expect(r).toBeCloseTo(i % 2 === 0 ? outerRadius : innerRadius, 6);
    });
  });

  it("premier sommet : position identique au golden", () => {
    const model = createStarGeometry(input);
    expect(model.polygons![0].points[0].x).toBeCloseTo(golden[0].x, 9);
    expect(model.polygons![0].points[0].y).toBeCloseTo(golden[0].y, 9);
  });

  it("fidélité de l'adaptateur : le TraceModel reprend exactement la géométrie Engine B", () => {
    const outerRadius = input.outerDiameter / 2;
    const innerRadius = outerRadius * input.innerRatio;
    const shape = createStar({ points: 5, outerRadius, innerRadius, rotationDegrees: input.rotation });
    const model = createStarGeometry(input);
    shape.primitives.polygons[0].points.forEach((sp, i) => {
      expect(model.polygons![0].points[i].x).toBeCloseTo(sp.x, 12);
      expect(model.polygons![0].points[i].y).toBeCloseTo(sp.y, 12);
    });
  });
});

describe("C3-PILOT-V1 §10 — compatibilité offset de la star Engine B", () => {
  it("star → offsetShape → parametricShapeToTraceModel → validateTraceModel (offset raisonnable)", () => {
    const shape = createStar({ points: 5, outerRadius: 1000, innerRadius: 400, rotationDegrees: -90 });
    const offset = offsetShape(shape, -20); // -20 mm vers l'extérieur, jonction en onglet
    const model = parametricShapeToTraceModel(offset, {
      name: "Étoile offset", slug: "star-5-offset", categoryId: "forms-design",
      difficulty: "intermediate", tags: [], status: "preview", parameters: [],
    });
    // Le contour décalé se convertit en TraceModel structurellement valide.
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.polygons![0].points).toHaveLength(10);
    // Les primitives (cercles directeurs, polygone) sont bien décalées de -20 mm.
    expect(model.circles.some((c) => Math.abs(c.radius - 980) < 1e-6)).toBe(true);
    expect(model.circles.some((c) => Math.abs(c.radius - 380) < 1e-6)).toBe(true);
    const O = model.referenceFrame.origin;
    const firstTipRadius = Math.hypot(model.polygons![0].points[0].x - O.x, model.polygons![0].points[0].y - O.y);
    expect(firstTipRadius).toBeGreaterThan(1000); // pointe repoussée vers l'extérieur
    // LIMITATION connue (à traiter dans le lot « double contour ») : offsetShape ne décale que
    // les primitives, pas la géométrie embarquée dans constructionSteps ; l'adaptateur
    // matérialise donc des cercles de construction pré-offset en doublon.
    expect(model.circles.length).toBeGreaterThanOrEqual(2);
  });
});
