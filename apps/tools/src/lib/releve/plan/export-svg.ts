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
      // Lot 7 : cercle complet (symboles d'objets).
      if (Math.abs(entity.end - entity.start - 2 * Math.PI) < 1e-9) return `<circle cx="${n(entity.centre.x)}" cy="${n(entity.centre.y)}" r="${n(entity.radius)}" data-ref="${entity.ref}"/>`;
      const from = { x: entity.centre.x + entity.radius * Math.cos(entity.start), y: entity.centre.y + entity.radius * Math.sin(entity.start) };
      const to = { x: entity.centre.x + entity.radius * Math.cos(entity.end), y: entity.centre.y + entity.radius * Math.sin(entity.end) };
      const sweep = ((entity.end - entity.start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      return `<path d="M${n(from.x)},${n(from.y)} A${n(entity.radius)},${n(entity.radius)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${n(to.x)},${n(to.y)}" data-ref="${entity.ref}"/>`;
    }
    case "text":
      // Texte remis à l'endroit (contre-symétrie locale).
      return `<text transform="translate(${n(entity.at.x)} ${n(entity.at.y)}) scale(1 -1)" stroke="none" data-ref="${entity.ref}">${escape(entity.text)}</text>`;
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
    // Lot 7 : objets (contour et marques, remplissage blanc sous les marques).
    MOBILIER: 'fill="#fffdf7" stroke="#7c5a2b" stroke-width="10" font-size="140" text-anchor="middle"',
    SANITAIRE: 'fill="#f5fbff" stroke="#0e6ba8" stroke-width="10" font-size="140" text-anchor="middle"',
    CUISINE: 'fill="#fbfff5" stroke="#3d7a1e" stroke-width="10" font-size="140" text-anchor="middle"',
    TECHNIQUE: 'fill="#fff7f5" stroke="#b3261e" stroke-width="10" font-size="140" text-anchor="middle"',
  };
  const body = ["PIECES", "MOBILIER", "SANITAIRE", "CUISINE", "TECHNIQUE", "MURS", "OUVERTURES", "COTES", "PHOTOS"]
    .filter((layer) => layers.has(layer))
    .map((layer) => `<g id="${layer}" ${styles[layer]}>${layers.get(layer)!.join("")}</g>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}mm" height="${n(height)}mm">`
    + `<g transform="translate(${n(margin - bounds.minX)} ${n(bounds.maxY + margin)}) scale(1 -1)">${body}</g></svg>`;
}

// ── Lot 7 : préparation du PDF (mise en page à l'échelle) ─────────────────────

export const PRINT_PAPERS = { A4: { width: 297, height: 210 }, A3: { width: 420, height: 297 } } as const;
export type PrintPaper = keyof typeof PRINT_PAPERS;
/** Échelles usuelles du dessin de bâtiment (1:x). */
export const PRINT_SCALES = [20, 50, 100, 200, 500, 1000] as const;

export type PrintLayout = { paper: PrintPaper; widthMm: number; heightMm: number; scale: number; marginMm: number };

/** Plus grande échelle usuelle à laquelle le plan tient sur la feuille (paysage), marges comprises. */
export function planPrintLayout(document: PlanDocument, paper: PrintPaper = "A3", marginMm = 10): PrintLayout {
  const bounds = planBounds(document);
  const sheet = PRINT_PAPERS[paper];
  const usableW = sheet.width - 2 * marginMm; const usableH = sheet.height - 2 * marginMm;
  const spanW = Math.max(1, bounds.maxX - bounds.minX); const spanH = Math.max(1, bounds.maxY - bounds.minY);
  const scale = PRINT_SCALES.find((value) => spanW / value <= usableW && spanH / value <= usableH) ?? PRINT_SCALES[PRINT_SCALES.length - 1];
  return { paper, widthMm: sheet.width, heightMm: sheet.height, scale, marginMm };
}

/**
 * SVG « prêt à imprimer » : feuille A4 / A3 paysage aux dimensions réelles (mm), plan centré à
 * l'échelle 1:x, cartouche (titre, échelle). Imprimé en PDF par le navigateur sans perte (vectoriel).
 */
export function planToPrintSvg(document: PlanDocument, options: PlanGeometryExportOptions & { paper?: PrintPaper; title?: string } = {}): string {
  const layout = planPrintLayout(document, options.paper ?? "A3");
  const inner = planToSvg(document, { ...options, marginMm: 0 });
  const bounds = planBounds(document);
  const drawW = (bounds.maxX - bounds.minX) / layout.scale; const drawH = (bounds.maxY - bounds.minY) / layout.scale;
  const x = (layout.widthMm - drawW) / 2; const y = (layout.heightMm - drawH) / 2;
  const content = inner.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const title = escape(options.title ?? "Plan");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.widthMm} ${layout.heightMm}" width="${layout.widthMm}mm" height="${layout.heightMm}mm" data-scale="${layout.scale}">`
    + `<g transform="translate(${n(x)} ${n(y)}) scale(${n(1 / layout.scale)})">${content}</g>`
    + `<text x="${layout.widthMm - layout.marginMm}" y="${layout.heightMm - layout.marginMm}" font-size="4" text-anchor="end">${title} — échelle 1:${layout.scale}</text></svg>`;
}
