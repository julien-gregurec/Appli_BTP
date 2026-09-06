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

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { buildGridModel, formatGridStep, resolveGridStep } from "@/lib/viewport/grid";
import { pointerPrecisionOf, type PointerPrecision } from "@/lib/viewport/pointer-targeting";
import type { ScreenPoint, ViewportSize, ViewportState } from "@/lib/viewport/viewport-math";
import type { AtelierTool } from "./toolbar-model";
import { GridOverlay } from "./GridOverlay";
import type { PlanViewportController } from "./use-plan-viewport";
import { useViewportGestures, type ViewportGestureHandlers } from "./use-viewport-gestures";
import styles from "./viewport.module.css";

/**
 * Intentions portées par un clic, indépendamment des touches qui les produisent (§8).
 * `additive` = « ajoute ou retire de la sélection » plutôt que « remplace la sélection ».
 */
export type CanvasClickModifiers = { additive: boolean };

export const PLAIN_CLICK: CanvasClickModifiers = { additive: false };

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
  /**
   * Pas de grille imposé, en millimètres (§16). `null` — le défaut — laisse le pas suivre le
   * zoom comme avant ce lot. Un pas trop fin pour le cadrage courant n'est pas dessiné : la
   * barre d'état le dit alors explicitement, plutôt que d'afficher un pas qu'on ne voit pas.
   */
  gridStepMm?: number | null;
  /** Le mode courant ne change que le curseur ; le pan à un doigt reste toujours accessible. */
  tool?: AtelierTool;
  /**
   * Saisie d'une poignée (ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §4). Transmise telle quelle aux
   * gestes : le viewport ne sait pas ce qu'est une poignée, il sait seulement qu'un contact
   * peut lui être pris. Absente, le comportement est exactement celui d'avant ce lot.
   */
  grab?: ViewportGestureHandlers["grab"];
  /**
   * Clic sur la toile, en coordonnées ÉCRAN locales au viewport, avec la finesse du pointeur
   * (ATELIER-HITTEST-SNAP-FOUNDATION-V1 §7/§8). Le viewport ne sait pas ce qu'il y a sous ce
   * point : c'est l'appelant qui décide, par hit-test, s'il faut sélectionner ou désélectionner.
   * Ignoré après un glissement.
   *
   * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8 — `modifiers` transporte l'intention ADDITIVE du
   * geste, pas la touche qui l'a produite. Le viewport lit `shiftKey` parce que c'est ce que
   * le DOM lui donne ; l'appelant, lui, n'a pas à savoir qu'une touche existe — ce qui laisse
   * une autre entrée (bascule tactile, raccourci) fournir la même intention plus tard sans
   * toucher à cette signature.
   */
  onCanvasClick?: (localPoint: ScreenPoint, precision: PointerPrecision, modifiers: CanvasClickModifiers) => void;
  /**
   * Survol de la toile — `null` à la sortie du pointeur (§9). Émis à la cadence de l'écran
   * (une seule notification par trame, §10) pour qu'un hit-test de survol ne coûte jamais plus
   * d'un calcul par image affichée.
   */
  onCanvasHover?: (localPoint: ScreenPoint | null, precision: PointerPrecision) => void;
  /**
   * ATELIER-FREE-DRAWING-FOUNDATION-V1 §4/§8 — double-clic sur la toile (fin d'une polyligne).
   * Le viewport ne sait pas ce qu'il termine : il rapporte le geste, l'appelant décide.
   */
  onCanvasDoubleClick?: () => void;
  /**
   * §4/§8 — touche pressée sur la toile, consultée AVANT les raccourcis de navigation. L'appelant
   * répond `true` s'il a consommé la touche ; le viewport arrête alors le traitement et bloque
   * le comportement par défaut.
   *
   * Cet ordre n'est pas arbitraire : `Entrée`, `Échap`, `Suppr` et `Retour arrière` n'ont
   * aucune signification pour le pan et le zoom, tandis que les flèches en ont une pour les
   * deux. Donner la priorité à l'appelant lui laisse fermer une polyligne sans jamais lui
   * permettre de confisquer une touche de navigation qu'il n'aurait pas réclamée.
   */
  onCanvasKeyDown?: (key: string) => boolean;
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
  gridStepMm = null,
  tool = "pan",
  grab,
  onCanvasClick,
  onCanvasHover,
  onCanvasDoubleClick,
  onCanvasKeyDown,
  children,
  status,
}: PlanViewportProps) {
  const { containerRef, element, size, view, ready, percent, pan, zoomAtPoint, zoomIn, zoomOut, recenter } = controller;
  const { handlers, consumeDrag } = useViewportGestures(element, { pan, zoomAtPoint, grab });

  /**
   * Ce que la barre d'état annonce sur la grille. Un pas imposé que le garde-fou de densité
   * refuse de dessiner doit se voir : afficher « Grille 100 mm » au-dessus d'un fond vide
   * serait un mensonge d'interface.
   */
  const gridStatus = (() => {
    const step = resolveGridStep(view.scale, gridStepMm);
    if (gridStepMm == null) return `Grille ${formatGridStep(step)}`;
    const drawn = buildGridModel(view, size, undefined, gridStepMm) !== null;
    return drawn ? `Grille ${formatGridStep(step)}` : `Grille ${formatGridStep(step)} — trop fine à ce zoom`;
  })();

  // Finesse du dernier pointeur vu. `onClick` ne reçoit qu'un `MouseEvent`, qui ne dit pas si
  // le geste venait d'un doigt : on la retient au `pointerdown`, qui le sait (§8).
  const precision = useRef<PointerPrecision>("fine");
  /** Trame de survol en attente — garantit un seul hit-test par image (§10). */
  const hoverFrame = useRef<number | null>(null);

  const localPointOf = useCallback((event: { clientX: number; clientY: number; currentTarget: Element }): ScreenPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Un clic qui conclut un pan ne doit ni sélectionner ni désélectionner (§11).
      if (consumeDrag()) return;
      onCanvasClick?.(localPointOf(event), precision.current, { additive: event.shiftKey });
    },
    [consumeDrag, localPointOf, onCanvasClick],
  );

  const onPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    precision.current = pointerPrecisionOf(event.pointerType);
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handlers.onPointerMove(event);
      if (!onCanvasHover) return;
      // Pendant un glissement de poignée, l'accrochage affiché est celui du geste en cours :
      // un survol concurrent le remplacerait par celui du curseur libre, et la croix
      // sauterait entre deux cibles à chaque trame.
      if (event.buttons !== 0) return;
      // Le survol au doigt n'a pas de sens : le contact EST déjà un geste de pan ou de clic.
      if (event.pointerType === "touch") return;
      const point = localPointOf(event);
      if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
      hoverFrame.current = requestAnimationFrame(() => {
        hoverFrame.current = null;
        onCanvasHover(point, "fine");
      });
    },
    [handlers, localPointOf, onCanvasHover],
  );

  const onPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handlers.onPointerLeave(event);
      if (hoverFrame.current !== null) {
        cancelAnimationFrame(hoverFrame.current);
        hoverFrame.current = null;
      }
      onCanvasHover?.(null, precision.current);
    },
    [handlers, onCanvasHover],
  );

  useEffect(() => () => {
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (onCanvasKeyDown?.(event.key)) {
        event.preventDefault();
        return;
      }
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
    [onCanvasKeyDown, pan, recenter, size.height, size.width, zoomAtPoint],
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
        onDoubleClick={onCanvasDoubleClick}
        {...handlers}
        onPointerDownCapture={onPointerDownCapture}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <svg className={styles.svg} width={size.width || undefined} height={size.height || undefined} aria-hidden="true">
          {ready && gridVisible && <GridOverlay view={view} size={size} stepMm={gridStepMm} />}
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
        {gridVisible && <span>{gridStatus}</span>}
        {status}
      </p>
    </div>
  );
}
