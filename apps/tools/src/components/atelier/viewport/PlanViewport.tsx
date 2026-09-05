"use client";

/**
 * Viewport interactif générique de l'Atelier (§2/§8).
 *
 * Séparation stricte : ce composant possède le zoom, le pan et la projection — jamais la
 * géométrie. Le contenu est fourni par `children`, qui reçoit la vue et la taille courantes et
 * dessine ce qu'il veut en coordonnées écran. Le viewport n'appelle donc jamais Engine B, ne
 * connaît aucun `modelId` et ne modifie aucune forme (limites explicites du lot).
 *
 * L'état de vue est détenu par le parent via `usePlanViewport` et passé en `controller` : c'est
 * ce qui permet à la barre d'outils, extérieure au viewport, de déclencher « Recentrer » sans
 * que le viewport ait à exposer une API impérative.
 *
 * Le SVG est dimensionné en pixels CSS (pas de `viewBox` figé) et la projection est recalculée à
 * chaque redimensionnement : aucune déformation entre mobile, tablette et desktop.
 */

import { useCallback, type ReactNode } from "react";
import { chooseGridStep, formatGridStep } from "@/lib/viewport/grid";
import type { ViewportSize, ViewportState } from "@/lib/viewport/viewport-math";
import { GridOverlay } from "./GridOverlay";
import type { PlanViewportController } from "./use-plan-viewport";
import { useViewportGestures } from "./use-viewport-gestures";
import styles from "./viewport.module.css";

export type PlanViewportRenderArgs = {
  view: ViewportState;
  size: ViewportSize;
  /** `true` si le clic en cours conclut un glissement : ne pas le traiter comme une sélection (§11). */
  consumeDrag: () => boolean;
};

export type PlanViewportProps = {
  controller: PlanViewportController;
  label: string;
  gridVisible?: boolean;
  /** Le mode courant ne change que le curseur ; le pan à un doigt reste toujours accessible. */
  tool?: "select" | "pan";
  /** Clic sur le fond (hors entité) — sert à désélectionner. Ignoré après un glissement. */
  onBackgroundClick?: () => void;
  children: (args: PlanViewportRenderArgs) => ReactNode;
  /** Ligne d'état complémentaire (nombre d'entités, sélection…). */
  status?: ReactNode;
};

/** Pas de déplacement au clavier (§15 : le zoom ne doit pas rendre la vue inutilisable au clavier). */
const KEYBOARD_PAN_PX = 48;
const KEYBOARD_ZOOM_FACTOR = 1.25;

export function PlanViewport({
  controller,
  label,
  gridVisible = true,
  tool = "pan",
  onBackgroundClick,
  children,
  status,
}: PlanViewportProps) {
  const { containerRef, element, size, view, ready, percent, pan, zoomAtPoint, zoomIn, zoomOut, recenter } = controller;
  const { handlers, consumeDrag } = useViewportGestures(element, { pan, zoomAtPoint });

  const onClick = useCallback(() => {
    // Un clic qui conclut un pan ne doit pas désélectionner (§11).
    if (consumeDrag()) return;
    onBackgroundClick?.();
  }, [consumeDrag, onBackgroundClick]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const center = { x: size.width / 2, y: size.height / 2 };
      switch (event.key) {
        case "ArrowLeft":
          pan(KEYBOARD_PAN_PX, 0);
          break;
        case "ArrowRight":
          pan(-KEYBOARD_PAN_PX, 0);
          break;
        case "ArrowUp":
          pan(0, KEYBOARD_PAN_PX);
          break;
        case "ArrowDown":
          pan(0, -KEYBOARD_PAN_PX);
          break;
        case "+":
        case "=":
          zoomAtPoint(center, KEYBOARD_ZOOM_FACTOR);
          break;
        case "-":
        case "_":
          zoomAtPoint(center, 1 / KEYBOARD_ZOOM_FACTOR);
          break;
        case "0":
          recenter();
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [pan, recenter, size.height, size.width, zoomAtPoint],
  );

  return (
    <div className={styles.stage}>
      <div
        ref={containerRef}
        className={styles.canvas}
        data-tool={tool}
        role="application"
        aria-label={label}
        aria-roledescription="Plan interactif : flèches pour déplacer, + et − pour zoomer, 0 pour recentrer"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onClick={onClick}
        {...handlers}
      >
        <svg className={styles.svg} width={size.width || undefined} height={size.height || undefined} aria-hidden="true">
          {ready && gridVisible && <GridOverlay view={view} size={size} />}
          {ready && children({ view, size, consumeDrag })}
        </svg>
      </div>

      <div className={styles.zoomCluster}>
        <button type="button" className={styles.zoomButton} onClick={zoomIn} aria-label="Zoomer">
          +
        </button>
        <button type="button" className={styles.zoomButton} onClick={zoomOut} aria-label="Dézoomer">
          −
        </button>
      </div>

      <p className={styles.statusBar}>
        <span>Zoom {percent} %</span>
        {gridVisible && <span>Grille {formatGridStep(chooseGridStep(view.scale))}</span>}
        {status}
      </p>
    </div>
  );
}
