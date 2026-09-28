/**
 * Lot 8 — Unités du métré.
 *
 * Stockage interne UNIQUE et déterministe : millimètres (longueurs), mm² (surfaces), mm³ (volumes) —
 * les valeurs calculées par le serveur sont des décimaux exacts (`numeric`) arrondis au dixième de mm
 * pour les longueurs et à l'unité pour les surfaces et volumes. Les conversions d'affichage (mm, cm, m,
 * m², m³) passent par une arithmétique ENTIÈRE (division puis arrondi « au plus proche, moitié vers le
 * haut ») : aucune erreur de flottant du type 0,1 + 0,2 n'apparaît à l'écran, dans un CSV ou vers GP.
 */

export const LONGUEUR_UNITES = ["mm", "cm", "m"] as const;
export type LongueurUnite = (typeof LONGUEUR_UNITES)[number];
export const METRE_UNITES = ["mm", "cm", "m", "m2", "m3", "ml", "u"] as const;
export type MetreUnite = (typeof METRE_UNITES)[number];
export const METRE_UNITE_LABELS: Record<MetreUnite, string> = { mm: "mm", cm: "cm", m: "m", m2: "m²", m3: "m³", ml: "ml", u: "u" };

const MM_PAR: Record<LongueurUnite, number> = { mm: 1, cm: 10, m: 1000 };

/**
 * Arrondi décimal exact d'un nombre (moitié loin de zéro, comme `round()` de PostgreSQL sur `numeric`).
 * Passe par la notation exponentielle pour éviter 1,005 → 1,00.
 */
export function roundDecimal(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  const shifted = Number(`${Math.abs(value)}e${decimals}`);
  return (sign * Number(`${Math.round(shifted)}e${-decimals}`)) || 0;
}

/**
 * Valeur entière `value` / `divisor` arrondie à `decimals` décimales, rendue en chaîne à point décimal
 * (« 10.64 »). Arithmétique entière : `value` est arrondie à l'unité d'abord (mm², mm³ entiers).
 */
export function fixedFromInteger(value: number, divisor: number, decimals: number): string {
  const unit = 10 ** decimals;
  // divisor / unit est entier pour les usages prévus (10^n) : quotient exact en entiers.
  const step = divisor / unit;
  const integer = Math.round(Math.abs(value));
  const scaled = Number.isInteger(step) && step >= 1 ? Math.floor((integer + Math.floor(step / 2)) / step) : Math.round(integer / step);
  const sign = value < 0 && scaled !== 0 ? "-" : "";
  const whole = Math.floor(scaled / unit);
  const fraction = decimals > 0 ? `.${String(scaled % unit).padStart(decimals, "0")}` : "";
  return `${sign}${whole}${fraction}`;
}

function frenchNumber(fixed: string, grouping = true): string {
  const [whole, fraction] = fixed.split(".");
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;
  const grouped = grouping ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : digits;
  return `${negative ? "-" : ""}${grouped}${fraction !== undefined ? `,${fraction}` : ""}`;
}

/** mm → « 4,20 m », « 420 cm », « 4 200 mm ». */
export function formatLongueur(mm: number | null, unite: LongueurUnite = "m", decimals = unite === "m" ? 2 : unite === "cm" ? 1 : 0): string {
  if (mm === null || !Number.isFinite(mm)) return "—";
  // Longueurs au dixième de mm : on travaille en dixièmes (entiers).
  return `${frenchNumber(fixedFromInteger(mm * 10, MM_PAR[unite] * 10, decimals))} ${unite}`;
}

/** mm² → « 10,64 m² ». */
export function formatSurface(mm2: number | null, decimals = 2): string {
  if (mm2 === null || !Number.isFinite(mm2)) return "—";
  return `${frenchNumber(fixedFromInteger(mm2, 1_000_000, decimals))} m²`;
}

/** mm³ → « 26,60 m³ ». */
export function formatVolume(mm3: number | null, decimals = 2): string {
  if (mm3 === null || !Number.isFinite(mm3)) return "—";
  return `${frenchNumber(fixedFromInteger(mm3, 1_000_000_000, decimals))} m³`;
}

