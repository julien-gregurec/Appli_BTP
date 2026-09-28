/**
 * Relevé Lot 5 → Lot 6 — export SVG du plan : sérialisation du modèle d'export GÉOMÉTRIQUE
 * (`planGeometryEntities`) — murs à l'épaisseur réelle, jonctions nettoyées, interrompus au droit
 * des ouvertures ; portes (vantail + arc), fenêtres, baies, passages.
 *
 * Repère : le SVG a Y vers le bas ; une seule symétrie (`scale(1,-1)`) sur un groupe racine
 * conserve les coordonnées en millimètres, sans aucun arrondi. Un arc parcouru dans le sens
 * trigonométrique du repère monde garde `sweep-flag = 1` sous cette symétrie (le repère local du
 * groupe EST le repère monde). Le PDF = impression de ce SVG ; le DXF = `export-dxf.ts`.
 */
import type { PlanDocument, PlanExportEntity } from "@elsatia/releve-domain";
import { planBounds } from "./geometry";
import { planGeometryEntities, type PlanGeometryExportOptions } from "./export-entities";

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const n = (value: number) => String(Math.round(value * 1000) / 1000);

function serialize(entity: PlanExportEntity): string {
  switch (entity.kind) {
    case "polygon":
      return `<polygon points="${entity.points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ")}" data-ref="${entity.ref}"/>`;
    case "line": {
      const style = entity.style === "tirets" ? ' stroke-dasharray="60 40"' : entity.style === "vitrage" ? ' stroke="#2563eb"' : "";
      const width = entity.widthMm > 0 ? ` stroke-width="${n(entity.widthMm)}"` : "";
      return `<line x1="${n(entity.a.x)}" y1="${n(entity.a.y)}" x2="${n(entity.b.x)}" y2="${n(entity.b.y)}"${width}${style} data-ref="${entity.ref}"/>`;
    }
    case "arc": {
      const from = { x: entity.centre.x + entity.radius * Math.cos(entity.start), y: entity.centre.y + entity.radius * Math.sin(entity.start) };
      const to = { x: entity.centre.x + entity.radius * Math.cos(entity.end), y: entity.centre.y + entity.radius * Math.sin(entity.end) };
      const sweep = ((entity.end - entity.start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      return `<path d="M${n(from.x)},${n(from.y)} A${n(entity.radius)},${n(entity.radius)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${n(to.x)},${n(to.y)}" data-ref="${entity.ref}"/>`;
    }
    case "text":
      // Texte remis à l'endroit (contre-symétrie locale).
      return `<text transform="translate(${n(entity.at.x)} ${n(entity.at.y)}) scale(1 -1)" data-ref="${entity.ref}">${escape(entity.text)}</text>`;
  }
}

export function planToSvg(document: PlanDocument, options: PlanGeometryExportOptions & { marginMm?: number } = {}): string {
  const margin = options.marginMm ?? 500;
  const bounds = planBounds(document);
  const width = bounds.maxX - bounds.minX + 2 * margin;
  const height = bounds.maxY - bounds.minY + 2 * margin;
  const layers = new Map<string, string[]>();
  for (const entity of planGeometryEntities(document, options)) {
    const out = layers.get(entity.layer) ?? [];
    out.push(serialize(entity));
    layers.set(entity.layer, out);
  }
  const styles: Record<string, string> = {
    // Murs : contour tracé, remplissage plein (coutures entre murs voisins invisibles).
    MURS: 'fill="#3b4a54" stroke="#1f2933" stroke-width="12" stroke-linejoin="miter"',
    OUVERTURES: 'stroke="#1f2933" stroke-width="12" fill="none"',
    PIECES: 'fill="#e7f0ff" fill-opacity="0.5" stroke="none" font-size="250" text-anchor="middle"',
    COTES: 'fill="#374151" font-size="180" text-anchor="middle"',
    PHOTOS: 'fill="#d97706"',
  };
  const body = ["PIECES", "MURS", "OUVERTURES", "COTES", "PHOTOS"]
    .filter((layer) => layers.has(layer))
    .map((layer) => `<g id="${layer}" ${styles[layer]}>${layers.get(layer)!.join("")}</g>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}mm" height="${n(height)}mm">`
    + `<g transform="translate(${n(margin - bounds.minX)} ${n(bounds.maxY + margin)}) scale(1 -1)">${body}</g></svg>`;
}
