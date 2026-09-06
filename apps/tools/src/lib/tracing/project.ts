/**
 * §2 — Structure métier d'un projet de traçage.
 *
 * C'est le modèle du workflow production (photo → tracé → calibration → export). Il est
 * volontairement distinct de `../projects/model.ts` (`ToolProject`), qui reste la frontière
 * de persistance IndexedDB / synchronisation. Le branchement des deux (bump de
 * `PROJECT_SCHEMA_VERSION`, `migrateProject`) est un point d'intégration différé et signalé
 * dans docs/production-workflow.md.
 *
 * Comme `ToolProject`, ce modèle ne stocke jamais les octets d'une image : seulement un
 * `assetRef` opaque vers le blob géré par la couche stockage.
 */

import type { LightingFixture } from "../chantier/lighting";
import type { MaterialLine } from "../chantier/nomenclature";
import type { PaperFormat, PaperOrientation } from "../chantier/mosaic";
import { isValidAssetRef } from "./asset-store";
import { MEASUREMENT_ORIGINS, type MeasurementOrigin } from "./measurement-origin";
import {
  clampLayer,
  DEFAULT_REFERENCE_ADJUST,
  DEFAULT_REFERENCE_LAYER,
  UNDEFINED_CALIBRATION,
  calibrationQualityFromError,
  type CalibrationCheck,
  type CalibrationState,
  type ReferenceImageAdjust,
  type ReferenceImageFormat,
  type ReferenceImageLayer,
  type ReferenceImageSource,
} from "./reference-image";
import type { LengthUnit } from "../units";
import type { Point2D } from "./geometry-port";
import type { GeometricShape, RawContour } from "./vectorization";
import {
  FreeGeometryError,
  freeGeometryIsEmpty,
  validateFreeGeometry,
  type FreeGeometry,
} from "./free-geometry";

/**
 * Version courante du schéma `TracingProject`.
 *
 * - v1 : socle workflow production (photo → tracé → calibration → export).
 * - v2 : ajout de `modelId` (§8 — modèle d'ouvrage choisi à la création) et `startFromPhoto`
 *        (§9 — intention « partir d'une photo »), tous deux optionnels et additifs.
 * - v3 : ajout de `modelParams` (ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §4 — surcharges de
 *        paramètres du modèle choisi), optionnel et additif. Rien n'est à renseigner en
 *        migration : sans surcharge, le modèle est résolu avec ses seuls défauts publiés.
 * - v4 : ajout de `freeGeometry` (ATELIER-FREE-DRAWING-FOUNDATION-V1 §1 — tracé libre de
 *        l'utilisateur), optionnel et additif. Rien n'est à renseigner en migration : aucun
 *        projet antérieur ne pouvait porter de tracé libre, et son absence signifie
 *        exactement ce qu'elle signifiait avant — il n'y en a pas.
 *
 * La frontière de lecture tolérante (migration des versions connues) vit dans `./migration.ts` ;
 * `validateTracingProject` ci-dessous reste strict sur la version courante.
 */
export const TRACING_PROJECT_SCHEMA_VERSION = 4;

export type TracingProjectType = "ceiling" | "wall" | "arch" | "niche" | "other";
export const TRACING_PROJECT_TYPES: readonly TracingProjectType[] = ["ceiling", "wall", "arch", "niche", "other"];

export type TracingUnits = "mm" | "cm" | "m";

export type TracingLayerId = "reference" | "construction" | "final" | "dimensions" | "lighting" | "annotations";
export const TRACING_LAYER_IDS: readonly TracingLayerId[] = ["reference", "construction", "final", "dimensions", "lighting", "annotations"];

export type TracingLayerState = { visible: boolean; locked: boolean };

export type TracingReferenceImage = {
  id: string;
  name: string;
  source: ReferenceImageSource;
  format: ReferenceImageFormat;
  widthPx: number;
  heightPx: number;
  adjust: ReferenceImageAdjust;
  layer: ReferenceImageLayer;
  calibration: CalibrationState;
  /** Poignée opaque vers le blob stocké — jamais les octets (§2, §30). */
  assetRef?: string;
};

export type TracingConstructionStep = { id: string; title: string; instruction: string };

