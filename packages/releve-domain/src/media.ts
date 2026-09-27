/**
 * Photos de terrain (Lot 4 — capture photo & médias V1).
 *
 * Une photo = un fichier du bucket privé (`tools_releves_medias`, catégorie `photos`) + ses
 * **métadonnées de preuve** (colonne `metadata`, immuable après dépôt) + un ou plusieurs
 * `PhotoAnchor` qui la rattachent au relevé (voir `photo.ts`).
 *
 * Règles de confidentialité (miroir du CHECK SQL `tools_releve_media_metadata_valide`) :
 * - liste **fermée** de clés : aucune clé de géolocalisation ne peut être stockée ;
 * - la photo est **toujours ré-encodée** avant envoi (voir {@link PHOTO_COMPRESSION}) : l'EXIF
 *   d'origine — GPS, numéro de série, modèle d'appareil — ne quitte jamais l'appareil ;
 * - l'auteur n'est pas une métadonnée déclarative : c'est `created_by`, imposé par le serveur.
 */

import { isUuid } from "./ids";
import { exifSwapsDimensions, type ExifSummary } from "./exif";

/** Mode de capture, choisi par le bouton utilisé (jamais deviné). */
export const PHOTO_SOURCES = ["camera_web", "camera_appareil", "import"] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];
export const PHOTO_SOURCE_LABELS: Record<PhotoSource, string> = {
  camera_web: "Caméra (navigateur)",
  camera_appareil: "Appareil photo",
  import: "Photo importée",
};

/** Origine de l'horodatage : EXIF de l'original, horloge au moment de la capture, date du fichier. */
export const PHOTO_DATE_SOURCES = ["exif", "capture", "fichier"] as const;
export type PhotoDateSource = (typeof PHOTO_DATE_SOURCES)[number];

export const PHOTO_ORIENTATIONS = ["portrait", "paysage", "carre"] as const;
export type PhotoOrientation = (typeof PHOTO_ORIENTATIONS)[number];

export type PhotoMetadata = {
  readonly source: PhotoSource;
  /** Date et heure de prise de vue (ISO-8601, avec décalage quand il est connu). */
  readonly priseLe: string | null;
  readonly priseLeSource: PhotoDateSource | null;
  /** Orientation de l'image stockée (déjà redressée). */
  readonly orientation: PhotoOrientation;
  /** Orientation EXIF de l'original (1–8), conservée pour la traçabilité. */
  readonly orientationExif: number | null;
  readonly largeurPx: number;
  readonly hauteurPx: number;
  readonly largeurOriginePx: number | null;
  readonly hauteurOriginePx: number | null;
  readonly tailleOrigineOctets: number | null;
  readonly compressionQualite: number | null;
  readonly compressionCoteMaxPx: number | null;
  /** SHA-256 des octets déposés : preuve d'intégrité du fichier stocké. */
  readonly empreinteSha256: string;
  /** L'original contenait un bloc GPS, retiré par le ré-encodage. */
  readonly gpsRetire: boolean;
  /** Photo remplacée par celle-ci (lignée conservée, l'ancienne est retirée). */
  readonly remplaceMediaId: string | null;
};

/** Clés admises, dans l'ordre du CHECK SQL. Toute autre clé est refusée. */
export const PHOTO_METADATA_KEYS = [
  "source", "priseLe", "priseLeSource", "orientation", "orientationExif", "largeurPx", "hauteurPx",
  "largeurOriginePx", "hauteurOriginePx", "tailleOrigineOctets", "compressionQualite", "compressionCoteMaxPx",
  "empreinteSha256", "gpsRetire", "remplaceMediaId",
] as const satisfies readonly (keyof PhotoMetadata)[];

export const PHOTO_METADATA_REQUIRED_KEYS = ["source", "orientation", "largeurPx", "hauteurPx", "empreinteSha256"] as const satisfies readonly (keyof PhotoMetadata)[];

/** Clés de géolocalisation explicitement interdites (défense en profondeur, en plus de la liste fermée). */
export const FORBIDDEN_LOCATION_KEYS = ["gps", "latitude", "longitude", "lat", "lng", "lon", "altitude", "geolocalisation", "position", "coords"] as const;

export const PHOTO_MAX_PX = 20_000;

/**
 * Compression « preuve terrain » : grand côté ≤ 3 072 px (≈ 9 Mpx pour un capteur 4:3, les
 * détails d'un tableau électrique ou d'une fissure restent lisibles), JPEG qualité 0,85. Si le
 * fichier dépasse encore la limite de la catégorie, on descend par paliers (qualité puis taille),
 * jamais en dessous de 1 600 px ni de 0,6.
 */
export const PHOTO_COMPRESSION = {
  mimeType: "image/jpeg",
  maxLongEdgePx: 3072,
  quality: 0.85,
  /** Cible de confort : au-delà, un palier plus économe est tenté. */
  targetMaxBytes: 4 * 1024 * 1024,
  steps: [
    { maxLongEdgePx: 3072, quality: 0.85 },
    { maxLongEdgePx: 3072, quality: 0.75 },
    { maxLongEdgePx: 2400, quality: 0.72 },
    { maxLongEdgePx: 1600, quality: 0.6 },
  ],
} as const;

