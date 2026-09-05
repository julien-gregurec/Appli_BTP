/**
 * §23 — Marge / chute.
 *
 * Sépare la longueur calculée de la longueur avec marge. Aucune règle métier cachée :
 * la marge est un pourcentage explicite choisi par l'utilisateur.
 */

export type MarginPreset = 0 | 5 | 10 | 15;
export const MARGIN_PRESETS: readonly MarginPreset[] = [0, 5, 10, 15];

export type MarginChoice = { kind: "preset"; percent: MarginPreset } | { kind: "custom"; percent: number };

export const NO_MARGIN: MarginChoice = { kind: "preset", percent: 0 };

export function marginPercent(choice: MarginChoice): number {
  const percent = choice.percent;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("La marge doit être un pourcentage compris entre 0 et 100.");
  }
  return percent;
}

export type MarginBreakdown = {
  baseMm: number;
  percent: number;
  marginMm: number;
  withMarginMm: number;
};

export function applyMargin(baseMm: number, choice: MarginChoice = NO_MARGIN): MarginBreakdown {
  if (!Number.isFinite(baseMm) || baseMm < 0) throw new Error("La longueur de base doit être positive.");
  const percent = marginPercent(choice);
  const marginMm = (baseMm * percent) / 100;
  return { baseMm, percent, marginMm, withMarginMm: baseMm + marginMm };
}
