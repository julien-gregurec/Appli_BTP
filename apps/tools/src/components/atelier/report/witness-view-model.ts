/**
 * Adaptateur d'affichage pour la cote témoin (§4).
 *
 * Aucune formule : `witnessDimension` de `@/lib/chantier` est seul juge de la longueur
 * arrondie et du texte de consigne. On capture l'erreur (longueur ≤ 0 / non finie) pour
 * un rendu propre.
 */

import { witnessDimension, DEFAULT_WITNESS_MM, type WitnessDimension } from "../../../lib/chantier";

export const WITNESS_PRESETS_MM: readonly number[] = [50, 100, 200];

export type WitnessViewModel =
  | { ok: true; witness: WitnessDimension; isDefault: boolean }
  | { ok: false; error: string };

export function buildWitnessViewModel(lengthMm: number = DEFAULT_WITNESS_MM): WitnessViewModel {
  try {
    const witness = witnessDimension(lengthMm);
    return { ok: true, witness, isDefault: witness.lengthMm === DEFAULT_WITNESS_MM };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cote témoin invalide.",
    };
  }
}
