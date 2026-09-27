/**
 * Relevé Lot 5 — géométrie du plan bâtiment, ADAPTATEUR sur Engine B.
 *
 * Aucun second moteur : chaque calcul délègue à `@/lib/geometry/engine` (distances, angles,
 * intersections, faces fermées, décalages, aires) ou au point le plus proche de la couche de
 * désignation (`@/lib/geometry/closest-point`). Ce fichier ne fait que traduire le vocabulaire
 * du bâtiment (mur, épaisseur, pièce) en primitives génériques (segment, polygone) — c'est le
 * seul endroit où les deux vocabulaires se rencontrent.
 */
import type { PlanContour, PlanDocument, PlanMur, PlanOuverture } from "@elsatia/releve-domain";
import { closestPointOnSegment } from "@/lib/geometry/closest-point";
import { polygonArea } from "@/lib/geometry/engine/area";
import { boundsFromPoints, distance, midpoint, pointAtPolar, polarAngle } from "@/lib/geometry/engine/measure";
import { offsetPolygonEdges } from "@/lib/geometry/engine/offset";
import { findEnclosedFaces, interiorPoint, pointInPolygon } from "@/lib/geometry/engine/planar-faces";
import type { BoundingBox2D, Point2D, Segment2D } from "@/lib/geometry/engine/types";

/** Deux extrémités à moins de 0,5 mm sont un même sommet (joint de murs). */
export const JOINT_EPSILON_MM = 0.5;

export function wallSegment(mur: Pick<PlanMur, "a" | "b">): Segment2D {
  return { start: mur.a, end: mur.b };
}

export function wallLength(mur: Pick<PlanMur, "a" | "b">): number {
  return distance(mur.a, mur.b);
}

