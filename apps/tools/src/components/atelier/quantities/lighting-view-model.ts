/**
 * Adaptateur d'affichage pour `LightingSummaryCard` (§8).
 *
 * LOT sans outil interactif LED : ce composant est en LECTURE SEULE. S'il reçoit un
 * comptage d'appareils ou un plan LED déjà calculé, il en fait un résumé. Aucun
 * placement, aucun calcul propre — `summariseLighting` / `lightingKindLabel` de
 * `@/lib/chantier` font foi.
 */

import {
  lightingKindLabel,
  LIGHTING_KINDS,
  summariseLighting,
  type LightingFixture,
  type LightingKind,
} from "../../../lib/chantier";

/** Sous-ensemble lecture seule d'un plan LED (cf. `LedPlan` de `@/lib/chantier`). */
export type LedSummaryInput = {
  totalLengthMm?: number;
  withMarginMm?: number;
  breaks?: number;
  rollCount?: number;
};

export type LightingSummaryCardProps = {
  fixtures?: readonly LightingFixture[];
  summary?: Partial<Record<LightingKind, number>>;
  led?: LedSummaryInput;
};

export type LightingSummaryViewModel =
  | {
      ok: true;
      hasContent: boolean;
      fixtures: { kind: LightingKind; label: string; count: number }[];
      totalFixtures: number;
      led: LedSummaryInput | null;
    }
  | { ok: false; error: string };

export function buildLightingSummaryViewModel(props: LightingSummaryCardProps): LightingSummaryViewModel {
  try {
    let counts: Partial<Record<LightingKind, number>> = {};
    if (props.fixtures && props.summary) {
      throw new Error("Fournir soit fixtures, soit summary — pas les deux.");
    }
    if (props.fixtures) counts = summariseLighting(props.fixtures);
    else if (props.summary) counts = props.summary;

    const fixtures = LIGHTING_KINDS.map((kind) => ({
      kind,
      label: lightingKindLabel(kind),
      count: Math.max(0, Math.trunc(counts[kind] ?? 0)),
    })).filter((entry) => entry.count > 0);

    const totalFixtures = fixtures.reduce((sum, entry) => sum + entry.count, 0);
    const led = props.led && Object.values(props.led).some((value) => value !== undefined) ? props.led : null;

    return { ok: true, hasContent: totalFixtures > 0 || led !== null, fixtures, totalFixtures, led };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erreur de résumé éclairage.",
    };
  }
}