export type TracingExportSettings = {
  paperFormat: PaperFormat;
  paperOrientation: PaperOrientation;
  marginMm: number;
  overlapMm: number;
  witnessMm: number;
  includeConstruction: boolean;
  includeDimensions: boolean;
};

export const DEFAULT_TRACING_EXPORT_SETTINGS: TracingExportSettings = {
  paperFormat: "A4",
  paperOrientation: "portrait",
  marginMm: 10,
  overlapMm: 10,
  witnessMm: 100,
  includeConstruction: true,
  includeDimensions: true,
};

export type TracingProject = {
  id: string;
  schemaVersion: number;
  name: string;
  type: TracingProjectType;
  roomWidthMm?: number;
  roomHeightMm?: number;
  units: TracingUnits;
  scaleStatus: "defined" | "undefined";
  /** §8 — modèle d'ouvrage retenu à la création. Slug du registre `geometry/models/catalog.ts`, résolu par `model-resolver.ts`. */
  modelId?: string;
  /**
   * Surcharges de paramètres du modèle (§4). N'y figurent QUE les valeurs voulues par
   * l'utilisateur : les défauts restent publiés par le modèle et ne sont jamais recopiés
   * ici. Jamais de géométrie dérivée — celle-ci est recalculée par Engine B (§8).
   */
  modelParams?: Record<string, number>;
  /**
   * ATELIER-FREE-DRAWING-FOUNDATION-V1 §1/§2 — tracé libre de l'utilisateur.
   *
   * Contrairement à `modelParams`, qui n'est qu'un réglage d'une géométrie DÉRIVÉE, ce champ
   * porte une géométrie SOURCE : rien ne la recalcule, et sa perte serait la perte du travail
   * lui-même. C'est pourquoi il ne peut pas coexister avec `modelId` (§2) — deux sources de
   * vérité géométrique dans un même projet, et plus rien ne dit laquelle exporter.
   */
  freeGeometry?: FreeGeometry;
  /** §9 — l'utilisateur a répondu « oui » à « partir d'une photo ? ». L'upload/caméra/calibration arrivent dans un lot ultérieur. */
  startFromPhoto?: boolean;
  referenceImages: TracingReferenceImage[];
  contours: RawContour[];
  shapes: GeometricShape[];
  layers: Record<TracingLayerId, TracingLayerState>;
  lighting: LightingFixture[];
  materials: MaterialLine[];
  constructionSteps: TracingConstructionStep[];
  exportSettings: TracingExportSettings;
  companyId?: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
};

export class TracingProjectError extends Error {}

function defaultLayers(): Record<TracingLayerId, TracingLayerState> {
  return {
    reference: { visible: true, locked: true },
    construction: { visible: true, locked: false },
    final: { visible: true, locked: false },
    dimensions: { visible: true, locked: false },
    lighting: { visible: true, locked: false },
    annotations: { visible: true, locked: false },
  };
}

export type CreateTracingProjectInput = {
  id: string;
  name: string;
  type: TracingProjectType;
  units?: TracingUnits;
  roomWidthMm?: number;
  roomHeightMm?: number;
  modelId?: string;
  modelParams?: Record<string, number>;
  /** §2 — démarrer directement en mode « tracé libre » : le projet naît sans modèle, avec un document libre vide. */
  freeGeometry?: FreeGeometry;
  startFromPhoto?: boolean;
  companyId?: string;
  userId?: string;
};

export function createTracingProject(input: CreateTracingProjectInput, now: Date = new Date()): TracingProject {
  const iso = now.toISOString();
  const project: TracingProject = {
    id: input.id,
    schemaVersion: TRACING_PROJECT_SCHEMA_VERSION,
    name: input.name,
    type: input.type,
    roomWidthMm: input.roomWidthMm,
    roomHeightMm: input.roomHeightMm,
    units: input.units ?? "mm",
    scaleStatus: "undefined",
    modelId: input.modelId,
    modelParams: input.modelParams,
    freeGeometry: input.freeGeometry,
    startFromPhoto: input.startFromPhoto ? true : undefined,
    referenceImages: [],
    contours: [],
    shapes: [],
    layers: defaultLayers(),
    lighting: [],
    materials: [],
    constructionSteps: [],
    exportSettings: { ...DEFAULT_TRACING_EXPORT_SETTINGS },
    companyId: input.companyId,
    userId: input.userId,
    createdAt: iso,
    updatedAt: iso,
  };
  return validateTracingProject(project);
}

