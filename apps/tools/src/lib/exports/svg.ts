/**
 * §14 — Export SVG vectoriel.
 *
 * Deux sorties distinctes, jamais confondues :
 *   - `renderPlanSvg`      : plan de lecture ajusté à une zone de 1000 × 720 (sans unité
 *                            physique). Les entités sont regroupées en calques nommés
 *                            (`elsatia-construction`, `elsatia-final`, …) alignés sur la
 *                            convention de calques DXF déjà en place (§17), pour rester
 *                            exploitable dans Illustrator / Inkscape / QCAD.
 *   - `renderFullScaleSvg` : gabarit vectoriel en dimensions réelles (`width="…mm"`), sans
 *                            aucune mise à l'échelle. C'est le seul des deux qui peut être
 *                            imprimé ou usiné comme un 1:1.
 *
 * Aucun raster n'est incorporé dans l'un ni dans l'autre.
 */

import { createArcPath, createPlanTransform, createPolygonPath, createPolylinePath } from "../geometry/plan-model";
import type { ShapeGeometry } from "../geometry/shape-model";
import { describeDisplayScale } from "../chantier/print-scale";
import { PRINT_INSTRUCTION } from "../chantier/print-safety";
import type { ProjectDocument } from "./document";

export type SvgExportOptions = { mode: "complete" | "shape-only" | "construction"; includeLegend?: boolean };
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const number = (value: number) => Number(value.toFixed(3));

function line(id: string, a: { x: number; y: number }, b: { x: number; y: number }, className: string) { return `<line id="${escape(id)}" class="${className}" x1="${number(a.x)}" y1="${number(a.y)}" x2="${number(b.x)}" y2="${number(b.y)}"/>`; }

/** Calques SVG, alignés sur la convention de calques DXF déjà en place (§17). */
export const SVG_LAYERS = ["elsatia-construction", "elsatia-final", "elsatia-cotations", "elsatia-annotations"] as const;
export type SvgLayer = (typeof SVG_LAYERS)[number];

const LAYER_TITLES: Record<SvgLayer, string> = {
  "elsatia-construction": "Construction",
  "elsatia-final": "Contour final",
  "elsatia-cotations": "Cotations",
  "elsatia-annotations": "Annotations",
};

/** Regroupe les entités par calque et n'émet que les calques réellement peuplés. */
function renderLayers(buckets: Record<SvgLayer, string[]>): string {
  return SVG_LAYERS.filter((layer) => buckets[layer].length)
    .map((layer) => `<g id="${layer}" data-layer="${layer}" aria-label="${escape(LAYER_TITLES[layer])}">${buckets[layer].join("")}</g>`)
    .join("");
}

const emptyBuckets = (): Record<SvgLayer, string[]> => ({
  "elsatia-construction": [],
  "elsatia-final": [],
  "elsatia-cotations": [],
  "elsatia-annotations": [],
});

