// GP_V1_RC — extrait minimal et non modifié de `@elsatia/client-contracts` (paquet absent de la
// 211-baseline `release/commercialisation-v1`). Seules les trois fonctions pures réellement
// utilisées par GP (`normalizeVatNumber`, `isValidVatNumber`, `isPlausibleEmail`) sont vendues
// ici plutôt que d'embarquer le paquet entier — voir le rapport RC pour la justification.
// Source : packages/client-contracts/src/{normalization,legal-identifiers}.ts.

function keepDigits(input: string | null | undefined): string {
  return typeof input === "string" ? input.replace(/\D/g, "") : "";
}

export function normalizeVatNumber(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length === 0 ? null : normalized;
}

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

function isValidSiren(value: string | null | undefined): boolean {
  const digits = keepDigits(value);
  return digits.length === 9 && satisfiesLuhn(digits);
}

function computeFrenchVatKey(siren: string | null | undefined): string | null {
  const digits = keepDigits(siren);
  if (digits.length !== 9) return null;
  const key = (12 + 3 * (Number.parseInt(digits, 10) % 97)) % 97;
  return key.toString().padStart(2, "0");
}

const VAT_GENERIC_PATTERN = /^[A-Z]{2}[0-9A-Z]{2,13}$/;
const VAT_FR_PATTERN = /^FR[0-9A-Z]{2}\d{9}$/;

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function isPlausibleEmail(value: string | null | undefined): boolean {
  return typeof value === "string" && EMAIL_PATTERN.test(value.trim());
}
