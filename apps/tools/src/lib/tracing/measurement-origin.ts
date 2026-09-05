/**
 * §28 — Responsabilité / précision.
 *
 * Toute grandeur produite par le workflow porte l'origine de sa mesure. Une valeur issue
 * d'une image non calibrée ne doit jamais être présentée comme une dimension réelle.
 */

export type MeasurementOrigin = "manual" | "calibrated" | "imported" | "approximated" | "exact";

export const MEASUREMENT_ORIGINS: readonly MeasurementOrigin[] = ["exact", "manual", "calibrated", "imported", "approximated"];

/** Niveau de confiance décroissant : `exact` > `manual` > `calibrated` > `imported` > `approximated`. */
const TRUST_RANK: Record<MeasurementOrigin, number> = {
  exact: 4,
  manual: 3,
  calibrated: 2,
  imported: 1,
  approximated: 0,
};

export type OriginedValue = {
  value: number;
  unit: "mm" | "mm²" | "m²" | "°";
  origin: MeasurementOrigin;
};

/** Vrai si la valeur peut être présentée comme une dimension chantier réelle. */
export function isRealWorldTrusted(origin: MeasurementOrigin): boolean {
  return origin === "exact" || origin === "manual" || origin === "calibrated";
}

/** Combine plusieurs origines : le maillon le plus faible l'emporte (§28). */
export function combineOrigins(...origins: readonly MeasurementOrigin[]): MeasurementOrigin {
  if (!origins.length) return "approximated";
  return origins.reduce((weakest, current) => (TRUST_RANK[current] < TRUST_RANK[weakest] ? current : weakest));
}

const LABELS: Record<MeasurementOrigin, string> = {
  manual: "Saisie manuelle",
  calibrated: "Image calibrée",
  imported: "Importé",
  approximated: "Approximation",
  exact: "Exact (géométrie)",
};

export function describeOrigin(origin: MeasurementOrigin): string {
  return LABELS[origin];
}

/** Mention à porter à côté d'une grandeur non fiable, sinon chaîne vide. */
export function originWarning(origin: MeasurementOrigin): string {
  return isRealWorldTrusted(origin) ? "" : "Valeur indicative — non vérifiée sur le chantier.";
}
