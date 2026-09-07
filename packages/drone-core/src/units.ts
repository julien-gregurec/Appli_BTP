/**
 * Unités canon d'ELSATIA Drone (§6 du brief noyau, §K de
 * `docs/drone/ELSATIA_DRONE_ARCHITECTURE_MVP_V1.md`).
 *
 * Trois règles, et elles ne souffrent pas d'exception dans les contrats :
 *
 * 1. **Géométrie relevée** — longueurs en mètres (`m`), surfaces en mètres carrés (`m2`).
 *    C'est l'échelle du bâtiment, et c'est celle du modèle de données.
 * 2. **Spécifications matériel et marges de pose** — millimètres (`mm`). Un fabricant de
 *    panneaux publie des dimensions en millimètres, une marge de rive se pose au millimètre :
 *    les convertir en mètres ne ferait qu'introduire des flottants approchés.
 * 3. **Angles** — degrés (`deg`) dans **tout** contrat exporté ou persisté. Les radians
 *    restent une unité de calcul interne, jamais une unité de contrat ; la conversion est
 *    explicite et passe par les fonctions ci-dessous.
 *
 * La pente est publiée dans les deux unités (`deg` et `percent`) sans arrondi imposé (§67).
 */

/** Unité d'une valeur de mesure exposée par un contrat. */
export type MeasurementUnit = "m" | "m2" | "deg" | "percent";

export const MEASUREMENT_UNITS: readonly MeasurementUnit[] = ["m", "m2", "deg", "percent"];

/**
 * Correspondance avec l'énumération française du modèle de données
 * (`docs/drone/ELSATIA_DRONE_DATA_MODEL_V1.md` §3.5, colonne `unite`).
 */
export const MEASUREMENT_UNIT_DB_CODES: Readonly<Record<MeasurementUnit, string>> = {
  m: "m",
  m2: "m2",
  deg: "deg",
  percent: "pourcent",
};

export function estMeasurementUnit(value: unknown): value is MeasurementUnit {
  return typeof value === "string" && (MEASUREMENT_UNITS as readonly string[]).includes(value);
}

/** Unité attendue pour une grandeur donnée, quand elle est imposée par la grandeur elle-même. */
export const UNIT_LABELS: Readonly<Record<MeasurementUnit, string>> = {
  m: "mètre",
  m2: "mètre carré",
  deg: "degré",
  percent: "pourcent",
};

// --- Référentiels d'altitude (§68 : ne jamais mélanger les quatre) -------------------

/**
 * §68 — altitude GPS, hauteur relative au décollage, hauteur projet et référentiel local
 * sont quatre grandeurs différentes. Aucune valeur d'altitude n'existe dans ces contrats
 * sans son référentiel.
 */
export type AltitudeReference =
  | "wgs84_ellipsoid"
  | "mean_sea_level"
  | "relative_to_takeoff"
  | "project_local";

export const ALTITUDE_REFERENCES: readonly AltitudeReference[] = [
  "wgs84_ellipsoid",
  "mean_sea_level",
  "relative_to_takeoff",
  "project_local",
];

export function estAltitudeReference(value: unknown): value is AltitudeReference {
  return typeof value === "string" && (ALTITUDE_REFERENCES as readonly string[]).includes(value);
}

/** Altitude toujours porteuse de son référentiel. */
export type Altitude = {
  readonly value_m: number;
  readonly reference: AltitudeReference;
};

// --- Position géographique (§6 : WGS84) ---------------------------------------------

/**
 * Coordonnée géographique. Le système est **WGS84 et uniquement WGS84** dans les contrats :
 * toute projection (Lambert 93, UTM…) appartient à la couche de calcul, jamais au contrat.
 */
export type Wgs84Position = {
  readonly latitude_deg: number;
  readonly longitude_deg: number;
  readonly altitude: Altitude | null;
};

export const GEODETIC_DATUM = "WGS84" as const;

export function estLatitudeValide(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function estLongitudeValide(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

// --- Géométrie ----------------------------------------------------------------------

/** Point 2D en mètres, exprimé dans le repère du produit orthophoto / plan. */
export type Point2D = {
  readonly x_m: number;
  readonly y_m: number;
};

/** Point 3D en mètres, exprimé dans le `ReferenceFrame` du modèle qui le porte. */
export type Point3D = {
  readonly x_m: number;
  readonly y_m: number;
  readonly z_m: number;
};

/**
 * Repère d'expression d'une géométrie. Une coordonnée sans repère n'est pas une coordonnée :
 * c'est trois nombres.
 */
export type ReferenceFrame =
  | { readonly kind: "reconstruction_local"; readonly reconstruction_result_version: number }
  | { readonly kind: "project_local"; readonly origin: Wgs84Position }
  | { readonly kind: "projected"; readonly epsg_code: number };

// --- Conversions explicites ---------------------------------------------------------

const DEG_PER_RAD = 180 / Math.PI;

/** Degrés → radians. Les radians ne sortent jamais d'un calcul vers un contrat. */
export function degreesToRadians(degrees: number): number {
  return degrees / DEG_PER_RAD;
}

/** Radians → degrés, seule porte d'entrée d'un calcul trigonométrique vers un contrat. */
export function radiansToDegrees(radians: number): number {
  return radians * DEG_PER_RAD;
}

export function metresToMillimetres(metres: number): number {
  return metres * 1000;
}

export function millimetresToMetres(millimetres: number): number {
  return millimetres / 1000;
}

/** Pente en degrés → pente en pourcent. 45° vaut 100 %. */
export function slopeDegreesToPercent(slopeDegrees: number): number {
  return Math.tan(degreesToRadians(slopeDegrees)) * 100;
}

/** Pente en pourcent → pente en degrés. */
export function slopePercentToDegrees(slopePercent: number): number {
  return radiansToDegrees(Math.atan(slopePercent / 100));
}

/**
 * Azimut normalisé dans `[0, 360)` degrés, nord géographique = 0, sens horaire.
 * Le nord magnétique n'est jamais utilisé dans un contrat.
 */
export function normalizeAzimuthDegrees(azimuthDegrees: number): number {
  const normalized = azimuthDegrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

/**
 * GSD (ground sampling distance) canon : **millimètres par pixel**.
 * Le millimètre est retenu parce qu'un relevé de toiture utile tourne autour de 5 à 30 mm/px,
 * intervalle où le centimètre par pixel perdrait un chiffre significatif.
 */
export type GroundSamplingDistance = {
  readonly value_mm_per_px: number;
};
