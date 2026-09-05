/**
 * §24 — Calcul / export dédié LED.
 *
 * Longueur totale, segments, ruptures, marge, nombre de rouleaux. Aucune quantité n'est
 * inventée : le nombre de rouleaux est un plafond arithmétique de la longueur avec marge.
 */

import { applyMargin, NO_MARGIN, type MarginBreakdown, type MarginChoice } from "./margins";

export type LedSegment = { id: string; lengthMm: number; label?: string };

export const DEFAULT_LED_ROLL_MM = 5000;

export type LedPlan = {
  segments: LedSegment[];
  totalLengthMm: number;
  /** Nombre de ruptures = segments - 1 (0 si un seul segment continu). */
  breaks: number;
  margin: MarginBreakdown;
  roll: {
    lengthMm: number;
    count: number;
    orderedMm: number;
    wasteMm: number;
  };
};

export type PlanLedInput = {
  segments: readonly LedSegment[];
  margin?: MarginChoice;
  rollLengthMm?: number;
};

export function planLed(input: PlanLedInput): LedPlan {
  const segments = input.segments.map((segment) => {
    if (!Number.isFinite(segment.lengthMm) || segment.lengthMm < 0) {
      throw new Error(`Le segment LED ${segment.id} a une longueur invalide.`);
    }
    return { ...segment };
  });
  if (!segments.length) throw new Error("Le plan LED exige au moins un segment.");

  const totalLengthMm = segments.reduce((sum, segment) => sum + segment.lengthMm, 0);
  const margin = applyMargin(totalLengthMm, input.margin ?? NO_MARGIN);
  const rollLengthMm = input.rollLengthMm ?? DEFAULT_LED_ROLL_MM;
  if (!Number.isFinite(rollLengthMm) || rollLengthMm <= 0) throw new Error("La longueur d'un rouleau doit être supérieure à 0.");

  const count = Math.max(1, Math.ceil(margin.withMarginMm / rollLengthMm));
  const orderedMm = count * rollLengthMm;
  return {
    segments,
    totalLengthMm,
    breaks: Math.max(0, segments.length - 1),
    margin,
    roll: { lengthMm: rollLengthMm, count, orderedMm, wasteMm: orderedMm - margin.withMarginMm },
  };
}
