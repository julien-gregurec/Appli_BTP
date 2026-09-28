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
import {
  CALQUE_DES_CATEGORIES, EXPORT_LAYER_OF_CALQUE, calquesEffectifs, murLongueurMm, type PlanCalques, type PlanDocument, type PlanExportEntity,
} from "@elsatia/releve-domain";
import { dimensionGeometry, manualDimension } from "./dimensions";
import { equipmentSymbol } from "./equipment-symbols";
import { contourLabelPoint } from "./geometry";
import { formatLongueurM, formatSurfaceContour, openingSymbol } from "./render";
import { computeWallNetwork, wallParts, type WallNetwork } from "./wall-geometry";

export type PlanGeometryExportOptions = {
  readonly pieceName?: (pieceId: string) => string;
  readonly surfaces?: Readonly<Record<string, number>>;
  readonly network?: WallNetwork;
  /** Lot 7 : état des calques (défaut : celui mémorisé dans le plan). Un calque masqué n'est pas exporté. */
  readonly calques?: PlanCalques;
};

export function planGeometryEntities(document: PlanDocument, options: PlanGeometryExportOptions = {}): PlanExportEntity[] {
  const network = options.network ?? computeWallNetwork(document.murs);
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  const entities: PlanExportEntity[] = [];
  const calques = options.calques ?? calquesEffectifs(document.reglages.calques);
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
  // Lot 7 : objets visibles des calques visibles — emprise, marques du symbole, libellé.
  for (const objet of document.equipements ?? []) {
    const calque = CALQUE_DES_CATEGORIES[objet.categorie];
    if (!objet.visible || !calques[calque].visible) continue;
    const layer = EXPORT_LAYER_OF_CALQUE[calque];
    const symbol = equipmentSymbol(objet);
    entities.push({ layer, kind: "polygon", points: symbol.outline, ref: objet.id });
    for (const polygon of symbol.polygons) entities.push({ layer, kind: "polygon", points: polygon, ref: objet.id });
    for (const line of symbol.lines) entities.push({ layer, kind: "line", a: line.a, b: line.b, widthMm: 0, style: line.style ?? "trait", ref: objet.id });
    for (const circle of symbol.circles) entities.push({ layer, kind: "arc", centre: circle.centre, radius: circle.radius, start: 0, end: 2 * Math.PI, ref: objet.id });
    if (calques.annotations.visible) entities.push({ layer, kind: "text", at: objet.position, text: objet.libelle, ref: objet.id });
  }
  for (const mur of document.murs) {
    entities.push({ layer: "COTES", kind: "text", at: { x: (mur.a.x + mur.b.x) / 2, y: (mur.a.y + mur.b.y) / 2 }, text: formatLongueurM(murLongueurMm(mur)), ref: mur.id });
  }
  // Lot 8 : cotes manuelles (ligne de cote décalée + lignes d'attache + valeur) et hauteurs ponctuelles.
  for (const cote of document.cotes ?? []) {
    const dim = manualDimension(cote);
    if (!dim) { entities.push({ layer: "COTES", kind: "text", at: cote.a, text: `h ${formatLongueurM(cote.valeurMm)}`, ref: cote.id }); continue; }
    const geometry = dimensionGeometry(dim);
    entities.push({ layer: "COTES", kind: "line", a: geometry.from, b: geometry.to, widthMm: 0, style: "trait", ref: cote.id });
    if (dim.offsetMm !== 0) {
      entities.push({ layer: "COTES", kind: "line", a: dim.a, b: geometry.from, widthMm: 0, style: "tirets", ref: cote.id });
      entities.push({ layer: "COTES", kind: "line", a: dim.b, b: geometry.to, widthMm: 0, style: "tirets", ref: cote.id });
    }
    entities.push({ layer: "COTES", kind: "text", at: geometry.mid, text: dim.text, ref: cote.id });
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
