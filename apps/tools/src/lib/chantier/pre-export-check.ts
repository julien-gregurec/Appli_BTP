/**
 * §27 — Vérifier le tracé (check avant export).
 * §28 — Une mesure d'origine non fiable ne franchit pas l'export sans avertissement.
 *
 * Renvoie une liste d'anomalies classées : Erreur / Avertissement / Information.
 * `canExport` est faux dès qu'il reste au moins une erreur.
 */

import { isRealWorldTrusted, type MeasurementOrigin } from "../tracing/measurement-origin";
import type { BoundingBox2D, Point2D } from "../tracing/geometry-port";

export type CheckSeverity = "error" | "warning" | "info";

export type CheckIssue = {
  code: string;
  severity: CheckSeverity;
  message: string;
};

export type CheckShape = {
  id: string;
  vertices: readonly Point2D[];
  closed: boolean;
  origin: MeasurementOrigin;
};

export type PreExportInput = {
  roomWidthMm?: number;
  roomHeightMm?: number;
  scaleDefined: boolean;
  usesReferenceImage: boolean;
  imageCalibrated: boolean;
  shapes: readonly CheckShape[];
  /**
   * Le document exporté s'appuie sur une géométrie résolue par le moteur depuis le modèle
   * du projet (ATELIER-MODELID-ENGINE-B-BRIDGE-V1). Un tel tracé n'a pas de `shapes`
   * vectorisées : il n'est pas vide pour autant.
   */
  hasResolvedModelGeometry?: boolean;
  /** Emprise du motif dans le repère pièce (mm). */
  contentBounds?: BoundingBox2D;
  /** Emprise du gabarit imprimable (mm), pour détecter un dépassement de pièce. */
  gabaritBounds?: BoundingBox2D;
  ledSegments?: readonly { id: string; lengthMm: number }[];
  dimensionsCount?: number;
};

export type PreExportReport = {
  issues: CheckIssue[];
  errors: number;
  warnings: number;
  infos: number;
  canExport: boolean;
};

function outside(bounds: BoundingBox2D, widthMm: number, heightMm: number): boolean {
  return bounds.minX < -1e-6 || bounds.minY < -1e-6 || bounds.maxX > widthMm + 1e-6 || bounds.maxY > heightMm + 1e-6;
}

export function runPreExportChecks(input: PreExportInput): PreExportReport {
  const issues: CheckIssue[] = [];
  const add = (severity: CheckSeverity, code: string, message: string) => issues.push({ severity, code, message });

  if (!Number.isFinite(input.roomWidthMm) || !Number.isFinite(input.roomHeightMm) || (input.roomWidthMm ?? 0) <= 0 || (input.roomHeightMm ?? 0) <= 0) {
    add("warning", "room-dimensions-missing", "Les dimensions de la zone ne sont pas définies.");
  }

  if (!input.scaleDefined) {
    add("error", "scale-undefined", "L'échelle du projet n'est pas définie.");
  }

  if (input.usesReferenceImage && !input.imageCalibrated) {
    add("error", "image-not-calibrated", "L'image de référence est utilisée mais n'est pas calibrée.");
  }

  if (!input.shapes.length && !input.hasResolvedModelGeometry) {
    add("error", "empty-drawing", "Le tracé est vide.");
  }

  for (const shape of input.shapes) {
    const invalidPoint = shape.vertices.some((vertex) => !Number.isFinite(vertex.x) || !Number.isFinite(vertex.y));
    if (invalidPoint) add("error", "point-without-coordinates", `La forme ${shape.id} contient un point sans coordonnées valides.`);
    if (shape.vertices.length < 2) {
      add("error", "invalid-shape", `La forme ${shape.id} est invalide (moins de deux points).`);
    } else if (shape.closed && shape.vertices.length < 3) {
      add("error", "invalid-shape", `La forme fermée ${shape.id} a moins de trois points.`);
    }
    if (!shape.closed) {
      add("info", "open-shape", `La forme ${shape.id} n'est pas fermée.`);
    }
    if (input.scaleDefined && !isRealWorldTrusted(shape.origin)) {
      add("warning", "unreliable-scale", `La forme ${shape.id} provient d'une mesure non fiable (${shape.origin}).`);
    }
  }

  if (input.contentBounds && Number.isFinite(input.roomWidthMm) && Number.isFinite(input.roomHeightMm)) {
    if (outside(input.contentBounds, input.roomWidthMm!, input.roomHeightMm!)) {
      add("warning", "content-outside-room", "Une partie du motif sort de la pièce.");
    }
  }

  if (input.gabaritBounds && Number.isFinite(input.roomWidthMm) && Number.isFinite(input.roomHeightMm)) {
    if (outside(input.gabaritBounds, input.roomWidthMm!, input.roomHeightMm!)) {
      add("warning", "gabarit-outside-room", "Le gabarit dépasse les limites de la pièce.");
    }
  }

  for (const segment of input.ledSegments ?? []) {
    if (!Number.isFinite(segment.lengthMm) || segment.lengthMm <= 0) {
      add("warning", "led-without-length", `Le segment LED ${segment.id} n'a pas de longueur exploitable.`);
    }
  }

  if (input.dimensionsCount !== undefined && input.dimensionsCount <= 0) {
    add("warning", "dimensions-missing", "Aucune cotation essentielle n'est présente.");
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const infos = issues.filter((issue) => issue.severity === "info").length;
  return { issues, errors, warnings, infos, canExport: errors === 0 };
}
