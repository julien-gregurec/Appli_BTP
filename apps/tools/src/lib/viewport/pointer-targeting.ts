/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §2/§8 — passage du pixel au monde pour la désignation.
 *
 * C'est la seule couche qui connaît À LA FOIS l'écran et la géométrie. `geometry/hit-test.ts` et
 * `geometry/snap.ts` restent purs et ignorent le zoom ; ce module leur fournit une tolérance
 * exprimée en millimètres, recalculée à chaque changement d'échelle.
 *
 * §2 — la tolérance est définie en PIXELS, pas en millimètres : c'est une notion de doigt et
 * d'œil, pas d'ouvrage. `toleranceWorld = tolerancePx / scale` garantit qu'un trait reste aussi
 * facile à désigner à 25 % qu'à 400 % de zoom. Une tolérance fixée en millimètres ferait
 * exactement l'inverse : impossible à viser une fois dézoomé, et captant tout l'écran une fois
 * zoomé.
 *
 * §8 — le doigt est plus large et moins précis que le curseur. Le pointeur grossier reçoit donc
 * une tolérance plus généreuse, sans quoi les points nommés (4 px de rayon à l'écran) seraient
 * hors d'atteinte au toucher. La valeur tactile reste bornée pour que deux entités voisines
 * restent distinguables.
 */

import { screenToWorldLength, type ViewportState } from "./viewport-math";

/** Tolérance de désignation à la souris, en pixels écran. */
export const POINTER_TOLERANCE_PX = 12;

/** Tolérance de désignation au doigt, en pixels écran (§8). */
export const TOUCH_TOLERANCE_PX = 20;

/** Tolérance d'accrochage — plus serrée que la sélection : aimanter à tort se remarque plus. */
export const SNAP_TOLERANCE_PX = 10;
export const TOUCH_SNAP_TOLERANCE_PX = 16;

export type PointerPrecision = "fine" | "coarse";

/** Tolérance de sélection en pixels selon la finesse du pointeur. */
export function selectionTolerancePx(precision: PointerPrecision): number {
  return precision === "coarse" ? TOUCH_TOLERANCE_PX : POINTER_TOLERANCE_PX;
}

/** Tolérance d'accrochage en pixels selon la finesse du pointeur. */
export function snapTolerancePx(precision: PointerPrecision): number {
  return precision === "coarse" ? TOUCH_SNAP_TOLERANCE_PX : SNAP_TOLERANCE_PX;
}

/**
 * Conversion d'une tolérance écran en tolérance monde. Repose sur `screenToWorldLength`, déjà
 * utilisée par le pan et le zoom : une seule définition de l'échelle dans toute l'application.
 */
export function toleranceWorldFor(tolerancePx: number, view: ViewportState): number {
  return screenToWorldLength(tolerancePx, view);
}

/** Nature du pointeur d'un évènement — `pen` vise aussi précisément qu'une souris. */
export function pointerPrecisionOf(pointerType: string | undefined): PointerPrecision {
  return pointerType === "touch" ? "coarse" : "fine";
}
