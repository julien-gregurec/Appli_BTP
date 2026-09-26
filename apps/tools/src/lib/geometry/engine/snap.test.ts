import { describe, expect, it } from "vitest";
import { findSnapCandidates } from "./snap";

describe("accrochages (snap)", () => {
  it("accroche à la grille", () => {
    const candidates = findSnapCandidates({ x: 12, y: 8 }, { gridSize: 10 }, 5);
    expect(candidates[0]).toMatchObject({ kind: "grid", point: { x: 10, y: 10 } });
  });

  it("accroche à une extrémité et un milieu de segment", () => {
    const segment = { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } };
    const candidates = findSnapCandidates({ x: 51, y: 0 }, { segments: [segment] }, 10);
    expect(candidates.some((c) => c.kind === "midpoint" && c.point.x === 50)).toBe(true);
  });

  it("accroche au centre et aux quadrants d'un cercle", () => {
    const circle = { centre: { x: 0, y: 0 }, radius: 50 };
    const candidates = findSnapCandidates({ x: 49, y: 0 }, { circles: [circle] }, 5);
    expect(candidates.some((c) => c.kind === "quadrant" && c.point.x === 50)).toBe(true);
  });

  it("aucun candidat sans contexte d'accrochage déclaré", () => {
    expect(findSnapCandidates({ x: 1000, y: 1000 }, {}, 5)).toHaveLength(0);
  });

  it("aucun candidat hors tolérance pour un point isolé", () => {
    expect(findSnapCandidates({ x: 1000, y: 1000 }, { points: [{ x: 0, y: 0 }] }, 5)).toHaveLength(0);
  });
});
