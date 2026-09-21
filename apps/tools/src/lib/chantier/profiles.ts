/**
 * §25 — Profils / ossature.
 *
 * Sans transformer Tools en logiciel de devis : longueur commerciale d'une barre, marge,
 * nombre de barres (plafond arithmétique). Pas de calepinage automatique.
 */

import { applyMargin, NO_MARGIN, type MarginBreakdown, type MarginChoice } from "./margins";

export const DEFAULT_PROFILE_BAR_MM = 3000;

export type ProfilePlan = {
  type: string;
  totalLengthMm: number;
  barLengthMm: number;
  margin: MarginBreakdown;
  barCount: number;
  orderedMm: number;
  offcutMm: number;
};

export type PlanProfilesInput = {
  type?: string;
  totalLengthMm: number;
  barLengthMm?: number;
  margin?: MarginChoice;
};

export function planProfiles(input: PlanProfilesInput): ProfilePlan {
  if (!Number.isFinite(input.totalLengthMm) || input.totalLengthMm < 0) {
    throw new Error("La longueur totale de profil doit être positive.");
  }
  const barLengthMm = input.barLengthMm ?? DEFAULT_PROFILE_BAR_MM;
  if (!Number.isFinite(barLengthMm) || barLengthMm <= 0) throw new Error("La longueur commerciale d'une barre doit être supérieure à 0.");

  const margin = applyMargin(input.totalLengthMm, input.margin ?? NO_MARGIN);
  const barCount = margin.withMarginMm === 0 ? 0 : Math.max(1, Math.ceil(margin.withMarginMm / barLengthMm));
  const orderedMm = barCount * barLengthMm;
  return {
    type: input.type ?? "Profil",
    totalLengthMm: input.totalLengthMm,
    barLengthMm,
    margin,
    barCount,
    orderedMm,
    offcutMm: orderedMm - margin.withMarginMm,
  };
}
