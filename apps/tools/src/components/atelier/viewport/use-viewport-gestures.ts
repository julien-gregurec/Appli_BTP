"use client";

/**
 * Gestes du viewport Atelier : molette, glisser souris, pan 1 doigt, pinch 2 doigts (§3/§4).
 *
 * Pointer Events uniquement : un seul chemin de code couvre souris, stylet et tactile, sans
 * aucune dépendance externe (§4). `touch-action: none` sur la zone (CSS) empêche le navigateur
 * de préempter le geste ; la molette est interceptée en `passive: false` UNIQUEMENT sur cette
 * zone, pour ne jamais bloquer le défilement du reste de la page (§3).
 *
 * ## ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §4 — un pan ne devient jamais un glissement de poignée
 *
 * L'arbitrage se fait UNE FOIS, au `pointerdown`, et pas autrement : `grab.onDown` répond
 * « je prends ce geste » ou non, et sa réponse vaut pour toute la durée du contact. Décider
 * plus tard — au premier mouvement, ou selon la distance parcourue — laisserait le plan
 * glisser de quelques pixels avant que la poignée ne prenne la main, ce qui se voit et se
 * ressent comme un défaut.
 *
 * L'automate d'arbitrage lui-même vit dans `gesture-routing.ts`, pur et testé à part : c'est
 * là que sont écrites, et vérifiées, les trois règles (un seul arbitrage au `pointerdown`, un
 * contact capté ne déplace pas le plan, les contacts surnuméraires sont ignorés).
 */

import { useCallback, useEffect, useRef } from "react";
import { screenDistance, screenMidpoint, type ScreenPoint } from "@/lib/viewport/viewport-math";
import {
  IDLE_GESTURE_ROUTING,
  routePointerDown,
  routePointerMove,
  routePointerUp,
  type GestureRoutingState,
} from "./gesture-routing";

export type ViewportGestureHandlers = {
  pan: (dxScreen: number, dyScreen: number) => void;
  zoomAtPoint: (anchor: ScreenPoint, factor: number) => void;
  /**
   * Saisie d'une poignée (§4). `onDown` renvoie `true` pour capter le contact ; le viewport
   * cesse alors de déplacer le plan et route `onMove` / `onUp` jusqu'au relâchement.
   */
  grab?: {
    onDown: (localPoint: ScreenPoint, pointerType: string | undefined) => boolean;
    onMove: (localPoint: ScreenPoint) => void;
    onUp: (localPoint: ScreenPoint) => void;
  };
};

/** Au-delà de ce déplacement (px), le geste est un pan : le clic de sélection est annulé. */
export const DRAG_THRESHOLD_PX = 6;

/** Sensibilité de la molette : un cran ≈ ×1,15. Le pinch trackpad (ctrlKey) est plus direct. */
const WHEEL_SENSITIVITY = 0.0018;
const TRACKPAD_PINCH_SENSITIVITY = 0.01;
const MAX_WHEEL_FACTOR = 4;

type PointerSample = ScreenPoint & { pointerId: number };

/**
 * `setPointerCapture` / `releasePointerCapture` lèvent `NotFoundError` dès que le pointeur n'est
 * plus actif — cas réel quand un doigt est relâché hors de la zone, ou quand le navigateur a déjà
 * rendu la capture. L'échec de capture ne doit jamais interrompre le geste.
 */
function capturePointer(element: Element, pointerId: number, capture: boolean) {
  try {
    if (capture) element.setPointerCapture?.(pointerId);
    else element.releasePointerCapture?.(pointerId);
  } catch {
    // Capture indisponible : le suivi par `pointers` reste correct, le geste continue.
  }
}

