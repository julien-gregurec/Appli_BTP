// Parité géométrique avant/après migration vers Engine B (C4-LOT4-CURVES-V1 §7). Valeurs figées
// extraites de l'ancien modèle (commit 46e3ee9a35be44fb26f5eea70f3d19c281f5aa61) via
// `git show <commit>:.../models/spiral.ts` dans un fichier temporaire, dumpées puis supprimées —
// jamais recalculées ici. Seule l'enveloppe géométrique SERRÉE (min/max réel des points, pas le
// `bounds` avec marge de padding, propre à chaque implémentation) est comparée : un padding
// différent n'est pas une divergence géométrique (convention établie depuis C4-LOT1).
import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createSpiralGeometry } from "./spiral";

function tightBounds(points: readonly { x: number; y: number }[]) {
  return points.reduce(
    (acc, p) => ({ minX: Math.min(acc.minX, p.x), minY: Math.min(acc.minY, p.y), maxX: Math.max(acc.maxX, p.x), maxY: Math.max(acc.maxY, p.y) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

describe("createSpiralGeometry — parité Engine B (jeu A : valeurs historiques par défaut)", () => {
  const model = createSpiralGeometry({ startRadius: 50, endRadius: 1000, turns: 3, rotation: 0 });
  const points = model.polylines![0].points;
  const O = model.points.find((p) => p.id === "O")!;

  it("point de départ", () => {
    expect(points[0].x).toBeCloseTo(50, 6);
    expect(points[0].y).toBeCloseTo(0, 6);
  });

  it("point d'arrivée", () => {
    expect(points[points.length - 1].x).toBeCloseTo(1000.0000000000001, 6);
    expect(points[points.length - 1].y).toBeCloseTo(-7.34788079488412e-13, 6);
  });

  it("rayons de départ et de fin", () => {
    expect(distance(O, points[0])).toBeCloseTo(50, 9);
    expect(distance(O, points[points.length - 1])).toBeCloseTo(1000, 6);
  });

  it("nombre de tours (via le rayon final, proportionnel à l'angle parcouru)", () => {
    expect(model.dimensions.find((d) => d.id === "dim-end-radius")?.value).toBeCloseTo(1000, 9);
  });

  it("nombre de points (échantillonnage plafonné)", () => {
    expect(points.length).toBe(145);
  });

  it("enveloppe géométrique serrée", () => {
    const bounds = tightBounds(points);
    expect(bounds.minX).toBeCloseTo(-841.6666666666667, 4);
    expect(bounds.minY).toBeCloseTo(-920.8333333333333, 4);
    expect(bounds.maxX).toBeCloseTo(1000.0000000000001, 4);
    expect(bounds.maxY).toBeCloseTo(762.5174888690939, 4);
  });

  it("rotation initiale (nulle)", () => {
    expect(model.polylines![0].points[0].y).toBeCloseTo(0, 6);
  });
});

describe("createSpiralGeometry — parité Engine B (jeu B : dimensions différentes + rotation)", () => {
  const model = createSpiralGeometry({ startRadius: 120, endRadius: 3200, turns: 5.5, rotation: 40 });
  const points = model.polylines![0].points;
  const O = model.points.find((p) => p.id === "O")!;

  it("point de départ", () => {
    expect(points[0].x).toBeCloseTo(91.92533317427736, 6);
    expect(points[0].y).toBeCloseTo(77.1345131623847, 6);
  });

  it("point d'arrivée", () => {
    expect(points[points.length - 1].x).toBeCloseTo(-2451.342217980741, 5);
    expect(points[points.length - 1].y).toBeCloseTo(-2056.9203509969116, 5);
  });

  it("rayons de départ et de fin", () => {
    expect(distance(O, points[0])).toBeCloseTo(120, 6);
    expect(distance(O, points[points.length - 1])).toBeCloseTo(3200, 5);
  });

  it("nombre de points (échantillonnage plafonné à 480)", () => {
    expect(points.length).toBe(265);
  });

  it("enveloppe géométrique serrée", () => {
    const bounds = tightBounds(points);
    expect(bounds.minX).toBeCloseTo(-3138.6764961363374, 3);
    expect(bounds.minY).toBeCloseTo(-2719.076243071957, 3);
    expect(bounds.maxX).toBeCloseTo(2858.942994093417, 3);
    expect(bounds.maxY).toBeCloseTo(2998.8097451148774, 3);
  });

  it("rotation initiale : le premier point est décalé de 40° par rapport au rayon de départ pur", () => {
    const angle = Math.atan2(points[0].y, points[0].x);
    expect((angle * 180) / Math.PI).toBeCloseTo(40, 6);
  });
});
