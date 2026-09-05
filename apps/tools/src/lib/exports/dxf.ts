/**
 * §20 — Export DXF réellement exploitable (AutoCAD, DraftSight, BricsCAD, …).
 *
 * Cible : DXF ASCII R12 (`AC1009`), le dialecte accepté sans réserve par tous les
 * logiciels métier cités. Entités émises : LINE, ARC, CIRCLE, TEXT et POLYLINE
 * (forme R12 de la polyligne légère). Unité : millimètre (`$INSUNITS = 4`,
 * `$MEASUREMENT = 1`).
 *
 * Les ellipses n'existent pas en R12 : elles sont converties en POLYLINE fermée de 72
 * segments et signalées comme approximation (`approximations`). Aucun fichier n'est produit
 * avec des coordonnées non finies (§20 : ne pas prétendre supporter DXF si le fichier
 * n'est pas valide).
 */

import { radToDeg } from "../tracing/geometry-port";
import type { GeometricShape } from "../tracing/vectorization";
import type { ShapeGeometry } from "../geometry/shape-model";
import type { ProjectDocument } from "./document";

export type DxfLayerName = "CONSTRUCTION" | "FINAL" | "COTATIONS" | "LED" | "ANNOTATIONS";

const LAYER_COLOURS: Record<DxfLayerName, number> = {
  CONSTRUCTION: 8,
  FINAL: 7,
  COTATIONS: 3,
  LED: 5,
  ANNOTATIONS: 4,
};

export type DxfPoint = { x: number; y: number };
export type DxfLine = { layer: DxfLayerName; start: DxfPoint; end: DxfPoint };
export type DxfCircle = { layer: DxfLayerName; centre: DxfPoint; radius: number };
export type DxfArc = { layer: DxfLayerName; centre: DxfPoint; radius: number; startDeg: number; endDeg: number };
export type DxfPolyline = { layer: DxfLayerName; points: readonly DxfPoint[]; closed: boolean };
export type DxfText = { layer: DxfLayerName; at: DxfPoint; height: number; value: string };

export type DxfEntitySet = {
  lines?: DxfLine[];
  circles?: DxfCircle[];
  arcs?: DxfArc[];
  polylines?: DxfPolyline[];
  texts?: DxfText[];
};

const NL = "\r\n";

function tag(code: number, value: string | number): string {
  return `${code}${NL}${value}${NL}`;
}

function coordinate(value: number, label: string): string {
  if (!Number.isFinite(value)) throw new Error(`Coordonnée DXF non finie (${label}).`);
  return value.toFixed(6);
}

/** Retire tout caractère de contrôle (codes < 32 et DEL) et borne la longueur. */
function sanitizeText(value: string): string {
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code === 0xa0 || code === 0x202f) out += " ";
    else if (code < 0x20 || code === 0x7f) out += " ";
    else if (character === "–" || character === "—") out += "-";
    else out += character;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, 250);
}

function layerTable(layers: readonly DxfLayerName[]): string {
  const unique = Array.from(new Set<DxfLayerName>(["FINAL", ...layers]));
  let out = tag(0, "TABLE") + tag(2, "LAYER") + tag(70, unique.length);
  for (const name of unique) {
    out += tag(0, "LAYER") + tag(2, name) + tag(70, 0) + tag(62, LAYER_COLOURS[name]) + tag(6, "CONTINUOUS");
  }
  out += tag(0, "ENDTAB");
  return out;
}

function lineEntity(line: DxfLine): string {
  return (
    tag(0, "LINE") +
    tag(8, line.layer) +
    tag(10, coordinate(line.start.x, "line.start.x")) +
    tag(20, coordinate(line.start.y, "line.start.y")) +
    tag(30, "0.0") +
    tag(11, coordinate(line.end.x, "line.end.x")) +
    tag(21, coordinate(line.end.y, "line.end.y")) +
    tag(31, "0.0")
  );
}

function circleEntity(circle: DxfCircle): string {
  if (!Number.isFinite(circle.radius) || circle.radius <= 0) throw new Error("Rayon DXF invalide pour un cercle.");
  return (
    tag(0, "CIRCLE") +
    tag(8, circle.layer) +
    tag(10, coordinate(circle.centre.x, "circle.centre.x")) +
    tag(20, coordinate(circle.centre.y, "circle.centre.y")) +
    tag(30, "0.0") +
    tag(40, coordinate(circle.radius, "circle.radius"))
  );
}

