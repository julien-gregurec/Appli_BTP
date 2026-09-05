"use client";

// Composant générique pour le futur module "Tracés & Géométrie" (FIRST-FUNCTIONAL-LOT-V1 §7-9).
// Construit à côté d'AdvancedPlan.tsx (non modifié, non cassé) en réutilisant les mêmes briques
// partagées (createPlanTransform/createArcPath/plan-model.ts) — extraction de logique, pas
// remplacement. Classes CSS dédiées ("trace-viewer-*") pour ne jamais interférer avec le style
// existant d'AdvancedPlan ("plan-*").
import { useMemo, useState } from "react";
import type { SiteStep } from "@/lib/geometry/shape-model";
import type { TraceModel } from "@/lib/geometry/trace-model";
import { createArcPath, createPlanTransform, createPolygonPath, createPolylinePath } from "@/lib/geometry/plan-model";
import { isEntityHighlightedAtStep, isEntityVisibleAtStep } from "@/lib/geometry/trace-render";

export type TraceLayer = "axes" | "construction" | "centers" | "points" | "dimensions" | "shape";

const ALL_LAYERS: readonly { id: TraceLayer; label: string }[] = [
  { id: "axes", label: "Axes" },
  { id: "construction", label: "Construction" },
  { id: "centers", label: "Centres" },
  { id: "points", label: "Points" },
  { id: "dimensions", label: "Cotes" },
  { id: "shape", label: "Tracé final" },
];

