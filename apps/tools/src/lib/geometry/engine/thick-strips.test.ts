import { describe, expect, it } from "vitest";
import { polygonArea } from "./area";
import { pointInPolygon } from "./planar-faces";
import { buildStripNetwork, stripSolidParts, type Strip } from "./thick-strips";
import type { Point2D } from "./types";

const s = (ax: number, ay: number, bx: number, by: number, width = 200): Strip => ({ start: { x: ax, y: ay }, end: { x: bx, y: by }, halfWidth: width / 2 });
const area = (points: readonly Point2D[]) => polygonArea({ points });
const signed = (points: readonly Point2D[]) => points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0) / 2;
const has = (points: readonly Point2D[], x: number, y: number) => points.some((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6);

/** Générateur pseudo-aléatoire déterministe (tests de propriétés reproductibles). */
function prng(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}

/** Points d'échantillonnage couverts par plus d'un contour (chevauchement) ou par aucun (trou). */
function audit(strips: Strip[], samples: number, random: () => number) {
  const network = buildStripNetwork(strips);
  const parts = network.outlines.flatMap((outline, i) => stripSolidParts(outline.polygon, strips[i], [], outline.cutBy.map((j) => strips[j])));
  const xs = strips.flatMap((strip) => [strip.start.x, strip.end.x]); const ys = strips.flatMap((strip) => [strip.start.y, strip.end.y]);
  const box = { minX: Math.min(...xs) - 400, maxX: Math.max(...xs) + 400, minY: Math.min(...ys) - 400, maxY: Math.max(...ys) + 400 };
  let overlaps = 0; let holes = 0; let outside = 0;
  for (let k = 0; k < samples; k++) {
    const p = { x: box.minX + random() * (box.maxX - box.minX), y: box.minY + random() * (box.maxY - box.minY) };
    const count = parts.filter((part) => pointInPolygon(p, { points: part })).length;
    if (count > 1) overlaps++;
    // Cœur d'une bande (hors marge de 1 mm) : doit être couvert.
    const inCore = strips.some((strip) => {
      const len = Math.hypot(strip.end.x - strip.start.x, strip.end.y - strip.start.y);
      const u = { x: (strip.end.x - strip.start.x) / len, y: (strip.end.y - strip.start.y) / len };
      const t = (p.x - strip.start.x) * u.x + (p.y - strip.start.y) * u.y;
      const d = Math.abs(u.x * (p.y - strip.start.y) - u.y * (p.x - strip.start.x));
      return t > 1 && t < len - 1 && d < strip.halfWidth - 1;
    });
    if (inCore && count === 0) holes++;
    // Surépaisseur : un point couvert est à moins d'une demi-largeur de l'axe d'une bande
    // (onglets compris : le coin extérieur d'un L est à ≤ h de chacun des deux axes prolongés).
    if (count > 0 && !strips.some((strip) => {
      const len = Math.hypot(strip.end.x - strip.start.x, strip.end.y - strip.start.y);
      const u = { x: (strip.end.x - strip.start.x) / len, y: (strip.end.y - strip.start.y) / len };
      const t = (p.x - strip.start.x) * u.x + (p.y - strip.start.y) * u.y;
      const d = Math.abs(u.x * (p.y - strip.start.y) - u.y * (p.x - strip.start.x));
      return t > -strip.halfWidth * 4 - 1 && t < len + strip.halfWidth * 4 + 1 && d <= strip.halfWidth + 1;
    })) outside++;
  }
  return { overlaps, holes, outside, network, parts };
}

describe("buildStripNetwork — raccords", () => {
  it("extrémité libre : bout droit, sans débord, contour en sens trigonométrique", () => {
    const { outlines, junctions } = buildStripNetwork([s(0, 0, 4000, 0)]);
    expect(outlines[0].polygon).toEqual([{ x: 0, y: -100 }, { x: 4000, y: -100 }, { x: 4000, y: 100 }, { x: 0, y: 100 }]);
    expect(signed(outlines[0].polygon)).toBeGreaterThan(0);
    expect(outlines[0].start.join).toBe("libre");
    expect([outlines[0].clearFrom, outlines[0].clearTo]).toEqual([0, 4000]);
    expect(junctions).toEqual([]);
  });

  it("L : onglet exact (coin extérieur et coin intérieur partagés), aucune surépaisseur", () => {
    const { outlines, junctions } = buildStripNetwork([s(0, 0, 4000, 0), s(4000, 0, 4000, 3000)]);
    expect(junctions).toEqual([{ point: { x: 4000, y: 0 }, kind: "L", strips: [0, 1] }]);
    expect(outlines[0].end.join).toBe("onglet");
    expect(has(outlines[0].polygon, 4100, -100)).toBe(true);
    expect(has(outlines[0].polygon, 3900, 100)).toBe(true);
    expect(has(outlines[1].polygon, 4100, -100)).toBe(true);
    expect(has(outlines[1].polygon, 3900, 100)).toBe(true);
    // Aires : 2 bandes de 4000 et 3000 × 200 + le carré d'angle, sans double compte.
    expect(area(outlines[0].polygon) + area(outlines[1].polygon)).toBeCloseTo(4000 * 200 + 3000 * 200, 6);
    expect(outlines[0].clearTo).toBeCloseTo(3900);
    expect(outlines[1].clearFrom).toBeCloseTo(100);
  });

  it("L d'épaisseurs différentes : onglet sur les faces réelles", () => {
    const { outlines } = buildStripNetwork([s(0, 0, 4000, 0, 300), s(4000, 0, 4000, 3000, 100)]);
    expect(has(outlines[0].polygon, 4050, -150)).toBe(true);
    expect(has(outlines[0].polygon, 3950, 150)).toBe(true);
    expect(has(outlines[1].polygon, 4050, -150)).toBe(true);
  });

  it("T (about) : la traversante reste pleine, l'autre s'arrête sur sa face", () => {
    const { outlines, junctions } = buildStripNetwork([s(0, 0, 6000, 0), s(3000, 0, 3000, 3000, 100)]);
    expect(junctions).toEqual([{ point: { x: 3000, y: 0 }, kind: "T", strips: [1, 0] }]);
    expect(outlines[0].polygon).toHaveLength(4);
    expect(outlines[1].start.join).toBe("about");
    expect(has(outlines[1].polygon, 3050, 100)).toBe(true);
    expect(has(outlines[1].polygon, 2950, 100)).toBe(true);
    expect(outlines[0].obstructions).toEqual([{ from: 2950, to: 3050, by: 1, kind: "T" }]);
    expect(outlines[1].clearFrom).toBeCloseTo(100);
  });

  it("T formé de trois extrémités : éventail autour du nœud, sans trou", () => {
    const result = audit([s(0, 0, 3000, 0), s(6000, 0, 3000, 0), s(3000, 0, 3000, 3000, 100)], 4000, prng(1));
    expect(result.network.junctions[0].kind).toBe("T");
    expect(result.overlaps).toBe(0);
    expect(result.holes).toBe(0);
  });

  it("X : croisement signalé, l'emprise de la première bande est retirée de la seconde", () => {
    const strips = [s(0, 0, 6000, 0), s(3000, -3000, 3000, 3000, 100)];
    const result = audit(strips, 4000, prng(2));
    expect(result.network.junctions).toEqual([{ point: { x: 3000, y: 0 }, kind: "X", strips: [0, 1] }]);
    expect(result.network.outlines[1].cutBy).toEqual([0]);
    expect(result.parts).toHaveLength(3);
    expect(result.overlaps).toBe(0);
    expect(result.holes).toBe(0);
    expect(result.network.outlines[0].obstructions[0]).toMatchObject({ from: 2950, to: 3050, kind: "X" });
  });

  it("X formé de quatre extrémités et prolongement", () => {
    const cross = buildStripNetwork([s(0, 0, 3000, 0), s(6000, 0, 3000, 0), s(3000, -3000, 3000, 0), s(3000, 3000, 3000, 0)]);
    expect(cross.junctions[0].kind).toBe("X");
    const straight = buildStripNetwork([s(0, 0, 3000, 0), s(3000, 0, 6000, 0)]);
    expect(straight.junctions[0].kind).toBe("prolongement");
    expect(straight.outlines[0].end.cap).toEqual([]);
  });

  it("onglet trop aigu : biseau (pas de pointe, pas d'encoche)", () => {
    const strips = [s(0, 0, 4000, 0), s(0, 0, 4000, 300)];
    const { outlines } = buildStripNetwork(strips);
    expect(outlines[0].start.join).toBe("biseau");
    for (const outline of outlines) for (const p of outline.polygon) expect(Math.hypot(p.x, p.y) < 500 || p.x > 1000).toBe(true);
    const result = audit(strips, 4000, prng(3));
    expect(result.overlaps).toBe(0);
  });

  it("découpe des baies : parties pleines, tableaux perpendiculaires à l'axe", () => {
    const strip = s(0, 0, 4000, 0);
    const { outlines } = buildStripNetwork([strip]);
    const parts = stripSolidParts(outlines[0].polygon, strip, [{ from: 1000, to: 1900 }, { from: 2500, to: 3000 }]);
    expect(parts).toHaveLength(3);
    expect(parts.map(area).reduce((a, b) => a + b, 0)).toBeCloseTo((4000 - 900 - 500) * 200, 6);
    expect(parts[1].map((p) => p.x).sort((a, b) => a - b)).toEqual([1900, 1900, 2500, 2500]);
  });
});

describe("buildStripNetwork — propriétés (réseaux aléatoires)", () => {
  it("grilles de pièces rectangulaires : aucun chevauchement, aucun trou, aucune surépaisseur", () => {
    const random = prng(42);
    for (let run = 0; run < 12; run++) {
      const cols = 1 + Math.floor(random() * 3); const rows = 1 + Math.floor(random() * 3);
      const xs = [0]; const ys = [0];
      for (let i = 0; i < cols; i++) xs.push(xs[i] + 2000 + Math.round(random() * 3000));
      for (let j = 0; j < rows; j++) ys.push(ys[j] + 2000 + Math.round(random() * 3000));
      const width = () => [100, 150, 200, 300][Math.floor(random() * 4)];
      const strips: Strip[] = [];
      // Murs horizontaux continus, cloisons verticales coupées à chaque rangée (T et X mêlés).
      for (const y of ys) strips.push(s(xs[0], y, xs[xs.length - 1], y, width()));
      for (const x of xs) for (let j = 0; j < rows; j++) strips.push(s(x, ys[j], x, ys[j + 1], width()));
      const result = audit(strips, 3000, random);
      expect({ run, ...result, network: undefined, parts: undefined }).toEqual({ run, overlaps: 0, holes: 0, outside: 0, network: undefined, parts: undefined });
    }
  });

  it("polygones quelconques (angles non droits) fermés : aucun chevauchement ni trou", () => {
    const random = prng(7);
    for (let run = 0; run < 12; run++) {
      const count = 3 + Math.floor(random() * 5);
      const points = Array.from({ length: count }, (_, k) => {
        const angle = (2 * Math.PI * k) / count + random() * 0.4;
        const radius = 3000 + random() * 2000;
        return { x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) };
      });
      const strips = points.map((p, k) => { const q = points[(k + 1) % count]; return s(p.x, p.y, q.x, q.y, 100 + Math.round(random() * 200)); });
      const result = audit(strips, 3000, random);
      expect({ run, overlaps: result.overlaps, holes: result.holes }).toEqual({ run, overlaps: 0, holes: 0 });
    }
  });

  it("500 bandes : réseau construit en moins de 100 ms", () => {
    const strips: Strip[] = [];
    for (let i = 0; i <= 20; i++) strips.push(s(0, i * 3000, 60_000, i * 3000));
    for (let i = 0; i <= 20; i++) for (let j = 0; j < 20; j++) strips.push(s(i * 3000, j * 3000, i * 3000, (j + 1) * 3000, 100));
    expect(strips.length).toBeGreaterThanOrEqual(441);
    const t0 = performance.now();
    const network = buildStripNetwork(strips);
    const elapsed = performance.now() - t0;
    expect(network.junctions.length).toBeGreaterThan(400);
    expect(elapsed).toBeLessThan(100);
  });
});
