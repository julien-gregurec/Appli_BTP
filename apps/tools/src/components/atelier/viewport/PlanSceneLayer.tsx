"use client";

/**
 * Rendu SVG d'une scène déjà résolue (§8).
 *
 * Ne connaît NI le moteur géométrique NI un `modelId` : tout arrive par props. Les chemins d'arcs
 * et de contours réutilisent les helpers de rendu existants (`createArcPath`,
 * `createPolylinePath`, `createPolygonPath`), la transformation du viewport ayant volontairement
 * la même forme que `createPlanTransform`.
 *
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §7/§9 : la désignation ne passe plus par des zones de clic
 * SVG invisibles mais par le hit-test géométrique, mené au niveau du viewport sur le point monde
 * du clic. Ce composant n'a donc plus de gestionnaire d'évènement du tout — il ne fait que
 * DESSINER, y compris l'état de survol, de sélection et le point d'accrochage proposé, qui lui
 * arrivent en props. Une zone de clic invisible par entité ne saurait de toute façon pas
 * appliquer une tolérance en pixels ni une priorité entre entités superposées.
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
  /**
   * Entité ACTIVE — celle que le panneau propriétés détaille et que le cycle fait avancer.
   * Toujours l'un des `selectedEntityIds` quand la multisélection est utilisée.
   */
  selectedEntityId?: string | null;
  /**
   * ATELIER-INTERSECTIONS-MULTISELECT-V1 §11 — toutes les entités retenues. Omise, le rendu
   * est exactement celui d'avant ce lot : seule l'entité active est mise en évidence.
   */
  selectedEntityIds?: readonly string[];
  /** Entité survolée, désignée par le hit-test géométrique (§9). Desktop uniquement. */
  hoveredEntityId?: string | null;
  /** Point d'accrochage proposé sous le pointeur, en coordonnées monde (§9). */
  snapPoint?: { x: number; y: number } | null;
  /**
   * Nature de l'accrochage proposé (§11). Une intersection reçoit un marqueur légèrement
   * différent : c'est le seul accrochage qui ne corresponde à aucun point dessiné du modèle,
   * donc le seul qu'on puisse croire inventé si rien ne le distingue.
   */
  snapIsIntersection?: boolean;
  showPoints?: boolean;
};

/** Référence stable pour « pas de multisélection » — évite de périmer les mémos à chaque trame. */
const NO_SELECTION: readonly string[] = [];

export function PlanSceneLayer({
  scene,
  view,
  size,
  selectedEntityId = null,
  selectedEntityIds = NO_SELECTION,
  hoveredEntityId = null,
  snapPoint = null,
  snapIsIntersection = false,
  showPoints = true,
}: PlanSceneLayerProps) {
  const transform = createViewportTransform(view, size);
  const project = transform.point;

  /**
   * §11 — trois niveaux, jamais plus : entité active (ambre épais), entité retenue parmi
   * d'autres (ambre plus discret), entité survolée. Empiler un quatrième état rendrait un
   * plan dense illisible, ce qui est exactement ce qu'on cherche à éviter en le sélectionnant.
   */
  const selectionClass = (id: string): string | null => {
    if (id === selectedEntityId) return styles.selected;
    if (selectedEntityIds.includes(id)) return styles.coselected;
    if (id === hoveredEntityId) return styles.hovered;
    return null;
  };

  const strokeClass = (role: string | undefined, id: string) => {
    const base = role === "construction" ? styles.construction : role === "axis" ? styles.axis : styles.shape;
    // La sélection l'emporte sur le survol : survoler l'entité déjà retenue ne doit pas la
    // faire changer d'apparence, sans quoi on croirait avoir perdu la sélection.
    const state = selectionClass(id);
    return state ? `${base} ${state}` : base;
  };

  const markClass = (id: string, base: string) => {
    const state = selectionClass(id);
    return state ? `${base} ${state}` : base;
  };

  return (
    <g>
      {(scene.polygons ?? []).map((polygon) => {
        const d = createPolygonPath(polygon, transform);
        return (
          <g key={polygon.id}>
            <path className={strokeClass(polygon.role, polygon.id)} d={d} />
          </g>
        );
      })}

      {(scene.polylines ?? []).map((polyline) => {
        const d = createPolylinePath(polyline, transform);
        return (
          <g key={polyline.id}>
            <path className={strokeClass(polyline.role, polyline.id)} d={d} />
          </g>
        );
      })}

      {/* Traits de construction d'abord : ils passent sous la forme, comme au trace reel. */}
      {[
        ...(scene.constructionLines ?? []).map((item) => ({ item, role: item.role ?? "construction" })),
        ...(scene.segments ?? []).map((item) => ({ item, role: item.role })),
      ].map(({ item: segment, role }) => {
        const start = project(segment.start);
        const end = project(segment.end);
        return (
          <g key={segment.id}>
            <line className={strokeClass(role, segment.id)} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
          </g>
        );
      })}

      {(scene.arcs ?? []).map((arc) => {
        const d = createArcPath(arc, transform);
        return (
          <g key={arc.id}>
            <path className={strokeClass(arc.role, arc.id)} d={d} />
          </g>
        );
      })}

      {(scene.circles ?? []).map((circle) => {
        const centre = project(circle.centre);
        const radius = transform.radius(circle.radius);
        return (
          <g key={circle.id}>
            <circle className={strokeClass(circle.role, circle.id)} cx={centre.x} cy={centre.y} r={radius} />
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
          </g>
        );
      })}

      {showPoints &&
        (scene.points ?? []).map((item) => {
          const position = project(item);
          const isCenter = item.role === "center";
          return (
            <g key={`point-${item.id}`}>
              {isCenter ? (
                <rect
                  className={markClass(item.id, styles.centerMark)}
                  x={position.x - 5}
                  y={position.y - 5}
                  width={10}
                  height={10}
                />
              ) : (
                <circle className={markClass(item.id, styles.pointMark)} cx={position.x} cy={position.y} r={4} />
              )}
              {item.label && (
                <text className={styles.pointLabel} x={position.x + 8} y={position.y - 8}>
                  {item.label}
                </text>
              )}
            </g>
          );
        })}

      {/* Point d'accrochage proposé (§9) : une croix légère, jamais une entité de la scène. */}
      {snapPoint &&
        (() => {
          const marker = project(snapPoint);
          // Croix DROITE pour un point du modèle, croix EN X pour une intersection (§11) :
          // la forme suffit à dire « ce point est calculé, il n'est pas dessiné », sans
          // ajouter ni couleur ni étiquette sur un plan déjà chargé.
          const arm = snapIsIntersection ? 5 : 7;
          return (
            <g
              className={snapIsIntersection ? `${styles.snapMark} ${styles.snapIntersection}` : styles.snapMark}
              aria-hidden="true"
            >
              {snapIsIntersection ? (
                <>
                  <line x1={marker.x - arm} y1={marker.y - arm} x2={marker.x + arm} y2={marker.y + arm} />
                  <line x1={marker.x - arm} y1={marker.y + arm} x2={marker.x + arm} y2={marker.y - arm} />
                </>
              ) : (
                <>
                  <line x1={marker.x - arm} y1={marker.y} x2={marker.x + arm} y2={marker.y} />
                  <line x1={marker.x} y1={marker.y - arm} x2={marker.x} y2={marker.y + arm} />
                </>
              )}
              <circle cx={marker.x} cy={marker.y} r={3.5} />
            </g>
          );
        })()}
    </g>
  );
}
