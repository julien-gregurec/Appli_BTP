"use client";

/**
 * Rendu SVG d'une scène déjà résolue (§8).
 *
 * Ne connaît NI le moteur géométrique NI un `modelId` : tout arrive par props. Les chemins d'arcs
 * et de contours réutilisent les helpers de rendu existants (`createArcPath`,
 * `createPolylinePath`, `createPolygonPath`), la transformation du viewport ayant volontairement
 * la même forme que `createPlanTransform`.
 *
 * La sélection se limite ici à désigner une entité déjà rendue (événement natif SVG) : le
 * hit-testing géométrique complet — tolérance, priorité, points les plus proches — reste hors lot
 * (§11).
 */

import { createArcPath, createPolygonPath, createPolylinePath } from "@/lib/geometry/plan-model";
import type { ViewportSize, ViewportState } from "@/lib/viewport/viewport-math";
import { createViewportTransform } from "@/lib/viewport/viewport-math";
import type { PlanScene } from "./plan-scene";
import styles from "./viewport.module.css";

export type PlanSceneLayerProps = {
  scene: PlanScene;
  view: ViewportState;
  size: ViewportSize;
  selectedEntityId?: string | null;
  /** Actif seulement en mode Sélection ; sinon le fond garde la priorité au pan. */
  onPickEntity?: (entityId: string) => void;
  showPoints?: boolean;
};

export function PlanSceneLayer({ scene, view, size, selectedEntityId = null, onPickEntity, showPoints = true }: PlanSceneLayerProps) {
  const transform = createViewportTransform(view, size);
  const project = transform.point;
  const selectable = Boolean(onPickEntity);

  const strokeClass = (role: string | undefined, id: string) => {
    const base = role === "construction" ? styles.construction : role === "axis" ? styles.axis : styles.shape;
    return id === selectedEntityId ? `${base} ${styles.selected}` : base;
  };

  // `stopPropagation` : sans cela, le clic remonterait au fond du viewport et désélectionnerait
  // aussitôt l'entité qui vient d'être désignée.
  const pick = (id: string) =>
    onPickEntity
      ? (event: React.MouseEvent) => {
          event.stopPropagation();
          onPickEntity(id);
        }
      : undefined;

  return (
    <g>
      {(scene.polygons ?? []).map((polygon) => {
        const d = createPolygonPath(polygon, transform);
        return (
          <g key={polygon.id}>
            <path className={strokeClass(polygon.role, polygon.id)} d={d} />
            {selectable && <path className={styles.hitArea} d={d} onClick={pick(polygon.id)} />}
          </g>
        );
      })}

      {(scene.polylines ?? []).map((polyline) => {
        const d = createPolylinePath(polyline, transform);
        return (
          <g key={polyline.id}>
            <path className={strokeClass(polyline.role, polyline.id)} d={d} />
            {selectable && <path className={styles.hitArea} d={d} onClick={pick(polyline.id)} />}
          </g>
        );
      })}

      {(scene.segments ?? []).map((segment) => {
        const start = project(segment.start);
        const end = project(segment.end);
        return (
          <g key={segment.id}>
            <line className={strokeClass(segment.role, segment.id)} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
            {selectable && (
              <line className={styles.hitArea} x1={start.x} y1={start.y} x2={end.x} y2={end.y} onClick={pick(segment.id)} />
            )}
          </g>
        );
      })}

      {(scene.arcs ?? []).map((arc) => {
        const d = createArcPath(arc, transform);
        return (
          <g key={arc.id}>
            <path className={strokeClass(arc.role, arc.id)} d={d} />
            {selectable && <path className={styles.hitArea} d={d} onClick={pick(arc.id)} />}
          </g>
        );
      })}

      {(scene.circles ?? []).map((circle) => {
        const centre = project(circle.centre);
        const radius = transform.radius(circle.radius);
        return (
          <g key={circle.id}>
            <circle className={strokeClass(circle.role, circle.id)} cx={centre.x} cy={centre.y} r={radius} />
            {selectable && <circle className={styles.hitArea} cx={centre.x} cy={centre.y} r={radius} onClick={pick(circle.id)} />}
          </g>
        );
      })}

      {(scene.ellipses ?? []).map((ellipse) => {
        const centre = project(ellipse.centre);
        const rotation = ellipse.rotation ? `rotate(${(-ellipse.rotation * 180) / Math.PI} ${centre.x} ${centre.y})` : undefined;
        return (
          <g key={ellipse.id} transform={rotation}>
            <ellipse
              className={strokeClass(ellipse.role, ellipse.id)}
              cx={centre.x}
              cy={centre.y}
              rx={transform.radius(ellipse.radiusX)}
              ry={transform.radius(ellipse.radiusY)}
            />
            {selectable && (
              <ellipse
                className={styles.hitArea}
                cx={centre.x}
                cy={centre.y}
                rx={transform.radius(ellipse.radiusX)}
                ry={transform.radius(ellipse.radiusY)}
                onClick={pick(ellipse.id)}
              />
            )}
          </g>
        );
      })}

      {showPoints &&
        (scene.points ?? []).map((item) => {
          const position = project(item);
          const isCenter = item.role === "center";
          const isSelected = item.id === selectedEntityId;
          return (
            <g key={`point-${item.id}`}>
              {isCenter ? (
                <rect
                  className={isSelected ? `${styles.centerMark} ${styles.selected}` : styles.centerMark}
                  x={position.x - 5}
                  y={position.y - 5}
                  width={10}
                  height={10}
                />
              ) : (
                <circle
                  className={isSelected ? `${styles.pointMark} ${styles.selected}` : styles.pointMark}
                  cx={position.x}
                  cy={position.y}
                  r={4}
                />
              )}
              {item.label && (
                <text className={styles.pointLabel} x={position.x + 8} y={position.y - 8}>
                  {item.label}
                </text>
              )}
              {selectable && <circle className={styles.hitArea} cx={position.x} cy={position.y} r={2} onClick={pick(item.id)} />}
            </g>
          );
        })}
    </g>
  );
}
