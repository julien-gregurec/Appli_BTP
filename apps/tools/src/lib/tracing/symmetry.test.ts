import { describe, expect, it } from "vitest";
import {
  completeBySymmetry,
  createAxis,
  findVerticalSymmetryAxis,
  manualCentre,
  mirrorPoints,
  projectOnAxis,
  proposeCentre,
  repeatRadially,
  symmetryDeviation,
  symmetryFromAxis,
} from "./symmetry";
import { boundsFromPoints, distance, type Point2D } from "./geometry-port";

describe("symétrie (§26)", () => {
  it("reflète des points par rapport à un axe vertical", () => {
    const mirrored = mirrorPoints([{ x: 100, y: 50 }, { x: 300, y: 50 }], { kind: "verticale", axisX: 200 });
    expect(mirrored[0]).toEqual({ x: 300, y: 50 });
    expect(mirrored[1]).toEqual({ x: 100, y: 50 });
  });

  it("complète une demi-figure sans dupliquer les sommets posés sur l'axe", () => {
    // Demi-figure bien formée : elle commence et se termine sur l'axe.
    const half: Point2D[] = [
      { x: 0, y: 0 },
      { x: -150, y: 0 },
      { x: -150, y: 300 },
      { x: 0, y: 200 },
    ];
    const complete = completeBySymmetry(half, { kind: "verticale", axisX: 0 }, 1e-6);
    const bounds = boundsFromPoints(complete);
    expect(bounds.minX).toBe(-150);
    expect(bounds.maxX).toBe(150);
    expect(complete).toHaveLength(6);
    // Les deux sommets posés sur l'axe ne sont pas dédoublés.
    expect(complete.filter((point) => Math.abs(point.x) < 1e-9)).toHaveLength(2);
  });

  it("mesure un écart nul sur un motif parfaitement symétrique", () => {
    const points: Point2D[] = [
      { x: -100, y: 0 },
      { x: -60, y: 80 },
      { x: 0, y: 120 },
      { x: 60, y: 80 },
      { x: 100, y: 0 },
    ];
    expect(symmetryDeviation(points, { kind: "verticale", axisX: 0 }).maxDeviation).toBeCloseTo(0, 9);
  });

  it("mesure un écart réel sur un motif décalé, sans le maquiller", () => {
    const points: Point2D[] = [
      { x: -100, y: 0 },
      { x: 0, y: 120 },
      { x: 130, y: 0 },
    ];
    expect(symmetryDeviation(points, { kind: "verticale", axisX: 0 }).maxDeviation).toBeGreaterThan(20);
  });

  it("retrouve l'axe vertical de symétrie d'un motif décentré", () => {
    const centre = 340;
    const points: Point2D[] = [];
    for (let index = 0; index <= 20; index++) {
      const offset = index * 10;
      points.push({ x: centre - offset, y: offset * 0.7 }, { x: centre + offset, y: offset * 0.7 });
    }
    const found = findVerticalSymmetryAxis(points);
    expect(found.axisX).toBeCloseTo(centre, 0);
    expect(found.maxDeviation).toBeLessThan(1);
  });
});

describe("répétition radiale (§27)", () => {
  it("répète un pétale et respecte le pas angulaire exact", () => {
    const petal: Point2D[] = [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 40, y: 120 }];
    const copies = repeatRadially({ points: petal, centre: { x: 0, y: 0 }, count: 6 });
    expect(copies).toHaveLength(6);
    expect(copies[0][1].y).toBeCloseTo(200, 9);
    // Le troisième exemplaire est tourné de 120° : la pointe passe à gauche.
    expect(copies[2][1].x).toBeCloseTo(-200 * Math.sin((2 * Math.PI) / 3), 6);
    expect(copies[2][1].y).toBeCloseTo(200 * Math.cos((2 * Math.PI) / 3), 6);
    for (const copy of copies) expect(distance({ x: 0, y: 0 }, copy[1])).toBeCloseTo(200, 9);
  });

  it("refuse un nombre d'éléments non entier ou hors limites", () => {
    const petal: Point2D[] = [{ x: 0, y: 0 }, { x: 0, y: 100 }];
    expect(() => repeatRadially({ points: petal, centre: { x: 0, y: 0 }, count: 0 })).toThrow();
    expect(() => repeatRadially({ points: petal, centre: { x: 0, y: 0 }, count: 2.5 })).toThrow();
  });
});

describe("centre et axes (§28, §29)", () => {
  it("propose le centre d'un motif circulaire par ajustement, et le laisse corrigeable", () => {
    const points: Point2D[] = [];
    for (let index = 0; index < 24; index++) {
      const angle = (index / 24) * 2 * Math.PI;
      points.push({ x: 750 + 300 * Math.cos(angle), y: 400 + 300 * Math.sin(angle) });
    }
    const proposal = proposeCentre(points);
    expect(proposal.method).toBe("cercle-ajuste");
    expect(proposal.centre.x).toBeCloseTo(750, 6);
    expect(proposal.radius).toBeCloseTo(300, 6);
    expect(proposal.editable).toBe(true);
    expect(proposal.notice).toContain("à corriger");
  });

  it("retombe sur l'encombrement quand le cercle n'a pas de sens", () => {
    const aligned: Point2D[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
    expect(proposeCentre(aligned).method).toBe("enveloppe");
  });

  it("donne la priorité à un centre saisi par l'utilisateur", () => {
    const manual = manualCentre({ x: 12, y: 34 });
    expect(manual.method).toBe("manuel");
    expect(manual.centre).toEqual({ x: 12, y: 34 });
  });

  it("projette un point sur un axe et en dérive une symétrie", () => {
    const axis = createAxis("axe-1", "horizontale", { x: 0, y: 100 });
    expect(projectOnAxis(axis, { x: 250, y: 400 })).toEqual({ x: 250, y: 100 });
    const spec = symmetryFromAxis(axis);
    expect(spec.kind).toBe("personnalisee");
    const mirrored = mirrorPoints([{ x: 250, y: 400 }], spec);
    expect(mirrored[0].y).toBeCloseTo(-200, 9);
  });
});
