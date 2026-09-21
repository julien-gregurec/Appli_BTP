"use client";

/**
 * État React du viewport Atelier (§2/§3/§4/§5).
 *
 * Le hook ne fait qu'orchestrer : toute la trigonométrie vit dans `@/lib/viewport/viewport-math`
 * (pur, testé). Aucun appel au moteur géométrique : les bornes viennent de la scène reçue en
 * props (§8).
 *
 * Deux choix de structure évitent tout `setState` en effet (cascade de rendus) :
 * - le cadrage automatique (`fit`) est DÉRIVÉ à chaque rendu, jamais recopié dans un état ;
 * - la vue manuelle est mémorisée avec la clé de la scène qui l'a produite. Changer de scène
 *   périme donc la vue sans effet de réinitialisation : on retombe automatiquement sur le
 *   cadrage recentré de la nouvelle géométrie. Cette clé vaut les bornes par défaut, ou
 *   `viewKey` quand l'appelant sait ce que la scène représente (§4/§5).
 *
 * La mesure initiale est prise dans la ref de rappel, en phase de commit, et NON dans le
 * `ResizeObserver` : sur une page masquée (onglet en arrière-plan, panneau replié) le navigateur
 * suspend les étapes de rendu, donc l'observateur ne notifie jamais et un viewport qui l'attendrait
 * resterait vide jusqu'au retour au premier plan. L'observateur ne sert qu'aux changements
 * ultérieurs.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clampPan,
  createViewportTransform,
  fitToBounds,
  panByScreen,
  zoomAt,
  zoomByStep,
  zoomPercent,
  ZOOM_STEP,
  type ViewportSize,
  type ViewportState,
  type WorldBounds,
} from "@/lib/viewport/viewport-math";

export type UsePlanViewportOptions = {
  bounds: WorldBounds;
  /** Marge de recentrage, en px. */
  padding?: number;
  /**
   * Identité de la vue (ATELIER-RESOLVED-MODEL-VIEWPORT-INTEGRATION-V1 §4/§5).
   *
   * Par défaut la vue manuelle est mémorisée sous la clé des bornes : changer de géométrie
   * périme le cadrage. C'est le bon comportement pour une scène figée, mais pas pour un
   * modèle paramétrique — chaque frappe dans un champ déplace les bornes et remettrait donc
   * la vue à plat. Un appelant qui connaît l'identité réelle de ce qu'il montre (projet +
   * `modelId`) la passe ici : le zoom et le pan survivent alors aux changements de
   * paramètres, et ne sont réinitialisés que sur un vrai changement de modèle ou de projet.
   */
  viewKey?: string;
};

type PinnedView = { key: string; state: ViewportState };

const EMPTY_SIZE: ViewportSize = { width: 0, height: 0 };
const FALLBACK_VIEW: ViewportState = { scale: 1, centerX: 0, centerY: 0 };

export function usePlanViewport({ bounds, padding, viewKey }: UsePlanViewportOptions) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ViewportSize>(EMPTY_SIZE);
  const [pinned, setPinned] = useState<PinnedView | null>(null);

  const sceneKey = viewKey ?? `${bounds.minX}|${bounds.minY}|${bounds.maxX}|${bounds.maxY}`;

  /** Ref de rappel : capte l'élément et le mesure dès le commit, sans attendre de peinture. */
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setElement(node);
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });
  }, []);

  // Changements ultérieurs de taille : rotation d'écran, ouverture du panneau propriétés,
  // redimensionnement de la fenêtre. `ResizeObserver` couvre les changements de mise en page que
  // la fenêtre ignore ; `resize` et `visibilitychange` le complètent car l'observateur ne notifie
  // pas tant que le document est masqué — au retour au premier plan, la vue se remet d'aplomb.
  useEffect(() => {
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize((current) =>
        Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", measure);
      observer?.disconnect();
    };
  }, [element]);

  const fit = useMemo(
    () => (size.width > 0 && size.height > 0 ? fitToBounds(bounds, size, padding) : null),
    [bounds, size, padding],
  );

  const view = pinned && pinned.key === sceneKey ? pinned.state : fit ?? FALLBACK_VIEW;
  const ready = fit !== null;

  /** Applique une transformation à la vue courante, bornage du pan compris (§5). */
  const update = useCallback(
    (transformView: (current: ViewportState) => ViewportState) => {
      setPinned((current) => {
        const base = current && current.key === sceneKey ? current.state : fit ?? FALLBACK_VIEW;
        return { key: sceneKey, state: clampPan(transformView(base), bounds, size) };
      });
    },
    [sceneKey, bounds, size, fit],
  );

  const pan = useCallback(
    (dxScreen: number, dyScreen: number) => update((current) => panByScreen(current, dxScreen, dyScreen)),
    [update],
  );

  const zoomAtPoint = useCallback(
    (anchor: { x: number; y: number }, factor: number) => update((current) => zoomAt(current, size, anchor, factor)),
    [update, size],
  );

  const zoomIn = useCallback(() => update((current) => zoomByStep(current, size, ZOOM_STEP)), [update, size]);
  const zoomOut = useCallback(() => update((current) => zoomByStep(current, size, 1 / ZOOM_STEP)), [update, size]);

  /** Recentrage : on oublie la vue manuelle, la vue dérivée redevient le cadrage automatique. */
  const recenter = useCallback(() => setPinned(null), []);

  const setView = useCallback((next: ViewportState) => update(() => next), [update]);

  const transform = useMemo(() => createViewportTransform(view, size), [view, size]);

  return {
    containerRef,
    element,
    size,
    view,
    ready,
    transform,
    percent: fit ? zoomPercent(view, fit) : 100,
    pan,
    zoomAtPoint,
    zoomIn,
    zoomOut,
    recenter,
    setView,
  };
}

export type PlanViewportController = ReturnType<typeof usePlanViewport>;
