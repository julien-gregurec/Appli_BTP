/**
 * Relevé Lot 5 — preuve de compatibilité d'export : sérialisation SVG du modèle d'export neutre
 * du domaine (`planExportEntities`). Le PDF (impression du SVG) et le DXF (mêmes calques,
 * mêmes entités LINE / LWPOLYLINE / TEXT, unités mm, Y haut natif) suivront au lot export :
 * rien dans le plan n'a besoin d'être converti pour eux, ce que ce sérialiseur démontre.
 *
 * Repère : le SVG a Y vers le bas ; une seule symétrie (`scale(1,-1)`) sur un groupe racine
 * conserve les coordonnées en millimètres, sans aucun arrondi.
 */
import { planExportEntities, type PlanDocument } from "@elsatia/releve-domain";
import { planBounds } from "./geometry";

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function planToSvg(document: PlanDocument, options: { pieceName?: (pieceId: string) => string; marginMm?: number } = {}): string {
  const margin = options.marginMm ?? 500;
  const bounds = planBounds(document);
  const width = bounds.maxX - bounds.minX + 2 * margin;
  const height = bounds.maxY - bounds.minY + 2 * margin;
  const entities = planExportEntities(document, { piece: options.pieceName });
  const layers = new Map<string, string[]>();
  for (const entity of entities) {
    const out = layers.get(entity.layer) ?? [];
    if (entity.kind === "line") {
      out.push(`<line x1="${entity.a.x}" y1="${entity.a.y}" x2="${entity.b.x}" y2="${entity.b.y}" stroke-width="${entity.widthMm}" data-ref="${entity.ref}"/>`);
    } else if (entity.kind === "polygon") {
      out.push(`<polygon points="${entity.points.map((p) => `${p.x},${p.y}`).join(" ")}" data-ref="${entity.ref}"/>`);
    } else {
      // Texte remis à l'endroit (contre-symétrie locale).
      out.push(`<text transform="translate(${entity.at.x} ${entity.at.y}) scale(1 -1)" data-ref="${entity.ref}">${escape(entity.text)}</text>`);
    }
    layers.set(entity.layer, out);
  }
  const styles: Record<string, string> = {
    MURS: 'stroke="#1f2933" stroke-linecap="square" fill="none"',
    OUVERTURES: 'stroke="#ffffff" fill="none"',
    PIECES: 'fill="#e7f0ff" fill-opacity="0.5" stroke="none" font-size="250" text-anchor="middle"',
    COTES: 'fill="#374151" font-size="180" text-anchor="middle"',
    PHOTOS: 'fill="#d97706"',
  };
  const body = ["PIECES", "MURS", "OUVERTURES", "COTES", "PHOTOS"]
    .filter((layer) => layers.has(layer))
    .map((layer) => `<g id="${layer}" ${styles[layer]}>${layers.get(layer)!.join("")}</g>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm">`
    + `<g transform="translate(${margin - bounds.minX} ${bounds.maxY + margin}) scale(1 -1)">${body}</g></svg>`;
}