/** Angle du mur (a → b) en degrés, dans [0, 360), repère Y haut. */
export function wallAngleDegrees(mur: Pick<PlanMur, "a" | "b">): number {
  const degrees = (polarAngle(mur.a, mur.b) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

export function wallMidpoint(mur: Pick<PlanMur, "a" | "b">): Point2D {
  return midpoint(mur.a, mur.b);
}

/** Point du mur à `offset` mm de son extrémité `a`, le long de l'axe. */
export function pointAlongWall(mur: Pick<PlanMur, "a" | "b">, offset: number): Point2D {
  return pointAtPolar(mur.a, offset, polarAngle(mur.a, mur.b));
}

/** Position (mm depuis `a`) de la projection d'un point sur l'axe du mur, bornée au mur. */
export function offsetAlongWall(mur: Pick<PlanMur, "a" | "b">, point: Point2D): number {
  const hit = closestPointOnSegment(point, mur.a, mur.b);
  return distance(mur.a, hit.point);
}

/** Extrémités de l'ouverture, sur l'axe de son mur. */
export function openingSegment(mur: Pick<PlanMur, "a" | "b">, ouverture: Pick<PlanOuverture, "decalageMm" | "largeurMm">): Segment2D {
  return { start: pointAlongWall(mur, ouverture.decalageMm), end: pointAlongWall(mur, ouverture.decalageMm + ouverture.largeurMm) };
}

export function samePoint(p: Point2D, q: Point2D, epsilon = JOINT_EPSILON_MM): boolean {
  return distance(p, q) <= epsilon;
}

/** Emprise de la géométrie (murs et contours), ou du cadre si le plan est vide. */
export function planBounds(document: PlanDocument): BoundingBox2D {
  const points: Point2D[] = [];
  for (const mur of document.murs) points.push(mur.a, mur.b);
  for (const contour of document.contours) points.push(...contour.points);
  if (points.length === 0) return { ...document.cadre };
  return boundsFromPoints(points);
}

/** Boîte d'un mur, épaisseur comprise (préfiltre de désignation et de rendu). */
export function wallBox(mur: PlanMur): BoundingBox2D {
  return boundsFromPoints([mur.a, mur.b], mur.epaisseurMm / 2);
}

export function boxesOverlap(a: BoundingBox2D, b: BoundingBox2D): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

// ── Désignation ──────────────────────────────────────────────────────────────

export type WallHit = { murId: string; point: Point2D; distance: number };

/** Mur le plus proche du point, à `tolerance` près au-delà de sa demi-épaisseur. */
export function hitTestWall(murs: readonly PlanMur[], point: Point2D, tolerance: number): WallHit | null {
  let best: WallHit | null = null;
  for (const mur of murs) {
    const reach = tolerance + mur.epaisseurMm / 2;
    if (point.x < Math.min(mur.a.x, mur.b.x) - reach || point.x > Math.max(mur.a.x, mur.b.x) + reach
      || point.y < Math.min(mur.a.y, mur.b.y) - reach || point.y > Math.max(mur.a.y, mur.b.y) + reach) continue;
    const hit = closestPointOnSegment(point, mur.a, mur.b);
    if (hit.distance <= reach && (!best || hit.distance < best.distance)) best = { murId: mur.id, point: hit.point, distance: hit.distance };
  }
  return best;
}

export type VertexHit = { point: Point2D; distance: number };

/** Sommet (extrémité de mur) le plus proche, à `tolerance` près. */
export function hitTestVertex(murs: readonly PlanMur[], point: Point2D, tolerance: number): VertexHit | null {
  let best: VertexHit | null = null;
  for (const mur of murs) {
    for (const end of [mur.a, mur.b]) {
      const d = distance(point, end);
      if (d <= tolerance && (!best || d < best.distance)) best = { point: end, distance: d };
    }
  }
  return best;
}

// ── Pièces ───────────────────────────────────────────────────────────────────

export type DetectedRoom = {
  /** Contour sur l'axe des murs. */
  outline: Point2D[];
  /** Contour intérieur (nu des murs : axe décalé de la demi-épaisseur de chaque mur). */
  inner: Point2D[];
  /** Le contour intérieur n'a pas pu être construit (murs trop épais pour la pièce) : axe utilisé. */
  approximated: boolean;
  murIds: string[];
  /** Surface intérieure, mm². */
  areaMm2: number;
  /** Point intérieur. */
  seed: Point2D;
};

/**
 * Pièces fermées du plan : faces bornées du réseau des axes de murs (Engine B), puis contour
 * intérieur par décalage de chaque arête de la demi-épaisseur de SON mur (Engine B).
 */
export function detectRooms(murs: readonly PlanMur[]): DetectedRoom[] {
  const faces = findEnclosedFaces(murs.map(wallSegment), { tolerance: JOINT_EPSILON_MM, minArea: 10_000 });
  return faces.map((face) => {
    const outline = [...face.polygon.points];
    let inner = outline;
    let approximated = false;
    try {
      inner = offsetPolygonEdges(outline, face.edgeSources.map((source) => murs[source].epaisseurMm / 2));
    } catch {
      approximated = true;
    }
    return {
      outline, inner, approximated,
      murIds: [...new Set(face.segmentIndices.map((index) => murs[index].id))],
      areaMm2: polygonArea({ points: inner }),
      seed: interiorPoint({ points: inner }),
    };
  });
}

/** Pièce détectée qui contient le point (la plus petite si plusieurs s'emboîtent). */
export function roomAt(rooms: readonly DetectedRoom[], point: Point2D): DetectedRoom | null {
  const containing = rooms.filter((room) => pointInPolygon(point, { points: room.outline }));
  return containing.sort((x, y) => x.areaMm2 - y.areaMm2)[0] ?? null;
}

export function contourFromRoom(pieceId: string, room: DetectedRoom): PlanContour {
  return { pieceId, points: room.inner.map(round1), murIds: room.murIds, graine: round1(room.seed) };
}

function round1(point: Point2D): Point2D {
  return { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 };
}

export type ContourRefresh = { contours: PlanContour[]; ouverts: string[] };

/**
 * Après une modification des murs : chaque pièce est retrouvée par sa GRAINE (point intérieur)
 * dans les faces recalculées, et son contour suit les murs. Une pièce dont la graine n'est plus
 * dans aucune face (un mur a été retiré) garde son dernier contour et est signalée « ouverte ».
 */
export function refreshContours(document: PlanDocument, rooms: readonly DetectedRoom[] = detectRooms(document.murs)): ContourRefresh {
  const ouverts: string[] = [];
  const contours = document.contours.map((contour) => {
    const probe = contour.graine ?? (contour.points.length ? interiorPoint({ points: contour.points }) : null);
    const room = probe ? roomAt(rooms, probe) : null;
    if (!room) { ouverts.push(contour.pieceId); return contour; }
    const next = contourFromRoom(contour.pieceId, room);
    // Surface serveur conservée tant que le contour n'a pas changé.
    return JSON.stringify(next.points) === JSON.stringify(contour.points) && JSON.stringify(next.murIds) === JSON.stringify(contour.murIds)
      ? contour
      : next;
  });
  return { contours, ouverts };
}

/** Surface d'un contour (mm²), calcul local d'affichage — la valeur de référence est celle du serveur. */
export function contourArea(contour: Pick<PlanContour, "points">): number {
  return contour.points.length >= 3 ? polygonArea({ points: contour.points }) : 0;
}

export function contourLabelPoint(contour: PlanContour): Point2D | null {
  if (contour.graine) return contour.graine;
  return contour.points.length >= 3 ? interiorPoint({ points: contour.points }) : null;
}
