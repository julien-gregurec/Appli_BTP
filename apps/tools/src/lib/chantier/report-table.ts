/**
 * §14 — Table de report.
 *
 * Point | X | Y | distance O | angle. Coordonnées en millimètres, repère chantier
 * (Y vers le haut). L'angle est mesuré depuis l'axe X, ramené dans [0, 360°[.
 */

import { describeOrigin, type MeasurementOrigin } from "../tracing/measurement-origin";
import { distance, polarAngle, radToDeg, type Point2D } from "../tracing/geometry-port";

export type ReportPoint = { label: string; point: Point2D };

export type ReportRow = {
  label: string;
  xMm: number;
  yMm: number;
  distanceToOriginMm: number;
  angleDeg: number;
};

export type ReportTable = {
  origin: Point2D;
  originLabel: string;
  measurementOrigin: MeasurementOrigin;
  measurementOriginLabel: string;
  rows: ReportRow[];
};

export type BuildReportTableOptions = {
  origin?: Point2D;
  originLabel?: string;
  measurementOrigin?: MeasurementOrigin;
};

function normaliseDegrees(value: number): number {
  const mod = value % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function buildReportTable(points: readonly ReportPoint[], options: BuildReportTableOptions = {}): ReportTable {
  const origin = options.origin ?? { x: 0, y: 0 };
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) throw new Error("L'origine de report est invalide.");
  const measurementOrigin = options.measurementOrigin ?? "manual";

  const rows: ReportRow[] = points.map((entry) => {
    if (!Number.isFinite(entry.point.x) || !Number.isFinite(entry.point.y)) {
      throw new Error(`Le point de report ${entry.label} a des coordonnées invalides.`);
    }
    const distanceToOriginMm = distance(origin, entry.point);
    const angleDeg = distanceToOriginMm === 0 ? 0 : normaliseDegrees(radToDeg(polarAngle(origin, entry.point)));
    return {
      label: entry.label,
      xMm: entry.point.x,
      yMm: entry.point.y,
      distanceToOriginMm,
      angleDeg,
    };
  });

  return {
    origin,
    originLabel: options.originLabel ?? "O",
    measurementOrigin,
    measurementOriginLabel: describeOrigin(measurementOrigin),
    rows,
  };
}

/** Ligne prête pour un tableau texte / PDF. `[label, X, Y, distance, angle]`. */
export function formatReportRow(row: ReportRow, fractionDigits = 1): [string, string, string, string, string] {
  const number = (value: number) => value.toFixed(fractionDigits).replace(".", ",");
  return [row.label, number(row.xMm), number(row.yMm), number(row.distanceToOriginMm), `${number(row.angleDeg)}°`];
}
