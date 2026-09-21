/**
 * Primitives de sérialisation partagées. Aucune dépendance, aucune date locale, aucun `Date`
 * dans le contrat : ce qui circule est du JSON, donc des chaînes ISO 8601 en UTC.
 */

/** Horodatage ISO 8601 en UTC (`2026-09-07T10:15:00.000Z`). */
export type IsoDateTime = string;

const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function isIsoDateTime(value: unknown): value is IsoDateTime {
  return (
    typeof value === "string" &&
    ISO_DATE_TIME_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/** Date civile ISO (`2026-09-07`), sans heure. */
export type IsoDate = string;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Code pays ISO-3166-1 alpha-2, en majuscules. Le contrat ne connaît pas de nom de pays :
 * « France », « FRANCE » et « fr » sont trois écritures d'une même valeur, et une seule est
 * comparable. La valeur par défaut de l'écosystème est {@link DEFAULT_COUNTRY_CODE}.
 */
export type CountryCode = string;

export const DEFAULT_COUNTRY_CODE = "FR";

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && COUNTRY_CODE_PATTERN.test(value);
}

/** Normalise une écriture libre de code pays. Retourne `null` si la valeur n'est pas exploitable. */
export function normalizeCountryCode(value: string | null | undefined): CountryCode | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toUpperCase();
  return COUNTRY_CODE_PATTERN.test(candidate) ? candidate : null;
}

export function isLatitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isLongitude(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

/**
 * Vrai pour un objet JSON simple. Écarte `null`, les tableaux et toute instance de classe :
 * une charge utile de contrat qui arrive du réseau n'a le droit d'être qu'un objet nu.
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Champ texte optionnel du contrat. La valeur absente s'écrit **toujours** `null`, jamais
 * `undefined` ni `""` : trois écritures du vide rendraient toute comparaison de deux fiches
 * client indécidable, et `JSON.stringify` efface `undefined` sans prévenir.
 */
export type NullableText = string | null;

export function isNullableText(value: unknown): value is NullableText {
  return value === null || typeof value === "string";
}

/**
 * Ramène une saisie humaine à la forme canonique du contrat : espaces de bord retirés, chaîne
 * vide ramenée à `null`.
 */
export function toNullableText(value: string | null | undefined): NullableText {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
