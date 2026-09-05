/**
 * Formatage d'affichage pour l'Atelier (report + metres).
 *
 * Aucun calcul metier ici : uniquement de la mise en forme de nombres deja produits par
 * le backend (`@/lib/chantier`). Separateur decimal virgule, comme `formatReportRow`.
 * Separateur de milliers : espace ASCII simple (rendu previsible en test comme en PDF).
 */

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/** Nombre vers chaine francaise a `fractionDigits` decimales fixes (1234.5 -> "1 234,5"). */
export function formatDecimal(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return "—";
  const negative = value < 0;
  const [intPart, decPart] = Math.abs(value).toFixed(fractionDigits).split(".");
  const grouped = intPart.replace(THOUSANDS, " ");
  const body = decPart ? grouped + "," + decPart : grouped;
  return negative ? "-" + body : body;
}

/** Longueur en millimetres (1386.5 -> "1 386,5 mm"). */
export function formatMm(value: number, fractionDigits = 1): string {
  return formatDecimal(value, fractionDigits) + " mm";
}

/** Quantite de nomenclature avec son unite (18.42, "ml" -> "18,42 ml"). */
export function formatQuantity(value: number, unit: string, fractionDigits = 2): string {
  const digits = unit === "u" ? 0 : fractionDigits;
  return formatDecimal(value, digits) + " " + unit;
}

/** Pourcentage entier ou a une decimale (10 -> "10 %", 7.5 -> "7,5 %"). */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return formatDecimal(rounded, Number.isInteger(rounded) ? 0 : 1) + " %";
}