function arcEntity(arc: DxfArc): string {
  if (!Number.isFinite(arc.radius) || arc.radius <= 0) throw new Error("Rayon DXF invalide pour un arc.");
  return (
    tag(0, "ARC") +
    tag(8, arc.layer) +
    tag(10, coordinate(arc.centre.x, "arc.centre.x")) +
    tag(20, coordinate(arc.centre.y, "arc.centre.y")) +
    tag(30, "0.0") +
    tag(40, coordinate(arc.radius, "arc.radius")) +
    tag(50, coordinate(arc.startDeg, "arc.startDeg")) +
    tag(51, coordinate(arc.endDeg, "arc.endDeg"))
  );
}

function polylineEntity(polyline: DxfPolyline): string {
  if (polyline.points.length < 2) throw new Error("Une POLYLINE DXF exige au moins deux sommets.");
  let out =
    tag(0, "POLYLINE") +
    tag(8, polyline.layer) +
    tag(66, 1) +
    tag(70, polyline.closed ? 1 : 0) +
    tag(10, "0.0") +
    tag(20, "0.0") +
    tag(30, "0.0");
  for (const point of polyline.points) {
    out +=
      tag(0, "VERTEX") +
      tag(8, polyline.layer) +
      tag(10, coordinate(point.x, "vertex.x")) +
      tag(20, coordinate(point.y, "vertex.y")) +
      tag(30, "0.0");
  }
  out += tag(0, "SEQEND") + tag(8, polyline.layer);
  return out;
}

function textEntity(text: DxfText): string {
  const height = Number.isFinite(text.height) && text.height > 0 ? text.height : 10;
  return (
    tag(0, "TEXT") +
    tag(8, text.layer) +
    tag(10, coordinate(text.at.x, "text.at.x")) +
    tag(20, coordinate(text.at.y, "text.at.y")) +
    tag(30, "0.0") +
    tag(40, coordinate(height, "text.height")) +
    tag(1, sanitizeText(text.value))
  );
}

export function renderDxf(entities: DxfEntitySet): string {
  const usedLayers: DxfLayerName[] = [];
  const collect = (list: readonly { layer: DxfLayerName }[] | undefined) => {
    for (const item of list ?? []) usedLayers.push(item.layer);
  };
  collect(entities.lines);
  collect(entities.circles);
  collect(entities.arcs);
  collect(entities.polylines);
  collect(entities.texts);

  const header =
    tag(0, "SECTION") +
    tag(2, "HEADER") +
    tag(9, "$ACADVER") +
    tag(1, "AC1009") +
    tag(9, "$INSUNITS") +
    tag(70, 4) +
    tag(9, "$MEASUREMENT") +
    tag(70, 1) +
    tag(0, "ENDSEC");

  const tables = tag(0, "SECTION") + tag(2, "TABLES") + layerTable(usedLayers) + tag(0, "ENDSEC");

  let body = tag(0, "SECTION") + tag(2, "ENTITIES");
  for (const line of entities.lines ?? []) body += lineEntity(line);
  for (const circle of entities.circles ?? []) body += circleEntity(circle);
  for (const arc of entities.arcs ?? []) body += arcEntity(arc);
  for (const polyline of entities.polylines ?? []) body += polylineEntity(polyline);
  for (const text of entities.texts ?? []) body += textEntity(text);
  body += tag(0, "ENDSEC");

  return header + tables + body + tag(0, "EOF");
}

/* -------------------------------------------------------------------------- */
/*  Adaptateurs depuis le modèle géométrique (§34)                            */
/* -------------------------------------------------------------------------- */

function ellipseToPolylinePoints(centre: DxfPoint, radiusX: number, radiusY: number, rotation = 0, steps = 72): DxfPoint[] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const points: DxfPoint[] = [];
  for (let index = 0; index < steps; index++) {
    const t = (index / steps) * Math.PI * 2;
    const ex = radiusX * Math.cos(t);
    const ey = radiusY * Math.sin(t);
    points.push({ x: centre.x + ex * cos - ey * sin, y: centre.y + ex * sin + ey * cos });
  }
  return points;
}

function normaliseDeg(value: number): number {
  const mod = value % 360;
  return mod < 0 ? mod + 360 : mod;
}

export type ShapeGeometryToDxfResult = { entities: DxfEntitySet; approximations: string[] };

