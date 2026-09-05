"use client";

/**
 * Gestes du viewport Atelier : molette, glisser souris, pan 1 doigt, pinch 2 doigts (§3/§4).
 *
 * Pointer Events uniquement : un seul chemin de code couvre souris, stylet et tactile, sans
 * aucune dépendance externe (§4). `touch-action: none` sur la zone (CSS) empêche le navigateur
 * de préempter le geste ; la molette est interceptée en `passive: false` UNIQUEMENT sur cette
 * zone, pour ne jamais bloquer le défilement du reste de la page (§3).
 */

import { useCallback, useEffect, useRef } from "react";
import { screenDistance, screenMidpoint, type ScreenPoint } from "@/lib/viewport/viewport-math";

export type ViewportGestureHandlers = {
  pan: (dxScreen: number, dyScreen: number) => void;
  zoomAtPoint: (anchor: ScreenPoint, factor: number) => void;
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

export function useViewportGestures(element: HTMLElement | null, { pan, zoomAtPoint }: ViewportGestureHandlers) {
  const pointers = useRef<Map<number, PointerSample>>(new Map());
  const pinchDistance = useRef<number | null>(null);
  const pinchAnchor = useRef<ScreenPoint | null>(null);
  const dragged = useRef(false);

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
      pointers.current.set(event.pointerId, { ...point, pointerId: event.pointerId });
      dragged.current = false;
      if (pointers.current.size === 2) {
        const [first, second] = [...pointers.current.values()];
        pinchDistance.current = screenDistance(first, second);
        pinchAnchor.current = screenMidpoint(first, second);
      }
      capturePointer(event.currentTarget, event.pointerId, true);
    },
    [localPoint],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
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
    [localPoint, pan, zoomAtPoint],
  );

  const endPointer = useCallback((event: React.PointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) {
      pinchDistance.current = null;
      pinchAnchor.current = null;
    }
    capturePointer(event.currentTarget, event.pointerId, false);
  }, []);

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
