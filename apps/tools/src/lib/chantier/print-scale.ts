/**
 * §6 — Distinction échelle d'affichage / échelle réelle.
 *
 * Un plan ajusté à la page n'est jamais à l'échelle 1:1. Ce module traduit le facteur de
 * projection réellement appliqué (`createPlanTransform().scale`, monde mm → page mm) en un
 * libellé honnête.
 *
 * Règle non négociable : « 1:1 » n'est produit que si le facteur vaut exactement 1. Une
 * échelle ajustée à la page tombe presque toujours sur un rapport non normalisé (1:23,4…) ;
 * elle est alors annoncée comme ajustée, jamais arrondie vers une échelle normalisée voisine
 * qui laisserait croire qu'on peut mesurer sur le plan avec un kutch.
 */

export type DisplayScaleKind = "full-size" | "standard" | "fitted";

export type DisplayScale = {
  /** Facteur monde → page (0,05 = le plan est 20 fois plus petit que la réalité). */
  factor: number;
  /** Dénominateur du rapport 1:N. */
  ratio: number;
  /** Libellé court, ex. « 1:20 » ou « 1:23,4 ». */
  label: string;
  kind: DisplayScaleKind;
  /** Phrase complète destinée au cartouche / à la page plan. */
  caption: string;
};

/** Échelles normalisées reconnues (ISO 5455 usuelles du bâtiment). */
export const STANDARD_RATIOS: readonly number[] = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];

const FULL_SIZE_EPSILON = 1e-9;
/** Tolérance relative sous laquelle un rapport ajusté est considéré comme normalisé. */
const STANDARD_TOLERANCE = 1e-6;

/**
 * Formate le dénominateur d'un rapport. Précision adaptative : un rapport voisin de 1 mais
 * différent de 1 (facteur 0,999 → 1,001) ne doit JAMAIS être arrondi en « 1 », sans quoi le
 * libellé afficherait « 1:1 » pour un plan qui n'est pas à taille réelle — précisément la
 * confusion que ce module existe pour interdire.
 */
const formatRatio = (ratio: number): string => {
  for (const digits of [1, 2, 3]) {
    const rounded = Number(ratio.toFixed(digits));
    if (rounded !== 1) return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits).replace(".", ",");
  }
  return ratio.toFixed(3).replace(".", ",");
};

/**
 * Décrit l'échelle correspondant à un facteur de projection.
 * @param factor facteur monde → page (mm/mm). Doit être fini et strictement positif.
 */
export function describeDisplayScale(factor: number): DisplayScale {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error("Le facteur d'échelle doit être un nombre fini strictement positif.");
  }

  if (Math.abs(factor - 1) < FULL_SIZE_EPSILON) {
    return {
      factor: 1,
      ratio: 1,
      label: "1:1",
      kind: "full-size",
      caption: "Échelle 1:1 — dimensions réelles.",
    };
  }

  const ratio = 1 / factor;
  const standard = STANDARD_RATIOS.find((candidate) => Math.abs(ratio - candidate) <= candidate * STANDARD_TOLERANCE);
  if (standard !== undefined && standard !== 1) {
    return {
      factor,
      ratio: standard,
      label: `1:${standard}`,
      kind: "standard",
      caption: `Échelle 1:${standard} — plan de lecture, ne pas mesurer directement sur le papier.`,
    };
  }

  return {
    factor,
    ratio,
    label: `1:${formatRatio(ratio)}`,
    kind: "fitted",
    caption: `Échelle ajustée à la page (environ 1:${formatRatio(ratio)}) — plan de lecture, ne pas mesurer directement sur le papier.`,
  };
}

/** Libellé de l'échelle réelle d'un gabarit imprimé sans réduction (§14). */
export const FULL_SIZE_SCALE: DisplayScale = describeDisplayScale(1);