export function useViewportGestures(element: HTMLElement | null, { pan, zoomAtPoint, grab }: ViewportGestureHandlers) {
  const pointers = useRef<Map<number, PointerSample>>(new Map());
  const pinchDistance = useRef<number | null>(null);
  const pinchAnchor = useRef<ScreenPoint | null>(null);
  const dragged = useRef(false);
  /** Arbitrage plan / poignée (§4) — automate pur, cf. `gesture-routing.ts`. */
  const routing = useRef<GestureRoutingState>(IDLE_GESTURE_ROUTING);

  const localPoint = useCallback(
    (event: { clientX: number; clientY: number }): ScreenPoint => {
      const rect = element?.getBoundingClientRect();
      return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
    },
    [element],
  );

  // Molette : listener natif non passif, sinon le navigateur ignore preventDefault et la page
  // défile pendant le zoom.
  useEffect(() => {
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const sensitivity = event.ctrlKey ? TRACKPAD_PINCH_SENSITIVITY : WHEEL_SENSITIVITY;
      const raw = Math.exp(-event.deltaY * sensitivity);
      const factor = Math.min(MAX_WHEEL_FACTOR, Math.max(1 / MAX_WHEEL_FACTOR, raw));
      const rect = element.getBoundingClientRect();
      zoomAtPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top }, factor);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [element, zoomAtPoint]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const point = localPoint(event);
      const step = routePointerDown(routing.current, event.pointerId, () =>
        Boolean(grab?.onDown(point, event.pointerType)),
      );
      routing.current = step.state;
      // Un sommet est déjà tenu : tout contact supplémentaire est sans effet.
      if (step.route === "ignored") return;
      if (step.route === "handle") {
        dragged.current = false;
        capturePointer(event.currentTarget, event.pointerId, true);
        return;
      }

      pointers.current.set(event.pointerId, { ...point, pointerId: event.pointerId });
      dragged.current = false;
      if (pointers.current.size === 2) {
        const [first, second] = [...pointers.current.values()];
        pinchDistance.current = screenDistance(first, second);
        pinchAnchor.current = screenMidpoint(first, second);
      }
      capturePointer(event.currentTarget, event.pointerId, true);
    },
    [grab, localPoint],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const route = routePointerMove(routing.current, event.pointerId);
      if (route === "ignored") return;
      if (route === "handle") {
        // Le glissement d'une poignée est un glissement : le clic qui le conclut ne doit ni
        // sélectionner ni désélectionner (§4).
        dragged.current = true;
        grab?.onMove(localPoint(event));
        return;
      }
      const previous = pointers.current.get(event.pointerId);
      if (!previous) return;
      const point = localPoint(event);
      pointers.current.set(event.pointerId, { ...point, pointerId: event.pointerId });

      if (pointers.current.size >= 2) {
        const [first, second] = [...pointers.current.values()];
        const distance = screenDistance(first, second);
        const anchor = screenMidpoint(first, second);
        // Zoom centré sur le point entre les doigts, puis translation de ce point : le contenu
        // suit exactement les deux contacts (§4).
        if (pinchDistance.current && pinchDistance.current > 0 && distance > 0) {
          zoomAtPoint(anchor, distance / pinchDistance.current);
        }
        if (pinchAnchor.current) {
          pan(anchor.x - pinchAnchor.current.x, anchor.y - pinchAnchor.current.y);
        }
        pinchDistance.current = distance;
        pinchAnchor.current = anchor;
        dragged.current = true;
        return;
      }

      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      if (Math.hypot(dx, dy) > 0) {
        if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) dragged.current = true;
        pan(dx, dy);
      }
    },
    [grab, localPoint, pan, zoomAtPoint],
  );

  const endPointer = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const step = routePointerUp(routing.current, event.pointerId);
      routing.current = step.state;
      if (step.route === "ignored") return;
      if (step.route === "handle") {
        capturePointer(event.currentTarget, event.pointerId, false);
        grab?.onUp(localPoint(event));
        return;
      }
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) {
        pinchDistance.current = null;
        pinchAnchor.current = null;
      }
      capturePointer(event.currentTarget, event.pointerId, false);
    },
    [grab, localPoint],
  );

  /** Un clic consécutif à un pan ne doit pas sélectionner (§11). */
  const consumeDrag = useCallback(() => {
    const value = dragged.current;
    dragged.current = false;
    return value;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onPointerLeave: endPointer,
    },
    consumeDrag,
    activePointers: pointers,
  };
}