export function shapeGeometryToDxf(model: ShapeGeometry): ShapeGeometryToDxfResult {
  const entities: DxfEntitySet = { lines: [], circles: [], arcs: [], polylines: [], texts: [] };
  const approximations: string[] = [];

  for (const segment of model.segments) {
    entities.lines!.push({ layer: "FINAL", start: { x: segment.start.x, y: segment.start.y }, end: { x: segment.end.x, y: segment.end.y } });
  }
  for (const segment of model.constructionLines) {
    entities.lines!.push({ layer: "CONSTRUCTION", start: { x: segment.start.x, y: segment.start.y }, end: { x: segment.end.x, y: segment.end.y } });
  }
  for (const circle of model.circles) {
    entities.circles!.push({
      layer: circle.role === "construction" ? "CONSTRUCTION" : "FINAL",
      centre: { x: circle.centre.x, y: circle.centre.y },
      radius: circle.radius,
    });
  }
  for (const arc of model.arcs) {
    const clockwise = arc.counterClockwise === false;
    const startDeg = radToDeg(clockwise ? arc.endAngle : arc.startAngle);
    const endDeg = radToDeg(clockwise ? arc.startAngle : arc.endAngle);
    entities.arcs!.push({
      layer: "FINAL",
      centre: { x: arc.centre.x, y: arc.centre.y },
      radius: arc.radius,
      startDeg: normaliseDeg(startDeg),
      endDeg: normaliseDeg(endDeg),
    });
  }
  for (const ellipse of model.ellipses) {
    entities.polylines!.push({
      layer: "FINAL",
      closed: true,
      points: ellipseToPolylinePoints({ x: ellipse.centre.x, y: ellipse.centre.y }, ellipse.radiusX, ellipse.radiusY, ellipse.rotation ?? 0),
    });
    approximations.push(`Ellipse ${ellipse.id} convertie en POLYLINE 72 segments.`);
  }
  for (const dimension of model.dimensions) {
    entities.lines!.push({ layer: "COTATIONS", start: { x: dimension.from.x, y: dimension.from.y }, end: { x: dimension.to.x, y: dimension.to.y } });
    entities.texts!.push({
      layer: "COTATIONS",
      at: { x: (dimension.from.x + dimension.to.x) / 2, y: (dimension.from.y + dimension.to.y) / 2 },
      height: 20,
      value: dimension.label,
    });
  }
  for (const polyline of model.polylines ?? []) {
    entities.polylines!.push({ layer: "FINAL", closed: false, points: polyline.points.map((point) => ({ x: point.x, y: point.y })) });
  }
  for (const polygon of model.polygons ?? []) {
    entities.polylines!.push({ layer: "FINAL", closed: true, points: polygon.points.map((point) => ({ x: point.x, y: point.y })) });
  }

  return { entities, approximations };
}

export function geometricShapesToDxf(shapes: readonly GeometricShape[]): DxfEntitySet {
  return {
    polylines: shapes.map((shape) => ({
      layer: "FINAL",
      closed: shape.closed,
      points: shape.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y })),
    })),
  };
}

const encoder = new TextEncoder();

export function exportProjectDxf(document: ProjectDocument): Uint8Array {
  const { entities } = shapeGeometryToDxf(document.execution.geometry);
  (entities.texts ??= []).push({
    layer: "ANNOTATIONS",
    at: { x: document.execution.geometry.bounds.minX, y: document.execution.geometry.bounds.maxY + 40 },
    height: 30,
    value: `ELSATIA Tools - ${document.project.name} - ${document.tool.name} - mm`,
  });
  return encoder.encode(renderDxf(entities));
}

/* -------------------------------------------------------------------------- */
/*  Validation structurelle (tests + check pré-export)                        */
/* -------------------------------------------------------------------------- */

export function validateDxfStructure(text: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r\n|\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (lines.length % 2 !== 0) errors.push("Nombre de lignes impair : paires code/valeur incomplètes.");
  for (let index = 0; index < lines.length; index += 2) {
    if (!/^-?\d+$/.test(lines[index].trim())) {
      errors.push(`Ligne ${index + 1} : code de groupe non entier (« ${lines[index]} »).`);
      break;
    }
  }
  if (/NaN|Infinity/.test(text)) errors.push("Le fichier contient une valeur non finie.");
  for (const marker of ["SECTION", "HEADER", "$INSUNITS", "TABLES", "ENTITIES", "ENDSEC", "EOF"]) {
    if (!text.includes(marker)) errors.push(`Section attendue absente : ${marker}.`);
  }
  const sectionCount = (text.match(/\r\nSECTION\r\n/g) ?? []).length;
  const endsecCount = (text.match(/\r\nENDSEC\r\n/g) ?? []).length;
  if (sectionCount !== endsecCount) errors.push(`SECTION (${sectionCount}) et ENDSEC (${endsecCount}) déséquilibrés.`);
  return { ok: errors.length === 0, errors };
}
