import type { Arc, Point, Polygon, Polyline } from "./primitives";
import type { ShapeGeometry } from "./shape-model";

export function createPlanTransform(model: ShapeGeometry, width = 760, height = 520, margin = 46) {
  const spanX = Math.max(1, model.bounds.maxX - model.bounds.minX); const spanY = Math.max(1, model.bounds.maxY - model.bounds.minY);
  const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);
  return {
    width, height, scale,
    point: (source: Pick<Point, "x" | "y">) => ({ x: margin + (source.x - model.bounds.minX) * scale, y: height - margin - (source.y - model.bounds.minY) * scale }),
    radius: (value: number) => value * scale,
  };
}

export function createArcPath(arc: Arc, transform: ReturnType<typeof createPlanTransform>) {
  const start = transform.point({ x: arc.centre.x + arc.radius * Math.cos(arc.startAngle), y: arc.centre.y + arc.radius * Math.sin(arc.startAngle) });
  const end = transform.point({ x: arc.centre.x + arc.radius * Math.cos(arc.endAngle), y: arc.centre.y + arc.radius * Math.sin(arc.endAngle) });
  let delta = arc.endAngle - arc.startAngle;
  if (arc.counterClockwise === false && delta > 0) delta -= Math.PI * 2;
  if (arc.counterClockwise !== false && delta < 0) delta += Math.PI * 2;
  // La projection écran inverse Y : le sweep SVG est donc l’inverse du sens métier.
  const sweep = arc.counterClockwise === false ? 1 : 0;
  return `M ${start.x} ${start.y} A ${transform.radius(arc.radius)} ${transform.radius(arc.radius)} 0 ${Math.abs(delta) > Math.PI ? 1 : 0} ${sweep} ${end.x} ${end.y}`;
}

// Ajouts additifs (FIRST-FUNCTIONAL-LOT-V1) : Polyline/Polygon n'existaient pas quand ce fichier
// a été écrit (ENGINE-FOUNDATION-V1). Même convention que createArcPath : un chemin SVG "d",
// jamais de mutation de transform/model.
export function createPolylinePath(polyline: Polyline, transform: ReturnType<typeof createPlanTransform>) {
  if (!polyline.points.length) return "";
  return polyline.points.map((source, index) => { const p = transform.point(source); return `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`; }).join(" ");
}

export function createPolygonPath(polygon: Polygon, transform: ReturnType<typeof createPlanTransform>) {
  if (!polygon.points.length) return "";
  return `${createPolylinePath(polygon, transform)} Z`;
}
