/**
 * Qualité et incertitude d'une mesure (§8 du brief noyau, §24 et §25 du brief drone).
 *
 * **Règle qui commande tout ce fichier : ne pas créer de précision fictive.**
 *
 * Les quatre niveaux de qualité existent, leurs *seuils* n'existent pas. Ils sont la sortie
 * de la campagne de validation métrologique (§107), qui n'a pas eu lieu. Ce module ne
 * contient donc **aucune fonction dérivant automatiquement un niveau à partir de métriques** :
 * une telle fonction serait un seuil inventé déguisé en code.
 *
 * De même, `uncertainty_value` est nullable, `null` est sa valeur correcte aujourd'hui, et
 * l'interface doit savoir afficher une mesure sans incertitude.
 */

import type { MeasurementUnit } from "./units";

export type MeasurementQualityLevel =
  | "indicative"
  | "standard"
  | "high_precision"
  | "rtk_gcp_controlled";

export const MEASUREMENT_QUALITY_LEVELS: readonly MeasurementQualityLevel[] = [
  "indicative",
  "standard",
  "high_precision",
  "rtk_gcp_controlled",
];

export function estMeasurementQualityLevel(value: unknown): value is MeasurementQualityLevel {
  return (
    typeof value === "string" && (MEASUREMENT_QUALITY_LEVELS as readonly string[]).includes(value)
  );
}

const QUALITY_LABELS: Record<MeasurementQualityLevel, string> = {
  indicative: "Indicatif",
  standard: "Standard",
  high_precision: "Haute précision",
  rtk_gcp_controlled: "Contrôlé RTK / points de calage",
};

export function describeQualityLevel(level: MeasurementQualityLevel): string {
  return QUALITY_LABELS[level];
}

/** Nature de la source de positionnement ayant servi au relevé. */
export type SourceAccuracy = "gnss_standard" | "gnss_rtk" | "ground_control_points" | "unknown";

export const SOURCE_ACCURACIES: readonly SourceAccuracy[] = [
  "gnss_standard",
  "gnss_rtk",
  "ground_control_points",
  "unknown",
];

/**
 * Métriques **mesurées** qui documentent une reconstruction ou une mesure. Toutes nullables :
 * une métrique absente reste absente, elle n'est jamais remplacée par une valeur plausible.
 */
export type QualityEvidence = {
  /** Erreur de reprojection moyenne, en pixels. Sortie du moteur, jamais estimée à la main. */
  readonly reprojection_error_px: number | null;
  /** GSD constaté, en millimètres par pixel. */
  readonly ground_sampling_distance_mm_px: number | null;
  /** Écart résiduel sur les points de calage, en mètres. */
  readonly control_point_error_m: number | null;
  /** Nature du positionnement d'acquisition. */
  readonly source_accuracy: SourceAccuracy | null;
};

export const QUALITY_EVIDENCE_INCONNUE: QualityEvidence = {
  reprojection_error_px: null,
  ground_sampling_distance_mm_px: null,
  control_point_error_m: null,
  source_accuracy: null,
};

/**
 * Qualité portée par une mesure. `level` est **déclaré** — par la campagne métrologique à
 * venir, ou par un opérateur qui engage sa responsabilité — jamais calculé par ce package.
 */
export type MeasurementQuality = {
  readonly level: MeasurementQualityLevel;
  readonly evidence: QualityEvidence;
  /** `null` tant que la campagne §107 n'a pas produit de valeur : c'est la bonne valeur. */
  readonly uncertainty_value: number | null;
  readonly uncertainty_unit: MeasurementUnit | null;
  /** §77 — vrai dès qu'un maillon de la chaîne provient d'une frame vidéo extraite. */
  readonly degraded_source: boolean;
};

/** Qualité par défaut d'une mesure produite avant toute validation métrologique. */
export const QUALITE_INDICATIVE_SANS_INCERTITUDE: MeasurementQuality = {
  level: "indicative",
  evidence: QUALITY_EVIDENCE_INCONNUE,
  uncertainty_value: null,
  uncertainty_unit: null,
  degraded_source: false,
};

/** Vrai si une incertitude a réellement été établie et peut être affichée. */
export function aUneIncertitudeEtablie(quality: MeasurementQuality): boolean {
  return quality.uncertainty_value !== null && quality.uncertainty_unit !== null;
}

/**
 * Texte d'incertitude à afficher. Retourne explicitement « inconnue » plutôt qu'un chiffre :
 * c'est l'application littérale du « ne jamais inventer » du §25.
 */
export function describeUncertainty(quality: MeasurementQuality): string {
  if (!aUneIncertitudeEtablie(quality)) return "Incertitude inconnue";
  return `± ${quality.uncertainty_value} ${quality.uncertainty_unit}`;
}

/**
 * Une incertitude n'est valide que complète : une valeur sans unité, ou une unité sans valeur,
 * est une donnée corrompue, pas une donnée partielle.
 */
export function estIncertitudeCoherente(quality: MeasurementQuality): boolean {
  return (quality.uncertainty_value === null) === (quality.uncertainty_unit === null);
}