function cleanText(value: unknown, label: string, max: number, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string") throw new TracingProjectError(`${label} doit être un texte.`);
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!optional && !cleaned) throw new TracingProjectError(`${label} est obligatoire.`);
  if (cleaned.length > max) throw new TracingProjectError(`${label} dépasse ${max} caractères.`);
  return cleaned || undefined;
}

function optionalDimension(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    throw new TracingProjectError(`${label} est hors limites.`);
  }
  return value;
}

/** §8 — slug de modèle stable : minuscules, chiffres et tirets, 40 caractères max. Absent = « à décider ». */
function optionalModelId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(value)) {
    throw new TracingProjectError("Le modèle choisi est invalide.");
  }
  return value;
}

/**
 * §4 — surcharges de paramètres du modèle : dictionnaire borné de nombres finis. Les
 * identifiants inconnus du modèle ne sont PAS rejetés ici (le projet ne connaît pas le
 * catalogue) : `model-resolver.ts` les signale en avertissement au moment de la résolution.
 */
function optionalModelParams(value: unknown): Record<string, number> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new TracingProjectError("Les paramètres du modèle sont invalides.");
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return undefined;
  if (entries.length > 40) throw new TracingProjectError("Trop de paramètres de modèle (max 40).");
  const result: Record<string, number> = {};
  for (const [key, raw] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)) throw new TracingProjectError(`Le paramètre de modèle « ${key} » a un identifiant invalide.`);
    if (typeof raw !== "number" || !Number.isFinite(raw)) throw new TracingProjectError(`Le paramètre de modèle « ${key} » doit être un nombre.`);
    result[key] = raw;
  }
  return result;
}

/**
 * §1/§13 — tracé libre du projet. La validation détaillée (arité, sommets finis, limites,
 * identifiants uniques) appartient à `free-geometry.ts` ; on ne fait ici que la déléguer et
 * traduire son refus dans le vocabulaire d'erreur du projet, pour que tous les appelants de
 * `validateTracingProject` n'aient qu'un seul type d'erreur à connaître.
 *
 * Un document VIDE est ramené à `undefined` : `freeGeometry: { entities: [] }` et l'absence de
 * champ décrivent le même fait — aucun tracé libre — et n'en garder qu'une écriture évite
 * qu'une comparaison de projets signale une différence là où il n'y en a aucune.
 */
function optionalFreeGeometry(value: unknown): FreeGeometry | undefined {
  if (value === undefined || value === null) return undefined;
  let geometry: FreeGeometry;
  try {
    geometry = validateFreeGeometry(value);
  } catch (cause) {
    throw new TracingProjectError(
      cause instanceof FreeGeometryError ? cause.message : "Le tracé libre du projet est invalide.",
    );
  }
  return freeGeometryIsEmpty(geometry) ? undefined : geometry;
}

/**
 * §2 — mode réel d'un projet. Il n'est pas stocké : le déduire de ce que le projet PORTE rend
 * impossible qu'un drapeau dise « paramétrique » sur un projet qui contient un tracé libre.
 *
 * - `parametric` : un modèle est choisi, la géométrie est dérivée par Engine B ;
 * - `free` : un tracé libre existe, la géométrie est la source ;
 * - `undecided` : ni l'un ni l'autre — c'est un état valide, celui d'un projet qui vient
 *   d'être créé ou dont l'utilisateur a répondu « décider plus tard » (§3 du bridge Engine B).
 */
export type TracingProjectMode = "parametric" | "free" | "undecided";

export function tracingProjectMode(
  project: Pick<TracingProject, "modelId" | "freeGeometry">,
): TracingProjectMode {
  if (!freeGeometryIsEmpty(project.freeGeometry)) return "free";
  return project.modelId ? "parametric" : "undecided";
}

