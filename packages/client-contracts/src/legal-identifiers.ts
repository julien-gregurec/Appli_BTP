/**
 * Identifiants légaux français — validation de format et de clé de contrôle.
 *
 * L'audit relève que `clients.siret` n'est contraint par rien et qu'il est **imprimé sur la
 * facture** (risque R5). Le contrat ne peut pas corriger la base, mais il peut refuser de
 * transporter un SIRET qui n'en est pas un : c'est le rôle de ce module.
 *
 * La validation est **de forme et de clé**, jamais d'existence : aucun appel réseau, aucune
 * consultation de base entreprise. Un SIRET syntaxiquement valide peut désigner un
 * établissement fermé — c'est hors du périmètre d'un contrat de données.
 */

import { keepDigits, normalizeActivityCode, normalizeVatNumber } from "./normalization";

/**
 * Somme de Luhn. Le SIREN (9 chiffres) et le SIRET (14 chiffres) la vérifient tous les deux,
 * en pondérant un rang sur deux **à partir du second chiffre en partant de la droite**.
 */
function satisfiesLuhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const character = digits[digits.length - 1 - index];
    if (character === undefined) return false;
    let value = character.charCodeAt(0) - 48;
    if (value < 0 || value > 9) return false;
    if (index % 2 === 1) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
  }
  return sum % 10 === 0;
}

/**
 * Exception documentée : les établissements de La Poste (SIREN `356000000`) ne satisfont pas
 * Luhn. Leur règle officielle est que la somme des 14 chiffres soit un multiple de 5. Refuser
 * ces SIRET reviendrait à interdire de facturer La Poste.
 */
const LA_POSTE_SIREN = "356000000";

function isLaPosteSiret(digits: string): boolean {
  if (!digits.startsWith(LA_POSTE_SIREN)) return false;
  let sum = 0;
  for (const character of digits) sum += character.charCodeAt(0) - 48;
  return sum % 5 === 0;
}

/** Vrai pour un SIREN : 9 chiffres, clé de Luhn correcte. */
export function isValidSiren(value: string | null | undefined): boolean {
  const digits = keepDigits(value);
  return digits.length === 9 && satisfiesLuhn(digits);
}

/** Vrai pour un SIRET : 14 chiffres, clé de Luhn correcte (ou exception La Poste). */
export function isValidSiret(value: string | null | undefined): boolean {
  const digits = keepDigits(value);
  if (digits.length !== 14) return false;
  return satisfiesLuhn(digits) || isLaPosteSiret(digits);
}

/** Extrait le SIREN des 9 premiers chiffres d'un SIRET. `null` si le SIRET est mal formé. */
export function sirenFromSiret(value: string | null | undefined): string | null {
  const digits = keepDigits(value);
  return digits.length === 14 ? digits.slice(0, 9) : null;
}

/** Clé de TVA intracommunautaire française : `(12 + 3 × (SIREN mod 97)) mod 97`, sur 2 chiffres. */
export function computeFrenchVatKey(siren: string | null | undefined): string | null {
  const digits = keepDigits(siren);
  if (digits.length !== 9) return null;
  const key = (12 + 3 * (Number.parseInt(digits, 10) % 97)) % 97;
  return key.toString().padStart(2, "0");
}

const VAT_GENERIC_PATTERN = /^[A-Z]{2}[0-9A-Z]{2,13}$/;
const VAT_FR_PATTERN = /^FR[0-9A-Z]{2}\d{9}$/;

/**
 * Vrai pour un numéro de TVA intracommunautaire exploitable.
 *
 * Pour `FR`, la clé est **vérifiée** quand elle est numérique et que le SIREN est valide. Les
 * clés alphabétiques (attribuées à certaines entreprises) sont acceptées sur le format seul :
 * leur algorithme n'est pas public. Pour les autres pays, seul le format général est vérifié —
 * inventer 26 algorithmes nationaux non vérifiables serait une fausse garantie.
 */
export function isValidVatNumber(value: string | null | undefined): boolean {
  const normalized = normalizeVatNumber(value);
  if (normalized === null || !VAT_GENERIC_PATTERN.test(normalized)) return false;
  if (!normalized.startsWith("FR")) return true;
  if (!VAT_FR_PATTERN.test(normalized)) return false;

  const key = normalized.slice(2, 4);
  const siren = normalized.slice(4);
  if (!isValidSiren(siren)) return false;
  if (!/^\d{2}$/.test(key)) return true;
  return computeFrenchVatKey(siren) === key;
}

/** Construit le numéro de TVA français d'un SIREN valide. `null` si le SIREN ne l'est pas. */
export function buildFrenchVatNumber(siren: string | null | undefined): string | null {
  if (!isValidSiren(siren)) return null;
  const digits = keepDigits(siren);
  const key = computeFrenchVatKey(digits);
  return key === null ? null : `FR${key}${digits}`;
}

const ACTIVITY_CODE_PATTERN = /^\d{4}[A-Z]$/;

/** Vrai pour un code APE/NAF : 4 chiffres et une lettre, le point étant optionnel à la saisie. */
export function isValidActivityCode(value: string | null | undefined): boolean {
  const normalized = normalizeActivityCode(value);
  return normalized !== null && ACTIVITY_CODE_PATTERN.test(normalized);
}

const FRENCH_POSTAL_CODE_PATTERN = /^\d{5}$/;

/**
 * Vrai pour un code postal cohérent avec le pays. La France impose 5 chiffres ; ailleurs, le
 * contrat se contente d'une forme non vide de 2 à 12 caractères alphanumériques — c'est la
 * borne déjà retenue par `reserves_chantiers.code_postal` dans l'écosystème.
 */
export function isValidPostalCode(value: string | null | undefined, countryCode: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (countryCode === "FR") return FRENCH_POSTAL_CODE_PATTERN.test(trimmed);
  return /^[0-9A-Za-z -]{2,12}$/.test(trimmed);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/**
 * Vrai pour une adresse e-mail plausible. Volontairement permissif : le contrat écarte les
 * saisies manifestement fausses, il n'implémente pas la RFC 5322, qui accepte des formes que
 * personne n'utilise et dont la validation exhaustive produit surtout des faux négatifs.
 */
export function isPlausibleEmail(value: string | null | undefined): boolean {
  return typeof value === "string" && EMAIL_PATTERN.test(value.trim());
}

/** Vrai pour un numéro de téléphone plausible : 6 à 15 chiffres une fois la mise en forme retirée. */
export function isPlausiblePhoneNumber(value: string | null | undefined): boolean {
  const digits = keepDigits(value);
  return digits.length >= 6 && digits.length <= 15;
}
