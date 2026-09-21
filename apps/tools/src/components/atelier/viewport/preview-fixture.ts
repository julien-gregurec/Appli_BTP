/**
 * Fixtures géométriques statiques pour l'aperçu interne du viewport (§12).
 *
 * Écrites à la main, sans aucun appel au moteur géométrique ni à un modèle C4 : la page de
 * preview doit rester valide même quand Engine B évolue, et ce lot n'a pas le droit de dépendre
 * d'un `modelId`. Trois scènes couvrent les trois profils de charge du §14 : simple, moyenne, et
 * une scène de plusieurs dizaines d'entités.
 */

import { point } from "../../../lib/geometry/primitives";
import type { Point } from "../../../lib/geometry/primitives";
import type { PlanScene } from "./plan-scene";

function node(id: string, x: number, y: number, label?: string, role: Point["role"] = "reference"): Point {
  return point(id, x, y, label ?? id, role);
}

/** Faux-plafond rectangulaire à pan coupé : le cas d'usage le plus courant sur chantier. */
export const SIMPLE_SCENE: PlanScene = {
  id: "fixture-simple",
  name: "Plafond rectangulaire à pan coupé",
  bounds: { minX: 0, minY: 0, maxX: 3200, maxY: 2400 },
  polygons: [
    {
      id: "contour",
      role: "shape",
      points: [
        node("A", 0, 0),
        node("B", 3200, 0),
        node("C", 3200, 1800),
        node("D", 2400, 2400),
        node("E", 0, 2400),
      ],
    },
  ],
  segments: [
    { id: "axe-h", role: "axis", start: node("axe-h-1", 0, 1200), end: node("axe-h-2", 3200, 1200) },
    { id: "axe-v", role: "axis", start: node("axe-v-1", 1600, 0), end: node("axe-v-2", 1600, 2400) },
  ],
  points: [
    node("O", 1600, 1200, "O", "center"),
    node("A", 0, 0, "A"),
    node("B", 3200, 0, "B"),
    node("C", 3200, 1800, "C"),
    node("D", 2400, 2400, "D"),
    node("E", 0, 2400, "E"),
  ],
};

/** Retombée courbe + gorge LED : mélange arcs, cercles et polyligne. */
export const MEDIUM_SCENE: PlanScene = {
  id: "fixture-medium",
  name: "Retombée courbe avec gorge LED",
  bounds: { minX: -200, minY: -200, maxX: 4200, maxY: 2800 },
  polygons: [
    {
      id: "contour-piece",
      role: "shape",
      points: [node("P1", 0, 0), node("P2", 4000, 0), node("P3", 4000, 2600), node("P4", 0, 2600)],
    },
  ],
  arcs: [
    { id: "retombee", role: "shape", centre: node("Cr", 2000, 400, "Cr", "center"), radius: 1500, startAngle: 0.35, endAngle: Math.PI - 0.35 },
    { id: "raccord-gauche", role: "construction", centre: node("Cg", 500, 2100, "Cg", "center"), radius: 400, startAngle: Math.PI, endAngle: Math.PI * 1.5 },
    { id: "raccord-droit", role: "construction", centre: node("Cd", 3500, 2100, "Cd", "center"), radius: 400, startAngle: Math.PI * 1.5, endAngle: Math.PI * 2 },
  ],
  circles: [
    { id: "spot-1", role: "shape", centre: node("S1", 1000, 800, "S1"), radius: 45 },
    { id: "spot-2", role: "shape", centre: node("S2", 2000, 800, "S2"), radius: 45 },
    { id: "spot-3", role: "shape", centre: node("S3", 3000, 800, "S3"), radius: 45 },
  ],
  ellipses: [{ id: "ovale-central", role: "construction", centre: node("Oc", 2000, 1700, "Oc", "center"), radiusX: 900, radiusY: 500, rotation: 0 }],
  polylines: [
    {
      id: "gorge-led",
      role: "shape",
      points: [node("G1", 300, 2300), node("G2", 3700, 2300), node("G3", 3700, 1900), node("G4", 300, 1900)],
    },
  ],
  segments: [
    { id: "axe-x", role: "axis", start: node("ax1", -200, 1300), end: node("ax2", 4200, 1300) },
    { id: "axe-y", role: "axis", start: node("ay1", 2000, -200), end: node("ay2", 2000, 2800) },
  ],
  points: [
    node("O", 2000, 1300, "O", "center"),
    node("Cr", 2000, 400, "Cr", "center"),
    node("P1", 0, 0, "P1"),
    node("P2", 4000, 0, "P2"),
    node("P3", 4000, 2600, "P3"),
    node("P4", 0, 2600, "P4"),
  ],
};

/**
 * Scène de charge : plafond découpé en caissons, avec spots et repères — plusieurs dizaines
 * d'entités, générées de façon déterministe (§14 : vérifier l'absence de freeze).
 */
export function createDenseScene(): PlanScene {
  const columns = 7;
  const rows = 5;
  const pitch = 900;
  const segments: PlanScene["segments"] = [];
  const circles: PlanScene["circles"] = [];
  const points: Point[] = [];
  const mutableSegments = segments as { id: string; role?: "shape" | "construction" | "axis"; start: Point; end: Point }[];
  const mutableCircles = circles as { id: string; role?: "shape" | "construction"; centre: Point; radius: number }[];

  for (let column = 0; column <= columns; column += 1) {
    const x = column * pitch;
    mutableSegments.push({
      id: `trame-v-${column}`,
      role: "construction",
      start: node(`tv${column}a`, x, 0),
      end: node(`tv${column}b`, x, rows * pitch),
    });
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = row * pitch;
    mutableSegments.push({
      id: `trame-h-${row}`,
      role: "construction",
      start: node(`th${row}a`, 0, y),
      end: node(`th${row}b`, columns * pitch, y),
    });
  }
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const centre = node(`sp-${column}-${row}`, column * pitch + pitch / 2, row * pitch + pitch / 2);
      mutableCircles.push({ id: `spot-${column}-${row}`, role: "shape", centre, radius: 55 });
      if ((column + row) % 4 === 0) points.push(centre);
    }
  }

  return {
    id: "fixture-dense",
    name: "Plafond à caissons — scène de charge",
    bounds: { minX: 0, minY: 0, maxX: columns * pitch, maxY: rows * pitch },
    polygons: [
      {
        id: "contour-dense",
        role: "shape",
        points: [
          node("D1", 0, 0),
          node("D2", columns * pitch, 0),
          node("D3", columns * pitch, rows * pitch),
          node("D4", 0, rows * pitch),
        ],
      },
    ],
    segments,
    circles,
    points,
  };
}

export const DENSE_SCENE: PlanScene = createDenseScene();

export const PREVIEW_SCENES: readonly PlanScene[] = [SIMPLE_SCENE, MEDIUM_SCENE, DENSE_SCENE];