/** Linéaire (mm) → « 12,30 ml ». */
export function formatLineaire(mm: number | null, decimals = 2): string {
  if (mm === null || !Number.isFinite(mm)) return "—";
  return `${frenchNumber(fixedFromInteger(mm * 10, 10_000, decimals))} ml`;
}

/** Valeur interne (mm, mm², mm³) → nombre dans l'unité d'échange (m, m², m³), `decimals` décimales, exact. */
export function toExchange(value: number, kind: "longueur" | "surface" | "volume", decimals = 3): number {
  if (kind === "longueur") return Number(fixedFromInteger(value * 10, 10_000, decimals));
  return Number(fixedFromInteger(value, kind === "surface" ? 1_000_000 : 1_000_000_000, decimals));
}

/** Même valeur, notation française sans séparateur de milliers (CSV). */
export function toExchangeText(value: number | null, kind: "longueur" | "surface" | "volume", decimals = 3): string {
  if (value === null || !Number.isFinite(value)) return "";
  const fixed = kind === "longueur" ? fixedFromInteger(value * 10, 10_000, decimals) : fixedFromInteger(value, kind === "surface" ? 1_000_000 : 1_000_000_000, decimals);
  return frenchNumber(fixed, false);
}

export type ParsedValue = { ok: true; value: number | null } | { ok: false; message: string };

function parseDecimalText(input: string): number | null | undefined {
  const trimmed = input.trim().replace(/[\s ]/g, "").replace(",", ".");
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

/** Saisie d'une longueur dans l'unité choisie → mm (au dixième), bornée (0 exclu, 1 km). */
export function parseLongueur(input: string, unite: LongueurUnite): ParsedValue {
  const value = parseDecimalText(input);
  if (value === undefined) return { ok: false, message: `Longueur en ${unite} attendue.` };
  if (value === null) return { ok: true, value: null };
  const mm = roundDecimal(value * MM_PAR[unite], 1);
  if (!(mm > 0) || mm > 1_000_000) return { ok: false, message: "Longueur entre 0,1 mm et 1 km." };
  return { ok: true, value: mm };
}

/** Saisie d'une surface en m² → mm² entiers (≤ 1 km²). */
export function parseSurfaceM2(input: string): ParsedValue {
  const value = parseDecimalText(input);
  if (value === undefined) return { ok: false, message: "Surface en m² attendue (ex. 10,50)." };
  if (value === null) return { ok: true, value: null };
  const mm2 = roundDecimal(value * 1_000_000, 0);
  if (mm2 < 0 || mm2 > 1e12) return { ok: false, message: "Surface hors bornes." };
  return { ok: true, value: mm2 };
}

/** Saisie d'un volume en m³ → mm³ entiers. */
export function parseVolumeM3(input: string): ParsedValue {
  const value = parseDecimalText(input);
  if (value === undefined) return { ok: false, message: "Volume en m³ attendu (ex. 26,6)." };
  if (value === null) return { ok: true, value: null };
  return { ok: true, value: roundDecimal(value * 1_000_000_000, 0) };
}

/** Saisie d'un linéaire en ml → mm (au dixième). */
export function parseLineaireMl(input: string): ParsedValue {
  const value = parseDecimalText(input);
  if (value === undefined) return { ok: false, message: "Linéaire en ml attendu (ex. 12,30)." };
  if (value === null) return { ok: true, value: null };
  return { ok: true, value: roundDecimal(value * 1000, 1) };
}

/** Pourcentage (« 10 », « 12,5 ») → nombre, 0–100, deux décimales au plus (règle serveur). */
export function parsePourcent(input: string): ParsedValue {
  const value = parseDecimalText(input);
  if (value === undefined || value === null) return { ok: false, message: "Pourcentage attendu (ex. 10)." };
  if (value > 100 || roundDecimal(value, 2) !== value) return { ok: false, message: "Perte entre 0 et 100 % (deux décimales au plus)." };
  return { ok: true, value };
}