/** Bornes de contenu — une photo détectée peut produire des milliers de points (§42). */
export const MAX_CONTOUR_POINTS = 20_000;
export const MAX_SHAPE_VERTICES = 20_000;

function readPoint(raw: unknown, label: string): Point2D {
  if (!raw || typeof raw !== "object") throw new TracingProjectError(`${label} est invalide.`);
  const point = raw as Record<string, unknown>;
  if (typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TracingProjectError(`${label} est invalide.`);
  }
  return { x: point.x, y: point.y };
}

function readPoints(raw: unknown, label: string, max: number): Point2D[] {
  if (!Array.isArray(raw) || raw.length < 2) throw new TracingProjectError(`${label} exige au moins deux points.`);
  if (raw.length > max) throw new TracingProjectError(`${label} dépasse ${max} points.`);
  return raw.map((point) => readPoint(point, label));
}

function readLengthUnit(raw: unknown): LengthUnit {
  return raw === "cm" || raw === "m" || raw === "in" ? raw : "mm";
}

function readIsoDate(raw: unknown, fallback: string): string {
  return typeof raw === "string" && !Number.isNaN(Date.parse(raw)) ? raw : fallback;
}

function readCalibrationCheck(raw: unknown, fallbackDate: string): CalibrationCheck | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const check = raw as Record<string, unknown>;
  const expectedMm = check.expectedMm;
  const measuredMm = check.measuredMm;
  if (typeof expectedMm !== "number" || typeof measuredMm !== "number" || !Number.isFinite(expectedMm) || !Number.isFinite(measuredMm) || expectedMm <= 0) {
    return undefined;
  }
  const deviationMm = measuredMm - expectedMm;
  const errorPercent = Math.abs(deviationMm / expectedMm) * 100;
  return {
    pointA: readPoint(check.pointA, "Le point de contrôle A"),
    pointB: readPoint(check.pointB, "Le point de contrôle B"),
    expectedMm,
    measuredMm,
    deviationMm,
    errorPercent,
    quality: calibrationQualityFromError(errorPercent),
    checkedAt: readIsoDate(check.checkedAt, fallbackDate),
  };
}

/**
 * Relit une calibration enregistrée. Un projet antérieur au suivi de traçabilité (§9) ne
 * contient que le facteur d'échelle : les points sont alors reconstruits sur l'axe X à partir
 * de la distance pixel enregistrée. L'échelle, elle, est conservée exactement — c'est la seule
 * grandeur dont dépendent les cotes.
 */
export function readCalibrationState(raw: unknown, fallbackDate: string): CalibrationState {
  if (!raw || typeof raw !== "object") return UNDEFINED_CALIBRATION;
  const value = raw as Record<string, unknown>;
  if (value.status !== "calibrated") return UNDEFINED_CALIBRATION;
  const mmPerPixel = value.mmPerPixel;
  const pixelDistance = value.pixelDistance;
  const realDistanceMm = value.realDistanceMm;
  if (
    typeof mmPerPixel !== "number" || !Number.isFinite(mmPerPixel) || mmPerPixel <= 0 ||
    typeof pixelDistance !== "number" || !Number.isFinite(pixelDistance) || pixelDistance <= 0 ||
    typeof realDistanceMm !== "number" || !Number.isFinite(realDistanceMm) || realDistanceMm <= 0
  ) {
    throw new TracingProjectError("La calibration enregistrée est invalide.");
  }
  const hasPoints = value.pointA !== undefined && value.pointB !== undefined;
  return {
    status: "calibrated",
    mmPerPixel,
    pixelDistance,
    realDistanceMm,
    pointA: hasPoints ? readPoint(value.pointA, "Le point de calibration A") : { x: 0, y: 0 },
    pointB: hasPoints ? readPoint(value.pointB, "Le point de calibration B") : { x: pixelDistance, y: 0 },
    realUnit: readLengthUnit(value.realUnit),
    calibratedAt: readIsoDate(value.calibratedAt, fallbackDate),
    origin: "calibrated",
    check: readCalibrationCheck(value.check, fallbackDate),
  };
}

const REFERENCE_SOURCES: readonly ReferenceImageSource[] = ["camera", "gallery", "screenshot", "sketch", "scan", "imported"];
const REFERENCE_FORMATS: readonly ReferenceImageFormat[] = ["jpg", "jpeg", "png", "webp", "heic"];

