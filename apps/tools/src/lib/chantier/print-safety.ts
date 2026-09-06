/**
 * §7 — Consigne d'impression, §38/§39 — garde-fous de volume.
 *
 * Un PDF ne peut pas forcer le réglage d'une imprimante : la seule protection réelle est la
 * combinaison d'une consigne explicite et d'une cote témoin mesurable après impression
 * (`witness.ts`). Ce module centralise ces deux textes pour qu'ils restent identiques sur
 * toutes les feuilles.
 *
 * Il porte aussi le garde-fou de volume : une grande forme découpée sur un petit format peut
 * produire des centaines de feuilles. Au-delà d'un seuil d'alerte on prévient, au-delà d'un
 * plafond dur on refuse de générer plutôt que de bloquer l'appareil.
 */

import type { MosaicPlan } from "./mosaic";

/** Consigne imprimante (§7) — à répéter sur chaque feuille de gabarit. */
export const PRINT_INSTRUCTION = "Imprimer à 100 %, taille réelle, sans « ajuster à la page ».";

/** Seuil au-delà duquel l'utilisateur est prévenu du volume d'impression. */
export const MOSAIC_SHEET_WARNING_THRESHOLD = 40;
/** Plafond dur : au-delà, la génération est refusée (§39). */
export const MAX_MOSAIC_SHEETS = 400;

export type MosaicSafetyLevel = "ok" | "warning" | "blocked";

export type MosaicSafety = {
  sheetCount: number;
  level: MosaicSafetyLevel;
  /** Message destiné à l'utilisateur ; `undefined` quand tout est nominal. */
  message?: string;
};

/**
 * Évalue le volume d'impression d'un plan de mosaïque. Fonction pure : l'UI peut l'appeler
 * pour prévenir AVANT de lancer une génération, le moteur PDF l'utilise pour refuser au-delà
 * du plafond.
 */
export function assessMosaicSafety(plan: Pick<MosaicPlan, "sheetCount" | "format">): MosaicSafety {
  const sheetCount = plan.sheetCount;
  if (!Number.isInteger(sheetCount) || sheetCount <= 0) {
    throw new Error("Le nombre de feuilles du plan de mosaïque est invalide.");
  }

  if (sheetCount > MAX_MOSAIC_SHEETS) {
    return {
      sheetCount,
      level: "blocked",
      message: `Ce gabarit demanderait ${sheetCount} feuilles ${plan.format} (plafond : ${MAX_MOSAIC_SHEETS}). Choisir un format de papier plus grand ou réduire l'emprise du motif.`,
    };
  }

  if (sheetCount >= MOSAIC_SHEET_WARNING_THRESHOLD) {
    return {
      sheetCount,
      level: "warning",
      message: `Ce gabarit représente ${sheetCount} feuilles ${plan.format} à imprimer et à assembler.`,
    };
  }

  return { sheetCount, level: "ok" };
}
