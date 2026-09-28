/**
 * Relevé Lot 6 — modèle d'export GÉOMÉTRIQUE du plan (murs raccordés, découpés par les
 * ouvertures, symboles de menuiserie). Il complète `planExportEntities` du domaine (axes +
 * épaisseur, sans moteur géométrique) : ici chaque mur est exporté tel qu'il est dessiné — des
 * polygones fermés à l'épaisseur réelle, jonctions nettoyées, interrompus au droit des
 * ouvertures — et chaque ouverture par ses traits et ses arcs.
 *
 * Primitives : polygone fermé, segment (style trait / tirets / vitrage), arc de cercle, texte.
 * Toutes existent nativement en SVG, en PDF et en DXF (LWPOLYLINE / POLYLINE fermée, LINE,
 * ARC, TEXT) : les écrivains n'ont qu'à sérialiser, en millimètres, repère Y haut.
 */
import { murLongueurMm, type PlanDocument, type PlanExportEntity } from "@elsatia/releve-domain";
import { contourLabelPoint } from "./geometry";
import { formatLongueurM, formatSurfaceContour, openingSymbol } from "./render";
import { computeWallNetwork, wallParts, type WallNetwork } from "./wall-geometry";

export type PlanGeometryExportOptions = {
  readonly pieceName?: (pieceId: string) => string;
  readonly surfaces?: Readonly<Record<string, number>>;
  readonly network?: WallNetwork;
};

export function planGeometryEntities(document: PlanDocument, options: PlanGeometryExportOptions = {}): PlanExportEntity[] {
  const network = options.network ?? computeWallNetwork(document.murs);
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  const entities: PlanExportEntity[] = [];
  for (const contour of document.contours) {
    entities.push({ layer: "PIECES", kind: "polygon", points: contour.points, ref: contour.pieceId });
  }
  for (const mur of document.murs) {
    for (const part of wallParts(network, murs, mur, document.ouvertures)) entities.push({ layer: "MURS", kind: "polygon", points: part, ref: mur.id });
  }
  for (const ouverture of document.ouvertures) {
    const mur = murs.get(ouverture.murId);
    if (!mur) continue;
    const symbol = openingSymbol(mur, ouverture);
    for (const line of symbol.lines) entities.push({ layer: "OUVERTURES", kind: "line", a: line.a, b: line.b, widthMm: 0, style: line.style ?? "trait", ref: ouverture.id });
    for (const arc of symbol.arcs) entities.push({ layer: "OUVERTURES", kind: "arc", centre: arc.centre, radius: arc.radius, start: arc.start, end: arc.end, ref: ouverture.id });
  }
  for (const mur of document.murs) {
    entities.push({ layer: "COTES", kind: "text", at: { x: (mur.a.x + mur.b.x) / 2, y: (mur.a.y + mur.b.y) / 2 }, text: formatLongueurM(murLongueurMm(mur)), ref: mur.id });
  }
  for (const contour of document.contours) {
    const at = contourLabelPoint(contour);
    if (!at) continue;
    const name = options.pieceName?.(contour.pieceId) ?? contour.pieceId;
    const surface = formatSurfaceContour({ ...contour, surfaceMm2: options.surfaces?.[contour.pieceId] ?? contour.surfaceMm2 });
    entities.push({ layer: "PIECES", kind: "text", at, text: `${name} ${surface}`, ref: contour.pieceId });
  }
  return entities;
}