export function readReferenceImage(raw: unknown, fallbackDate: string): TracingReferenceImage {
  if (!raw || typeof raw !== "object") throw new TracingProjectError("Une image de référence est invalide.");
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id.trim()) throw new TracingProjectError("L'identifiant d'une image de référence est invalide.");
  if (!REFERENCE_SOURCES.includes(value.source as ReferenceImageSource)) throw new TracingProjectError("La provenance d'une image de référence est inconnue.");
  if (!REFERENCE_FORMATS.includes(value.format as ReferenceImageFormat)) throw new TracingProjectError("Le format d'une image de référence est inconnu.");
  const widthPx = value.widthPx;
  const heightPx = value.heightPx;
  if (typeof widthPx !== "number" || typeof heightPx !== "number" || !Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx < 1 || heightPx < 1 || widthPx > 20_000 || heightPx > 20_000) {
    throw new TracingProjectError("Les dimensions d'une image de référence sont invalides.");
  }
  const adjustRaw = (value.adjust && typeof value.adjust === "object" ? value.adjust : {}) as Partial<ReferenceImageAdjust>;
  const adjust: ReferenceImageAdjust = {
    rotationDeg: typeof adjustRaw.rotationDeg === "number" && Number.isFinite(adjustRaw.rotationDeg) ? adjustRaw.rotationDeg : 0,
    mirrorX: adjustRaw.mirrorX === true,
    mirrorY: adjustRaw.mirrorY === true,
  };
  if (adjustRaw.crop && typeof adjustRaw.crop === "object") {
    const { x, y, width, height } = adjustRaw.crop as Record<string, unknown>;
    if ([x, y, width, height].every((entry) => typeof entry === "number" && Number.isFinite(entry)) && (width as number) > 0 && (height as number) > 0) {
      adjust.crop = { x: x as number, y: y as number, width: width as number, height: height as number };
    }
  }
  const layerRaw = (value.layer && typeof value.layer === "object" ? value.layer : DEFAULT_REFERENCE_LAYER) as ReferenceImageLayer;
  if (value.assetRef !== undefined && !isValidAssetRef(value.assetRef)) {
    throw new TracingProjectError("La référence de l'image stockée est invalide.");
  }
  return {
    id: value.id,
    name: cleanText(value.name, "Le nom de l'image", 120) ?? "Référence",
    source: value.source as ReferenceImageSource,
    format: value.format as ReferenceImageFormat,
    widthPx,
    heightPx,
    adjust,
    layer: clampLayer(layerRaw),
    calibration: readCalibrationState(value.calibration, fallbackDate),
    assetRef: value.assetRef as string | undefined,
  };
}

export function readRawContour(raw: unknown): RawContour {
  if (!raw || typeof raw !== "object") throw new TracingProjectError("Un contour enregistré est invalide.");
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id.trim()) throw new TracingProjectError("L'identifiant d'un contour est invalide.");
  if (value.space !== "image-pixels" && value.space !== "millimetres") throw new TracingProjectError("L'espace d'un contour est inconnu.");
  if (value.source !== "manual" && value.source !== "detected" && value.source !== "imported") {
    throw new TracingProjectError("La provenance d'un contour est inconnue.");
  }
  // §17 — un contour détecté ne peut jamais être relu comme confirmé : le statut est reforcé.
  const status = value.source === "detected" ? "proposition" : value.status === "confirmed" ? "confirmed" : "proposition";
  return {
    id: value.id,
    points: readPoints(value.points, "Un contour", MAX_CONTOUR_POINTS),
    space: value.space,
    closed: value.closed === true,
    source: value.source,
    status,
  };
}

