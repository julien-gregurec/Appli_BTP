/**
 * Adaptateur d'affichage pour `MarginSelector` (§6).
 *
 * `applyMargin` / `marginPercent` de `@/lib/chantier` restent seuls responsables du calcul.
 * Ici : résolution du choix (préréglage ou personnalisé) et mise en forme du triptyque
 * « quantité nette / marge / quantité à prévoir ». La quantité de base n'est jamais modifiée.
 */

import {
  applyMargin,
  MARGIN_PRESETS,
  NO_MARGIN,
  type MarginBreakdown,
  type MarginChoice,
  type MarginPreset,
} from "../../../lib/chantier";

export type MarginOption =
  | { kind: "preset"; percent: MarginPreset; label: string }
  | { kind: "custom"; label: string };

export const MARGIN_OPTIONS: readonly MarginOption[] = [
  ...MARGIN_PRESETS.map((percent) => ({ kind: "preset" as const, percent, label: `${percent} %` })),
  { kind: "custom" as const, label: "Personnalisée" },
];

/** Construit un `MarginChoice` typé à partir d'une sélection d'UI. */
export function resolveMarginChoice(selection: { kind: "preset"; percent: number } | { kind: "custom"; percent: number }): MarginChoice {
  if (selection.kind === "preset") {
    const preset = MARGIN_PRESETS.find((value) => value === selection.percent);
    return { kind: "preset", percent: preset ?? 0 };
  }
  return { kind: "custom", percent: selection.percent };
}

export type MarginViewModel =
  | { ok: true; choice: MarginChoice; breakdown: MarginBreakdown }
  | { ok: false; error: string };

export function buildMarginViewModel(baseMm: number, choice: MarginChoice = NO_MARGIN): MarginViewModel {
  try {
    return { ok: true, choice, breakdown: applyMargin(baseMm, choice) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Marge invalide.",
    };
  }
}
