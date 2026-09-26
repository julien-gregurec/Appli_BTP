"use client";

import { useMemo, useState } from "react";
import type { ShapeGeometry, ShapeLayer } from "@/lib/geometry/shape-model";
import { createArcPath, createPlanTransform } from "@/lib/geometry/plan-model";

const ALL_LAYERS: readonly { id: ShapeLayer; label: string }[] = [
  { id: "shape", label: "Forme" }, { id: "construction", label: "Construction" }, { id: "dimensions", label: "Cotes" },
  { id: "axes", label: "Axes" }, { id: "points", label: "Points" }, { id: "labels", label: "Labels" },
];

function PlanSvg({ model, layers }: { model: ShapeGeometry; layers: ReadonlySet<ShapeLayer> }) {
  const transform = useMemo(() => createPlanTransform(model), [model]);
  const p = transform.point;
  return <svg className="advanced-plan-svg" viewBox={`0 0 ${transform.width} ${transform.height}`} role="img" aria-label={`Plan coté : ${model.name}`}>
    {layers.has("construction") && <g className="plan-construction">{model.constructionLines.filter((line) => line.role !== "axis").map((line) => { const a = p(line.start); const b = p(line.end); return <line key={line.id} id={line.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}{model.circles.filter((circle) => circle.role === "construction").map((circle) => { const c = p(circle.centre); return <circle key={circle.id} id={circle.id} cx={c.x} cy={c.y} r={transform.radius(circle.radius)} />; })}</g>}
    {layers.has("axes") && <g className="plan-axes">{model.constructionLines.filter((line) => line.role === "axis").map((line) => { const a = p(line.start); const b = p(line.end); return <line key={line.id} id={line.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}</g>}
    {layers.has("shape") && <g className="plan-shape">
      {model.segments.map((line) => { const a = p(line.start); const b = p(line.end); return <line key={line.id} id={line.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />; })}
      {model.arcs.map((arc) => <path key={arc.id} id={arc.id} d={createArcPath(arc, transform)} />)}
      {model.circles.filter((circle) => circle.role !== "construction").map((circle) => { const c = p(circle.centre); return <circle key={circle.id} id={circle.id} cx={c.x} cy={c.y} r={transform.radius(circle.radius)} />; })}
      {model.ellipses.map((ellipse) => { const c = p(ellipse.centre); return <ellipse key={ellipse.id} id={ellipse.id} cx={c.x} cy={c.y} rx={transform.radius(ellipse.radiusX)} ry={transform.radius(ellipse.radiusY)} transform={ellipse.rotation ? `rotate(${-ellipse.rotation * 180 / Math.PI} ${c.x} ${c.y})` : undefined} />; })}
    </g>}
    {layers.has("dimensions") && <g className="plan-dimensions">{model.dimensions.map((item) => { const a = p(item.from); const b = p(item.to); const dx = b.x - a.x; const dy = b.y - a.y; const length = Math.hypot(dx, dy) || 1; const offsetX = -dy / length * (item.offset ?? 18); const offsetY = dx / length * (item.offset ?? 18); const x1 = a.x + offsetX; const y1 = a.y + offsetY; const x2 = b.x + offsetX; const y2 = b.y + offsetY; return <g key={item.id} id={item.id}><line x1={x1} y1={y1} x2={x2} y2={y2} /><circle cx={x1} cy={y1} r="2.5" /><circle cx={x2} cy={y2} r="2.5" />{layers.has("labels") && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7}>{item.label}</text>}</g>; })}</g>}
    {layers.has("points") && <g className="plan-points">{model.points.map((item) => { const value = p(item); return <g key={item.id} id={`point-${item.id}`}><circle cx={value.x} cy={value.y} r="4" />{layers.has("labels") && <text x={value.x + 7} y={value.y - 7}>{item.label ?? item.id}</text>}</g>; })}</g>}
  </svg>;
}

export function AdvancedPlan({ model }: { model: ShapeGeometry }) {
  const [zoom, setZoom] = useState(1); const [layers, setLayers] = useState<ReadonlySet<ShapeLayer>>(() => new Set<ShapeLayer>(["shape", "dimensions", "axes", "labels", ...(model.points.length <= 12 ? ["points" as const] : [])]));
  function toggle(id: ShapeLayer) { setLayers((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  return <div className="advanced-plan">
    <div className="plan-toolbar" aria-label="Réglages du plan"><div className="layer-toggles">{ALL_LAYERS.map((layer) => <button key={layer.id} type="button" className={layers.has(layer.id) ? "active" : ""} aria-pressed={layers.has(layer.id)} onClick={() => toggle(layer.id)}>{layer.label}</button>)}</div><div className="zoom-controls"><button type="button" onClick={() => setZoom((value) => Math.max(.65, value - .15))} aria-label="Dézoomer">−</button><output>{Math.round(zoom * 100)} %</output><button type="button" onClick={() => setZoom((value) => Math.min(2.2, value + .15))} aria-label="Zoomer">+</button><button type="button" onClick={() => setZoom(1)}>Reset</button></div></div>
    <div className="plan-viewport"><div style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? `${zoom * 760}px` : "100%" }}><PlanSvg model={model} layers={layers} /></div></div>
  </div>;
}
