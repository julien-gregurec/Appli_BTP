"use client";

/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §3 — rendu des poignées d'édition.
 *
 * Comme `PlanSceneLayer`, ce composant DESSINE et rien d'autre : pas un gestionnaire
 * d'évènement, pas une zone de clic. La saisie passe par le hit-test géométrique du
 * workspace, seul endroit qui connaisse à la fois le pixel et le millimètre — une cible DOM
 * par poignée ne saurait appliquer ni tolérance en pixels ni départage entre poignées
 * voisines, et donnerait au doigt une zone de prise de la taille du dessin.
 *
 * Quatre états distingués (§3), par la forme AVANT la couleur :
 *
 * | état | forme |
 * | ---- | ----- |
 * | éditable | disque clair cerclé d'ambre |
 * | lecture seule | petit losange gris, sans remplissage |
 * | sélectionnée | disque ambre plein, cerclé |
 * | en cours de glissement | disque ambre plein + guide de contrainte |
 *
 * Distinguer par la forme et pas seulement par la teinte, c'est ce qui rend l'état lisible en
 * plein soleil sur un chantier, et lisible tout court pour un daltonien.
 *
 * Le guide de contrainte n'apparaît QUE sur la poignée tenue. Affiché en permanence, il
 * couvrirait le tracé de cercles et d'axes — or le plan doit rester le sujet (§3).
 */

import type { EditableHandle } from "@/lib/tracing/editable-handle";
import type { ViewportSize, ViewportState } from "@/lib/viewport/viewport-math";
import { createViewportTransform } from "@/lib/viewport/viewport-math";
import styles from "./viewport.module.css";

export type HandleLayerProps = {
  handles: readonly EditableHandle[];
  view: ViewportState;
  size: ViewportSize;
  /** Poignée tenue par le pointeur, s'il y en a une. */
  activeHandleId?: string | null;
  /** Entité désignée : une poignée dont le point est sélectionné se met en avant. */
  selectedEntityId?: string | null;
};

/** Rayon à l'écran des marques, en pixels — indépendant du zoom, comme la tolérance (§2). */
const EDITABLE_RADIUS_PX = 6.5;
const ACTIVE_RADIUS_PX = 8.5;
const READONLY_RADIUS_PX = 3.5;

export function HandleLayer({ handles, view, size, activeHandleId = null, selectedEntityId = null }: HandleLayerProps) {
  const transform = createViewportTransform(view, size);
  const project = transform.point;
  const active = handles.find((handle) => handle.id === activeHandleId) ?? null;

  return (
    <g>
      {active && <ConstraintGuide handle={active} transform={transform} size={size} />}

      {handles.map((handle) => {
        const centre = project(handle.position);

        if (!handle.editable) {
          const r = READONLY_RADIUS_PX;
          return (
            <polygon
              key={handle.id}
              className={styles.handleLocked}
              points={`${centre.x},${centre.y - r} ${centre.x + r},${centre.y} ${centre.x},${centre.y + r} ${centre.x - r},${centre.y}`}
            />
          );
        }

        const isActive = handle.id === activeHandleId;
        const isSelected = handle.entityId === selectedEntityId;
        const className = isActive
          ? `${styles.handle} ${styles.handleActive}`
          : isSelected
            ? `${styles.handle} ${styles.handleSelected}`
            : styles.handle;

        return (
          <circle
            key={handle.id}
            className={className}
            cx={centre.x}
            cy={centre.y}
            r={isActive ? ACTIVE_RADIUS_PX : EDITABLE_RADIUS_PX}
          />
        );
      })}
    </g>
  );
}

type Transform = ReturnType<typeof createViewportTransform>;

/**
 * Rappel de ce que le geste peut changer : un cercle quand la poignée tourne ou s'éloigne du
 * centre, un axe quand elle glisse le long d'une direction. Le guide dit « voilà où ce point
 * peut aller » — c'est la seule façon de rendre lisible qu'un creux de turbine tourne sans
 * jamais s'éloigner.
 */
function ConstraintGuide({ handle, transform, size }: { handle: EditableHandle; transform: Transform; size: ViewportSize }) {
  const anchor = transform.point(handle.anchor);
  const centre = transform.point(handle.position);
  const radius = transform.radius(Math.hypot(handle.position.x - handle.anchor.x, handle.position.y - handle.anchor.y));

  return (
    <g className={styles.handleGuide} aria-hidden="true">
      {(handle.constraint === "polar" || handle.constraint === "radial" || handle.constraint === "angular") && (
        <>
          <circle cx={anchor.x} cy={anchor.y} r={radius} />
          {handle.constraint !== "angular" && <line x1={anchor.x} y1={anchor.y} x2={centre.x} y2={centre.y} />}
        </>
      )}
      {(handle.constraint === "axis-x" || handle.constraint === "plane") && (
        <line x1={0} y1={centre.y} x2={size.width} y2={centre.y} />
      )}
      {(handle.constraint === "axis-y" || handle.constraint === "plane") && (
        <line x1={centre.x} y1={0} x2={centre.x} y2={size.height} />
      )}
    </g>
  );
}