export type CompressionPlan = { readonly width: number; readonly height: number; readonly quality: number; readonly maxLongEdgePx: number; readonly scaled: boolean };

/**
 * Dimensions de sortie pour un palier : proportions conservées, jamais d'agrandissement.
 * `width`/`height` sont celles de l'image **redressée** (orientation EXIF déjà appliquée).
 */
export function planPhotoCompression(width: number, height: number, step = 0): CompressionPlan {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error("Dimensions d'image invalides.");
  const palier = PHOTO_COMPRESSION.steps[Math.min(Math.max(0, Math.trunc(step)), PHOTO_COMPRESSION.steps.length - 1)];
  const longEdge = Math.max(width, height);
  const ratio = longEdge > palier.maxLongEdgePx ? palier.maxLongEdgePx / longEdge : 1;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
    quality: palier.quality,
    maxLongEdgePx: palier.maxLongEdgePx,
    scaled: ratio < 1,
  };
}

/** Faut-il tenter le palier suivant ? */
export function needsNextCompressionStep(bytes: number, step: number, hardLimitBytes: number): boolean {
  if (step >= PHOTO_COMPRESSION.steps.length - 1) return false;
  return bytes > PHOTO_COMPRESSION.targetMaxBytes || bytes > hardLimitBytes;
}

export function orientationOf(width: number, height: number): PhotoOrientation {
  if (width === height) return "carre";
  return width > height ? "paysage" : "portrait";
}

export type PhotoMetadataInput = {
  source: PhotoSource;
  exif: ExifSummary | null;
  /** Horloge de l'appareil au moment d'une capture caméra (source `camera_web`). */
  captureAt?: string | null;
  /** `File.lastModified` pour un import sans EXIF. */
  fileLastModified?: number | null;
  original: { width: number; height: number; bytes: number };
  stored: { width: number; height: number; quality: number | null; maxLongEdgePx: number | null };
  sha256: string;
  remplaceMediaId?: string | null;
};

/**
 * Métadonnées d'une photo prête à déposer. Priorité de date : EXIF (instant réel de prise de
 * vue) > horloge de capture > date du fichier. Aucune donnée de position n'est lue.
 */
export function buildPhotoMetadata(input: PhotoMetadataInput): PhotoMetadata {
  const exifDate = input.exif?.dateTimeOriginal ?? null;
  const fileDate = input.fileLastModified && Number.isFinite(input.fileLastModified) ? new Date(input.fileLastModified).toISOString() : null;
  const [priseLe, priseLeSource]: [string | null, PhotoDateSource | null] = exifDate
    ? [exifDate, "exif"]
    : input.captureAt ? [input.captureAt, "capture"] : fileDate ? [fileDate, "fichier"] : [null, null];
  const exifOrientation = input.exif?.orientation ?? null;
  // L'EXIF décrit l'image AVANT rotation : on ramène ses dimensions dans le sens affiché.
  const swap = exifSwapsDimensions(exifOrientation);
  return {
    source: input.source,
    priseLe,
    priseLeSource,
    orientation: orientationOf(input.stored.width, input.stored.height),
    orientationExif: exifOrientation,
    largeurPx: input.stored.width,
    hauteurPx: input.stored.height,
    largeurOriginePx: swap ? input.original.height : input.original.width,
    hauteurOriginePx: swap ? input.original.width : input.original.height,
    tailleOrigineOctets: input.original.bytes,
    compressionQualite: input.stored.quality,
    compressionCoteMaxPx: input.stored.maxLongEdgePx,
    empreinteSha256: input.sha256,
    gpsRetire: input.exif?.hasGps === true,
    remplaceMediaId: input.remplaceMediaId ?? null,
  };
}

export type MetadataIssue = { readonly key: string; readonly message: string };

const isInt = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const nullable = (value: unknown, check: (value: unknown) => boolean) => value === null || check(value);

/**
 * Validation stricte (miroir de `tools_releve_media_metadata_valide`). Un objet vide est
 * admis (médias non photo et lignes antérieures au Lot 4).
 */