export function readGeometricShape(raw: unknown): GeometricShape {
  if (!raw || typeof raw !== "object") throw new TracingProjectError("Une forme enregistrée est invalide.");
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== "string" || !value.id.trim()) throw new TracingProjectError("L'identifiant d'une forme est invalide.");
  if (value.kind !== "polyline" && value.kind !== "polygon") throw new TracingProjectError("Le type d'une forme est inconnu.");
  if (!MEASUREMENT_ORIGINS.includes(value.origin as MeasurementOrigin)) throw new TracingProjectError("L'origine de mesure d'une forme est inconnue.");
  return {
    id: value.id,
    kind: value.kind,
    vertices: readPoints(value.vertices, "Une forme", MAX_SHAPE_VERTICES),
    closed: value.closed === true,
    origin: value.origin as MeasurementOrigin,
    derivedFrom: typeof value.derivedFrom === "string" && value.derivedFrom.trim() ? value.derivedFrom : undefined,
  };
}

/**
 * Validation stricte et bornée : enveloppe métier **et** contenu (images de référence,
 * contours, formes). Un projet relu ne peut donc pas ressusciter avec une calibration
 * corrompue ou un contour détecté marqué « confirmé » (§17, §50).
 */
export function validateTracingProject(raw: unknown): TracingProject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TracingProjectError("Le projet de traçage n'est pas un objet valide.");
  const value = raw as Record<string, unknown>;

  if (value.schemaVersion !== TRACING_PROJECT_SCHEMA_VERSION) {
    throw new TracingProjectError("Cette version de projet de traçage ne peut pas être ouverte automatiquement.");
  }
  if (typeof value.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(value.id)) throw new TracingProjectError("L'identifiant du projet est invalide.");
  if (!TRACING_PROJECT_TYPES.includes(value.type as TracingProjectType)) throw new TracingProjectError("Le type de projet est inconnu.");
  const units = value.units;
  if (units !== "mm" && units !== "cm" && units !== "m") throw new TracingProjectError("L'unité du projet est invalide.");
  if (value.scaleStatus !== "defined" && value.scaleStatus !== "undefined") throw new TracingProjectError("L'état d'échelle du projet est invalide.");
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.createdAt)) || Number.isNaN(Date.parse(value.updatedAt))) {
    throw new TracingProjectError("Les dates du projet sont invalides.");
  }

  const referenceImages = Array.isArray(value.referenceImages) ? value.referenceImages : [];
  const contours = Array.isArray(value.contours) ? value.contours : [];
  const shapes = Array.isArray(value.shapes) ? value.shapes : [];
  const lighting = Array.isArray(value.lighting) ? value.lighting : [];
  const materials = Array.isArray(value.materials) ? value.materials : [];
  const constructionSteps = Array.isArray(value.constructionSteps) ? value.constructionSteps : [];
  if (referenceImages.length > 20) throw new TracingProjectError("Trop d'images de référence (max 20).");
  if (contours.length > 500) throw new TracingProjectError("Trop de contours (max 500).");
  if (shapes.length > 500) throw new TracingProjectError("Trop de formes (max 500).");

  const layersRaw = (value.layers && typeof value.layers === "object" ? value.layers : {}) as Record<string, unknown>;
  const layers = defaultLayers();
  for (const id of TRACING_LAYER_IDS) {
    const entry = layersRaw[id] as Record<string, unknown> | undefined;
    if (entry) layers[id] = { visible: entry.visible !== false, locked: entry.locked === true };
  }

  const exportRaw = (value.exportSettings && typeof value.exportSettings === "object" ? value.exportSettings : {}) as Partial<TracingExportSettings>;
  const exportSettings: TracingExportSettings = {
    paperFormat: (["A4", "A3", "A2", "A1", "A0"] as PaperFormat[]).includes(exportRaw.paperFormat as PaperFormat) ? (exportRaw.paperFormat as PaperFormat) : "A4",
    paperOrientation: exportRaw.paperOrientation === "landscape" ? "landscape" : "portrait",
    marginMm: clampNumber(exportRaw.marginMm, 0, 50, DEFAULT_TRACING_EXPORT_SETTINGS.marginMm),
    overlapMm: clampNumber(exportRaw.overlapMm, 0, 100, DEFAULT_TRACING_EXPORT_SETTINGS.overlapMm),
    witnessMm: clampNumber(exportRaw.witnessMm, 10, 500, DEFAULT_TRACING_EXPORT_SETTINGS.witnessMm),
    includeConstruction: exportRaw.includeConstruction !== false,
    includeDimensions: exportRaw.includeDimensions !== false,
  };

  const modelId = optionalModelId(value.modelId);
  const freeGeometry = optionalFreeGeometry(value.freeGeometry);
  // §2 — l'invariant qui tient tout le lot : jamais deux sources de vérité géométrique dans le
  // même projet. Le refus est ici, dans la validation, et non dans l'UI : c'est la seule place
  // que ni un import, ni une reprise de brouillon, ni une écriture directe ne peut contourner.
  if (modelId && freeGeometry) {
    throw new TracingProjectError(
      "Un tracé ne peut pas porter à la fois un modèle paramétrique et un tracé libre : choisissez l'un des deux.",
    );
  }

  return {
    id: value.id,
    schemaVersion: TRACING_PROJECT_SCHEMA_VERSION,
    name: cleanText(value.name, "Le nom", 100)!,
    type: value.type as TracingProjectType,
    roomWidthMm: optionalDimension(value.roomWidthMm, "La largeur de la pièce"),
    roomHeightMm: optionalDimension(value.roomHeightMm, "La hauteur de la pièce"),
    units,
    scaleStatus: value.scaleStatus,
    modelId,
    modelParams: optionalModelParams(value.modelParams),
    freeGeometry,
    startFromPhoto: value.startFromPhoto === true ? true : undefined,
    referenceImages: referenceImages.map((image) => readReferenceImage(image, value.updatedAt as string)),
    contours: contours.map(readRawContour),
    shapes: shapes.map(readGeometricShape),
    layers,
    lighting: lighting as LightingFixture[],
    materials: materials as MaterialLine[],
    constructionSteps: (constructionSteps as TracingConstructionStep[]).slice(0, 200),
    exportSettings,
    companyId: cleanText(value.companyId, "La société", 80, true),
    userId: cleanText(value.userId, "L'utilisateur", 80, true),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Fabrique la référence d'image par défaut (adjust + calque + calibration non définie). */
export function newReferenceImage(id: string, name: string, source: ReferenceImageSource, format: ReferenceImageFormat, widthPx: number, heightPx: number): TracingReferenceImage {
  return {
    id,
    name,
    source,
    format,
    widthPx,
    heightPx,
    adjust: { ...DEFAULT_REFERENCE_ADJUST },
    layer: { ...DEFAULT_REFERENCE_LAYER },
    calibration: UNDEFINED_CALIBRATION,
  };
}

/* -------------------------------------------------------------------------- */
/*  §39, §40 — Sérialisation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sérialise un projet de traçage. Les octets des images ne passent jamais par ici : seul le
 * `assetRef` est écrit, les blobs vivant dans `asset-store` (§40).
 */
export function serializeTracingProject(project: TracingProject): string {
  return JSON.stringify(validateTracingProject(project), null, 2);
}

/*
 * Il n'y a délibérément PAS de `parseTracingProjectFile` ici.
 *
 * La relecture d'un document est déjà la frontière tolérante du canon : `migrateTracingProject`
 * (./migration.ts) accepte les versions connues, refuse une version future en le disant, et
 * délègue ensuite à `validateTracingProject`. Ajouter un second point d'entrée de lecture qui
 * n'appellerait que la validation stricte ferait exister deux règles concurrentes sur « ce
 * projet est-il ouvrable » — et la plus ancienne des deux refuserait des documents que le canon
 * sait lire. Un appelant qui part d'une chaîne fait donc `migrateTracingProject(JSON.parse(…))`.
 */

/** Horodate une modification. `scaleStatus` suit l'état réel des calibrations enregistrées. */
export function touchTracingProject(project: TracingProject, now: Date = new Date()): TracingProject {
  const calibrated = project.referenceImages.some((image) => image.calibration.status === "calibrated");
  return { ...project, scaleStatus: calibrated ? "defined" : "undefined", updatedAt: now.toISOString() };
}

/** Références d'images réellement utilisées — entrée de `pruneOrphanAssets` (§39). */
export function referencedAssetRefs(projects: readonly TracingProject[]): string[] {
  const refs = new Set<string>();
  for (const project of projects) {
    for (const image of project.referenceImages) if (image.assetRef) refs.add(image.assetRef);
  }
  return [...refs];
}
