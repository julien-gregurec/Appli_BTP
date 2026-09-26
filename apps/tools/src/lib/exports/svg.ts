import { createArcPath, createPlanTransform, createPolygonPath, createPolylinePath } from "../geometry/plan-model";
import type { ShapeGeometry } from "../geometry/shape-model";
import type { ProjectDocument } from "./document";

export type SvgExportOptions = { mode: "complete" | "shape-only" | "construction"; includeLegend?: boolean };
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const number = (value: number) => Number(value.toFixed(3));

function line(id: string, a: { x: number; y: number }, b: { x: number; y: number }, className: string) { return `<line id="${escape(id)}" class="${className}" x1="${number(a.x)}" y1="${number(a.y)}" x2="${number(b.x)}" y2="${number(b.y)}"/>`; }

export function renderPlanSvg(model: ShapeGeometry, title: string, options: SvgExportOptions = { mode: "complete", includeLegend: true }) {
  const width = 1000; const height = 720; const transform = createPlanTransform(model, width, height, 70); const p = transform.point;
  const showConstruction = options.mode !== "shape-only"; const showDetails = options.mode === "complete";
  const parts: string[] = [];
  if (showConstruction) {
    for (const item of model.constructionLines) parts.push(line(item.id, p(item.start), p(item.end), item.role === "axis" ? "axis" : "construction"));
    for (const item of model.circles.filter((circle) => circle.role === "construction")) { const centre = p(item.centre); parts.push(`<circle id="${escape(item.id)}" class="construction" cx="${number(centre.x)}" cy="${number(centre.y)}" r="${number(transform.radius(item.radius))}"/>`); }
  }
  for (const item of model.segments) parts.push(line(item.id, p(item.start), p(item.end), "shape"));
  for (const item of model.arcs) parts.push(`<path id="${escape(item.id)}" class="shape" d="${createArcPath(item, transform)}"/>`);
  for (const item of model.circles.filter((circle) => circle.role !== "construction")) { const centre = p(item.centre); parts.push(`<circle id="${escape(item.id)}" class="shape" cx="${number(centre.x)}" cy="${number(centre.y)}" r="${number(transform.radius(item.radius))}"/>`); }
  for (const item of model.ellipses) { const centre = p(item.centre); parts.push(`<ellipse id="${escape(item.id)}" class="shape" cx="${number(centre.x)}" cy="${number(centre.y)}" rx="${number(transform.radius(item.radiusX))}" ry="${number(transform.radius(item.radiusY))}"/>`); }
  for (const item of model.polylines ?? []) parts.push(`<path id="${escape(item.id)}" class="shape" d="${createPolylinePath(item, transform)}"/>`);
  for (const item of model.polygons ?? []) parts.push(`<path id="${escape(item.id)}" class="shape" d="${createPolygonPath(item, transform)}"/>`);
  if (showDetails) {
    for (const item of model.dimensions) { const a = p(item.from); const b = p(item.to); const midX = (a.x + b.x) / 2; const midY = (a.y + b.y) / 2 - 10; parts.push(`<g id="${escape(item.id)}" class="dimension">${line(`${item.id}-line`, a, b, "dimension-line")}<text x="${number(midX)}" y="${number(midY)}">${escape(item.label)}</text></g>`); }
    for (const item of model.points) { const value = p(item); parts.push(`<g id="point-${escape(item.id)}" class="point"><circle cx="${number(value.x)}" cy="${number(value.y)}" r="4"/><text x="${number(value.x + 8)}" y="${number(value.y - 8)}">${escape(item.label ?? item.id)}</text></g>`); }
  }
  const metadata = escape(JSON.stringify({ generator: "ELSATIA Tools", modelId: model.id, unit: "mm", warning: "Schéma coté - ne pas mesurer directement sur le plan" }));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="720" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><metadata>${metadata}</metadata><style>.shape{fill:none;stroke:#17303f;stroke-width:2.5}.construction{fill:none;stroke:#89979d;stroke-width:1.2;stroke-dasharray:7 6}.axis{stroke:#c88a22;stroke-width:1.1;stroke-dasharray:12 5 2 5}.dimension-line{stroke:#a56500;stroke-width:1.2}.dimension text,.point text{font:12px Arial,sans-serif;fill:#435861}.point circle{fill:#f5aa22;stroke:#17303f}</style>${parts.join("")}${options.includeLegend ? `<text x="70" y="690" font-family="Arial" font-size="12" fill="#53656f">ELSATIA Tools - Schéma coté - utiliser les valeurs numériques, ne pas mesurer directement sur le plan.</text>` : ""}</svg>`;
}

export function exportProjectSvg(document: ProjectDocument, options?: SvgExportOptions) { return renderPlanSvg(document.execution.geometry, `${document.project.name} - ${document.tool.name}`, options); }