export function validatePhotoMetadata(value: unknown): MetadataIssue[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [{ key: "metadata", message: "Objet attendu." }];
  const record = value as Record<string, unknown>;
  const issues: MetadataIssue[] = [];
  for (const key of Object.keys(record)) {
    if ((FORBIDDEN_LOCATION_KEYS as readonly string[]).includes(key.toLowerCase())) issues.push({ key, message: "Donnée de localisation interdite." });
    else if (!(PHOTO_METADATA_KEYS as readonly string[]).includes(key)) issues.push({ key, message: "Clé non autorisée." });
  }
  if (Object.keys(record).length === 0) return issues;
  const check = (key: keyof PhotoMetadata, ok: boolean, message: string) => { if (key in record && !ok) issues.push({ key, message }); };
  // Clés obligatoires dès que l'objet n'est pas vide (miroir du CHECK SQL).
  for (const key of PHOTO_METADATA_REQUIRED_KEYS) if (!(key in record)) issues.push({ key, message: "Clé obligatoire." });
  check("source", (PHOTO_SOURCES as readonly unknown[]).includes(record.source), "Source inconnue.");
  check("priseLe", nullable(record.priseLe, (v) => typeof v === "string" && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)), "Horodatage ISO-8601 attendu.");
  check("priseLeSource", nullable(record.priseLeSource, (v) => (PHOTO_DATE_SOURCES as readonly unknown[]).includes(v)), "Origine de date inconnue.");
  check("orientation", (PHOTO_ORIENTATIONS as readonly unknown[]).includes(record.orientation), "Orientation inconnue.");
  check("orientationExif", nullable(record.orientationExif, (v) => isInt(v, 1, 8)), "Orientation EXIF 1–8.");
  for (const key of ["largeurPx", "hauteurPx"] as const) check(key, isInt(record[key], 1, PHOTO_MAX_PX), `Entier 1–${PHOTO_MAX_PX}.`);
  for (const key of ["largeurOriginePx", "hauteurOriginePx"] as const) check(key, nullable(record[key], (v) => isInt(v, 1, 100_000)), "Entier positif.");
  check("tailleOrigineOctets", nullable(record.tailleOrigineOctets, (v) => isInt(v, 1, 500 * 1024 * 1024)), "Taille invalide.");
  check("compressionQualite", nullable(record.compressionQualite, (v) => typeof v === "number" && v >= 0.3 && v <= 1), "Qualité 0,3–1.");
  check("compressionCoteMaxPx", nullable(record.compressionCoteMaxPx, (v) => isInt(v, 256, PHOTO_MAX_PX)), "Côté maximal invalide.");
  check("empreinteSha256", typeof record.empreinteSha256 === "string" && /^[0-9a-f]{64}$/.test(record.empreinteSha256), "SHA-256 hexadécimal attendu.");
  check("gpsRetire", typeof record.gpsRetire === "boolean", "Booléen attendu.");
  check("remplaceMediaId", nullable(record.remplaceMediaId, isUuid), "UUID attendu.");
  return issues;
}

/** SHA-256 hexadécimal (Web Crypto, disponible dans les navigateurs et Node ≥ 18). */
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto indisponible : empreinte impossible.");
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await subtle.digest("SHA-256", data as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ── Faisabilité de la capture Web ─────────────────────────────────────────────

export type CaptureEnvironment = {
  /** `window.isSecureContext` : getUserMedia n'existe qu'en HTTPS (ou localhost). */
  readonly secureContext: boolean;
  readonly hasMediaDevices: boolean;
  readonly hasGetUserMedia: boolean;
  /** Résultat de `document.featurePolicy`/`permissionsPolicy.allowsFeature('camera')` si exposé. */
  readonly policyAllowsCamera: boolean | null;
  /** `navigator.permissions.query({ name: 'camera' })` si exposé : granted | denied | prompt. */
  readonly permissionState: "granted" | "denied" | "prompt" | null;
  /** Runtime Capacitor natif (WebView). */
  readonly native: boolean;
  /** Pointeur grossier (écran tactile) : `<input capture>` ouvre alors l'appareil photo. */
  readonly coarsePointer: boolean;
};

export type CaptureCapabilities = {
  /** Aperçu caméra en direct (`getUserMedia`) proposé. */
  readonly liveCamera: boolean;
  readonly liveCameraReason: string | null;
  /** `<input type=file accept=image/* capture=environment>` : ouvre l'appareil photo sur mobile, un sélecteur ailleurs. */
  readonly fileCapture: boolean;
  /** Import d'une photo existante : toujours possible. */
  readonly fileImport: true;
};

/**
 * Ce que la plateforme permet réellement. Aucune promesse d'AR, de LiDAR ni de mesure :
 * la capture Web produit une image, rien de plus.
 */
export function captureCapabilities(env: CaptureEnvironment): CaptureCapabilities {
  let reason: string | null = null;
  if (env.native) reason = "Application native : utilisez « Prendre une photo » (appareil photo du système).";
  else if (!env.secureContext) reason = "La caméra en direct exige une connexion sécurisée (HTTPS).";
  else if (!env.hasMediaDevices || !env.hasGetUserMedia) reason = "Ce navigateur ne donne pas accès à la caméra en direct.";
  else if (env.policyAllowsCamera === false) reason = "La caméra est bloquée par la politique de sécurité de la page.";
  else if (env.permissionState === "denied") reason = "Accès à la caméra refusé : autorisez-le dans les réglages du navigateur.";
  return { liveCamera: reason === null, liveCameraReason: reason, fileCapture: true, fileImport: true };
}

/** Message utilisateur pour une erreur `getUserMedia` (DOMException.name). */
export function cameraErrorMessage(name: string | undefined): string {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Accès à la caméra refusé. Autorisez la caméra pour ce site, ou utilisez « Prendre une photo ».";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Aucune caméra disponible sur cet appareil.";
    case "NotReadableError":
    case "AbortError":
      return "La caméra est utilisée par une autre application.";
    default:
      return "Caméra indisponible. Utilisez « Prendre une photo » ou « Importer ».";
  }
}