export function renderPlanSvg(model: ShapeGeometry, title: string, options: SvgExportOptions = { mode: "complete", includeLegend: true }) {
  const width = 1000; const height = 720; const transform = createPlanTransform(model, width, height, 70); const p = transform.point;
  const showConstruction = options.mode !== "shape-only"; const showDetails = options.mode === "complete";
  const buckets = emptyBuckets();
  const construction = buckets["elsatia-construction"];
  const final = buckets["elsatia-final"];
  if (showConstruction) {
    for (const item of model.constructionLines) construction.push(line(item.id, p(item.start), p(item.end), item.role === "axis" ? "axis" : "construction"));
    for (const item of model.circles.filter((circle) => circle.role === "construction")) { const centre = p(item.centre); construction.push(`<circle id="${escape(item.id)}" class="construction" cx="${number(centre.x)}" cy="${number(centre.y)}" r="${number(transform.radius(item.radius))}"/>`); }
  }
  for (const item of model.segments) final.push(line(item.id, p(item.start), p(item.end), "shape"));
  for (const item of model.arcs) final.push(`<path id="${escape(item.id)}" class="shape" d="${createArcPath(item, transform)}"/>`);
  for (const item of model.circles.filter((circle) => circle.role !== "construction")) { const centre = p(item.centre); final.push(`<circle id="${escape(item.id)}" class="shape" cx="${number(centre.x)}" cy="${number(centre.y)}" r="${number(transform.radius(item.radius))}"/>`); }
  for (const item of model.ellipses) { const centre = p(item.centre); final.push(`<ellipse id="${escape(item.id)}" class="shape" cx="${number(centre.x)}" cy="${number(centre.y)}" rx="${number(transform.radius(item.radiusX))}" ry="${number(transform.radius(item.radiusY))}"/>`); }
  for (const item of model.polylines ?? []) final.push(`<path id="${escape(item.id)}" class="shape" d="${createPolylinePath(item, transform)}"/>`);
  for (const item of model.polygons ?? []) final.push(`<path id="${escape(item.id)}" class="shape" d="${createPolygonPath(item, transform)}"/>`);
  if (showDetails) {
    for (const item of model.dimensions) { const a = p(item.from); const b = p(item.to); const midX = (a.x + b.x) / 2; const midY = (a.y + b.y) / 2 - 10; buckets["elsatia-cotations"].push(`<g id="${escape(item.id)}" class="dimension">${line(`${item.id}-line`, a, b, "dimension-line")}<text x="${number(midX)}" y="${number(midY)}">${escape(item.label)}</text></g>`); }
    for (const item of model.points) { const value = p(item); buckets["elsatia-annotations"].push(`<g id="point-${escape(item.id)}" class="point"><circle cx="${number(value.x)}" cy="${number(value.y)}" r="4"/><text x="${number(value.x + 8)}" y="${number(value.y - 8)}">${escape(item.label ?? item.id)}</text></g>`); }
  }
  // L'échelle réellement appliquée est inscrite dans les métadonnées : ce fichier n'est
  // pas à l'échelle 1:1 et ne doit pas être mesuré (§6).
  const scale = describeDisplayScale(transform.scale);
  const metadata = escape(JSON.stringify({ generator: "ELSATIA Tools", modelId: model.id, unit: "mm", scale: scale.label, scaleKind: scale.kind, fullScale: false, warning: "Schéma coté - ne pas mesurer directement sur le plan" }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="720" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}" data-elsatia-scale="${escape(scale.label)}" data-elsatia-full-scale="false"><title>${escape(title)}</title><desc>${escape(scale.caption)}</desc><metadata>${metadata}</metadata><style>.shape{fill:none;stroke:#17303f;stroke-width:2.5}.construction{fill:none;stroke:#89979d;stroke-width:1.2;stroke-dasharray:7 6}.axis{stroke:#c88a22;stroke-width:1.1;stroke-dasharray:12 5 2 5}.dimension-line{stroke:#a56500;stroke-width:1.2}.dimension text,.point text{font:12px Arial,sans-serif;fill:#435861}.point circle{fill:#f5aa22;stroke:#17303f}</style>${renderLayers(buckets)}${options.includeLegend ? `<text x="70" y="690" font-family="Arial" font-size="12" fill="#53656f">ELSATIA Tools - Schéma coté - utiliser les valeurs numériques, ne pas mesurer directement sur le plan.</text>` : ""}</svg>`;
}

export type FullScaleSvgOptions = {
  /** Marge ajoutée autour de l'emprise du motif, en millimètres réels. */
  marginMm?: number;
  includeConstruction?: boolean;
};

/**
 * §14 — Gabarit vectoriel en dimensions réelles : 1 unité SVG = 1 mm, `width`/`height` en
 * millimètres physiques, aucune mise à l'échelle. Contrairement à `renderPlanSvg`, ce
 * fichier peut légitimement être annoncé comme 1:1 — à condition d'être imprimé à 100 %.
 */
export function renderFullScaleSvg(model: ShapeGeometry, title: string, options: FullScaleSvgOptions = {}): string {
  const marginMm = options.marginMm ?? 10;
  if (!Number.isFinite(marginMm) || marginMm < 0) throw new Error("La marge du gabarit SVG doit être positive.");
  const { minX, minY, maxX, maxY } = model.bounds;
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) throw new Error("L'emprise du modèle contient des coordonnées non finies.");
  const contentWidthMm = maxX - minX;
  const contentHeightMm = maxY - minY;
  if (contentWidthMm <= 0 || contentHeightMm <= 0) throw new Error("L'emprise du modèle est vide : aucun gabarit 1:1 ne peut en être tiré.");

  const widthMm = contentWidthMm + marginMm * 2;
  const heightMm = contentHeightMm + marginMm * 2;
  // Repère chantier : Y vers le haut. Le SVG ayant Y vers le bas, on projette explicitement.
  const p = (source: { x: number; y: number }) => ({ x: marginMm + (source.x - minX), y: marginMm + (maxY - source.y) });

  const buckets = emptyBuckets();
  const final = buckets["elsatia-final"];
  if (options.includeConstruction) {
    for (const item of model.constructionLines) buckets["elsatia-construction"].push(line(item.id, p(item.start), p(item.end), item.role === "axis" ? "axis" : "construction"));
  }
  for (const item of model.segments) final.push(line(item.id, p(item.start), p(item.end), "shape"));
  for (const item of model.circles.filter((circle) => circle.role !== "construction")) { const centre = p(item.centre); final.push(`<circle id="${escape(item.id)}" class="shape" cx="${number(centre.x)}" cy="${number(centre.y)}" r="${number(item.radius)}"/>`); }
  for (const item of model.ellipses) { const centre = p(item.centre); final.push(`<ellipse id="${escape(item.id)}" class="shape" cx="${number(centre.x)}" cy="${number(centre.y)}" rx="${number(item.radiusX)}" ry="${number(item.radiusY)}"/>`); }
  for (const item of model.arcs) {
    // Arc échantillonné : le format SVG accepterait un arc exact, mais l'échantillonnage
    // partagé avec le PDF garantit un tracé strictement identique entre les deux sorties.
    let delta = item.endAngle - item.startAngle;
    if (item.counterClockwise === false && delta > 0) delta -= Math.PI * 2;
    if (item.counterClockwise !== false && delta < 0) delta += Math.PI * 2;
    const steps = Math.max(24, Math.ceil(Math.abs(delta) / (Math.PI / 36)));
    const path: string[] = [];
    for (let index = 0; index <= steps; index++) {
      const angle = item.startAngle + (delta * index) / steps;
      const point = p({ x: item.centre.x + item.radius * Math.cos(angle), y: item.centre.y + item.radius * Math.sin(angle) });
      path.push(`${index === 0 ? "M" : "L"} ${number(point.x)} ${number(point.y)}`);
    }
    final.push(`<path id="${escape(item.id)}" class="shape" d="${path.join(" ")}"/>`);
  }
  for (const item of model.polylines ?? []) final.push(`<path id="${escape(item.id)}" class="shape" d="${item.points.map((source, index) => { const v = p(source); return `${index === 0 ? "M" : "L"} ${number(v.x)} ${number(v.y)}`; }).join(" ")}"/>`);
  for (const item of model.polygons ?? []) final.push(`<path id="${escape(item.id)}" class="shape" d="${item.points.map((source, index) => { const v = p(source); return `${index === 0 ? "M" : "L"} ${number(v.x)} ${number(v.y)}`; }).join(" ")} Z"/>`);

  const metadata = escape(JSON.stringify({ generator: "ELSATIA Tools", modelId: model.id, unit: "mm", scale: "1:1", fullScale: true, widthMm: number(widthMm), heightMm: number(heightMm), instruction: PRINT_INSTRUCTION }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${number(widthMm)}mm" height="${number(heightMm)}mm" viewBox="0 0 ${number(widthMm)} ${number(heightMm)}" role="img" aria-label="${escape(title)}" data-elsatia-scale="1:1" data-elsatia-full-scale="true"><title>${escape(title)}</title><desc>${escape(`Gabarit 1:1 - dimensions reelles. ${PRINT_INSTRUCTION}`)}</desc><metadata>${metadata}</metadata><style>.shape{fill:none;stroke:#17303f;stroke-width:.5}.construction{fill:none;stroke:#89979d;stroke-width:.3;stroke-dasharray:4 3}.axis{stroke:#c88a22;stroke-width:.3;stroke-dasharray:6 3 1 3}</style>${renderLayers(buckets)}</svg>`;
}

export function exportProjectSvg(document: ProjectDocument, options?: SvgExportOptions) { return renderPlanSvg(document.execution.geometry, `${document.project.name} - ${document.tool.name}`, options); }
