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
import {
  DEFAULT_REFERENCE_ADJUST,
  DEFAULT_REFERENCE_LAYER,
  UNDEFINED_CALIBRATION,
  type CalibrationState,
  type ReferenceImageAdjust,
  type ReferenceImageFormat,
  type ReferenceImageLayer,
  type ReferenceImageSource,
} from "./reference-image";
import type { GeometricShape, RawContour } from "./vectorization";

export const TRACING_PROJECT_SCHEMA_VERSION = 1;

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

/**
 * Validation stricte et bornée. Elle contrôle l'enveloppe métier ; les tableaux `contours`
 * et `shapes` sont bornés en nombre mais leur contenu détaillé reste validé par
 * `createRawContour` / `contourToGeometricShape` au moment de leur création.
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

  return {
    id: value.id,
    schemaVersion: TRACING_PROJECT_SCHEMA_VERSION,
    name: cleanText(value.name, "Le nom", 100)!,
    type: value.type as TracingProjectType,
    roomWidthMm: optionalDimension(value.roomWidthMm, "La largeur de la pièce"),
    roomHeightMm: optionalDimension(value.roomHeightMm, "La hauteur de la pièce"),
    units,
    scaleStatus: value.scaleStatus,
    referenceImages: referenceImages as TracingReferenceImage[],
    contours: contours as RawContour[],
    shapes: shapes as GeometricShape[],
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