function TraceSvg({ model, layers, step }: { model: TraceModel; layers: ReadonlySet<TraceLayer>; step: SiteStep | null }) {
  const transform = useMemo(() => createPlanTransform(model), [model]);
  const p = transform.point;
  const visible = (id: string) => isEntityVisibleAtStep(id, step);
  const highlighted = (id: string) => (isEntityHighlightedAtStep(id, step) ? "highlight" : undefined);

  return (
    <svg className="trace-viewer-svg" viewBox={`0 0 ${transform.width} ${transform.height}`} role="img" aria-label={`Tracé : ${model.name}`}>
      {layers.has("construction") && (
        <g className="trace-construction">
          {model.constructionLines.filter((l) => l.role !== "axis" && visible(l.id)).map((l) => {
            const a = p(l.start); const b = p(l.end);
            return <line key={l.id} id={l.id} className={highlighted(l.id)} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          {model.circles.filter((c) => c.role === "construction" && visible(c.id)).map((c) => {
            const centre = p(c.centre);
            return <circle key={c.id} id={c.id} className={highlighted(c.id)} cx={centre.x} cy={centre.y} r={transform.radius(c.radius)} />;
          })}
        </g>
      )}
      {layers.has("axes") && (
        <g className="trace-axes">
          {model.constructionLines.filter((l) => l.role === "axis" && visible(l.id)).map((l) => {
            const a = p(l.start); const b = p(l.end);
            return <line key={l.id} id={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>
      )}
      {layers.has("shape") && (
        <g className="trace-shape">
          {model.segments.filter((s) => visible(s.id)).map((s) => {
            const a = p(s.start); const b = p(s.end);
            return <line key={s.id} id={s.id} className={highlighted(s.id)} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          {model.arcs.filter((arc) => visible(arc.id)).map((arc) => <path key={arc.id} id={arc.id} className={highlighted(arc.id)} d={createArcPath(arc, transform)} />)}
          {model.circles.filter((c) => c.role !== "construction" && visible(c.id)).map((c) => {
            const centre = p(c.centre);
            return <circle key={c.id} id={c.id} className={highlighted(c.id)} cx={centre.x} cy={centre.y} r={transform.radius(c.radius)} />;
          })}
          {model.ellipses.filter((e) => visible(e.id)).map((e) => {
            const centre = p(e.centre);
            return <ellipse key={e.id} id={e.id} className={highlighted(e.id)} cx={centre.x} cy={centre.y} rx={transform.radius(e.radiusX)} ry={transform.radius(e.radiusY)} transform={e.rotation ? `rotate(${(-e.rotation * 180) / Math.PI} ${centre.x} ${centre.y})` : undefined} />;
          })}
          {(model.polylines ?? []).filter((pl) => visible(pl.id)).map((pl) => <path key={pl.id} id={pl.id} className={highlighted(pl.id)} d={createPolylinePath(pl, transform)} />)}
          {(model.polygons ?? []).filter((pg) => visible(pg.id)).map((pg) => <path key={pg.id} id={pg.id} className={highlighted(pg.id)} d={createPolygonPath(pg, transform)} />)}
        </g>
      )}
      {layers.has("dimensions") && (
        <g className="trace-dimensions">
          {model.dimensions.map((item) => {
            const a = p(item.from); const b = p(item.to);
            const dx = b.x - a.x; const dy = b.y - a.y; const length = Math.hypot(dx, dy) || 1;
            const offsetX = (-dy / length) * (item.offset ?? 18); const offsetY = (dx / length) * (item.offset ?? 18);
            const x1 = a.x + offsetX; const y1 = a.y + offsetY; const x2 = b.x + offsetX; const y2 = b.y + offsetY;
            return (
              <g key={item.id} id={item.id}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} />
                <circle cx={x1} cy={y1} r="2.5" />
                <circle cx={x2} cy={y2} r="2.5" />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7}>{item.label}</text>
              </g>
            );
          })}
        </g>
      )}
      {layers.has("centers") && (
        <g className="trace-centers">
          {model.points.filter((pt) => pt.role === "center").map((pt) => {
            const value = p(pt);
            return (
              <g key={pt.id} id={`center-${pt.id}`}>
                <rect x={value.x - 4.5} y={value.y - 4.5} width={9} height={9} />
                <text x={value.x + 8} y={value.y - 8}>{pt.label ?? pt.id}</text>
              </g>
            );
          })}
        </g>
      )}
      {layers.has("points") && (
        <g className="trace-points">
          {model.points.filter((pt) => pt.role !== "center").map((pt) => {
            const value = p(pt);
            return (
              <g key={pt.id} id={`point-${pt.id}`}>
                <circle cx={value.x} cy={value.y} r="4" />
                <text x={value.x + 7} y={value.y - 7}>{pt.label ?? pt.id}</text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

export function TraceViewer({ model, activeStep = null }: { model: TraceModel; activeStep?: SiteStep | null }) {
  const [zoom, setZoom] = useState(1);
  const [layers, setLayers] = useState<ReadonlySet<TraceLayer>>(() => new Set<TraceLayer>(["shape", "dimensions", "axes", "centers", ...(model.points.length <= 14 ? (["points"] as const) : [])]));

  function toggle(id: TraceLayer) {
    setLayers((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="trace-viewer">
      <div className="trace-viewer-toolbar" aria-label="Réglages du tracé">
        <div className="trace-viewer-layer-toggles" role="group" aria-label="Couches affichées">
          {ALL_LAYERS.map((layer) => (
            <button key={layer.id} type="button" className={layers.has(layer.id) ? "active" : ""} aria-pressed={layers.has(layer.id)} onClick={() => toggle(layer.id)}>
              {layer.label}
            </button>
          ))}
        </div>
        <div className="trace-viewer-zoom-controls">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.65, value - 0.15))} aria-label="Dézoomer">−</button>
          <output>{Math.round(zoom * 100)} %</output>
          <button type="button" onClick={() => setZoom((value) => Math.min(2.2, value + 0.15))} aria-label="Zoomer">+</button>
          <button type="button" onClick={() => setZoom(1)}>Reset</button>
        </div>
      </div>
      {/* overflow:auto + largeur > 100% au zoom = pan par défilement natif, tactile inclus
          (même convention que .plan-viewport pour AdvancedPlan) — pas de logique de glisser
          personnalisée dans ce lot (§9 : reporter si complexité/risque). */}
      <div className="trace-viewer-viewport">
        <div style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? `${zoom * 620}px` : "100%" }}>
          <TraceSvg model={model} layers={layers} step={activeStep} />
        </div>
      </div>
    </div>
  );
}
