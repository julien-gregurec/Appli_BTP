/**
 * Contrat d'entrée du pipeline d'export chantier (lot P0).
 *
 * `ChantierExportDocument` est l'unique frontière entre « ce qui produit les données »
 * (persistance `TracingProject`, moteur géométrique, ateliers de saisie) et « ce qui les
 * exporte » (bus d'export, PDF, SVG, DXF, PNG). Il ne dépend ni d'IndexedDB, ni de Supabase,
 * ni du contrat `TracingProject` (encore en évolution dans un autre lot) : uniquement de
 * `ShapeGeometry` (stable, déjà consommée par `exports/pdf.ts` / `svg.ts` / `dxf.ts`) et des
 * briques `chantier/`/`tracing/` déjà livrées et testées.
 *
 * Tant que l'adaptateur final `TracingProject → ChantierExportDocument` n'est pas écrit
 * (point d'intégration différé, cf. rapport de lot), n'importe quel appelant peut construire
 * ce document à la main ou depuis une fixture — c'est précisément le découplage demandé.
 */

import type { ShapeGeometry } from "../geometry/shape-model";
import type { ReportTable } from "../chantier/report-table";
import type { MaterialLine } from "../chantier/nomenclature";
import type { LedPlan } from "../chantier/led";
import type { ProfilePlan } from "../chantier/profiles";
import type { LightingExportRow } from "../chantier/lighting";
import type { WitnessDimension } from "../chantier/witness";
import type { PreExportReport } from "../chantier/pre-export-check";
import type { MosaicPlan } from "../chantier/mosaic";
import type { MeasurementOrigin } from "../tracing/measurement-origin";
import { safeFilePart } from "./document";

export class ChantierExportDocumentError extends Error {}

export type ChantierOuvrageType = "ceiling" | "wall" | "arch" | "niche" | "other";

export type ChantierExportProjectMeta = {
  id: string;
  name: string;
  ouvrageType?: ChantierOuvrageType;
  siteName?: string;
  author?: string;
  companyName?: string;
  units: "mm" | "cm" | "m";
  roomWidthMm?: number;
  roomHeightMm?: number;
  measurementOrigin?: MeasurementOrigin;
  generatedAt: string;
};

export type ChantierConstructionStep = {
  id: string;
  title: string;
  instruction: string;
  measurements?: readonly string[];
};

export type ChantierReferenceImageMeta = {
  name: string;
  source: string;
  calibrated: boolean;
};

export type ChantierExportDocument = {
  project: ChantierExportProjectMeta;
  /** Géométrie exportable existante (`ShapeGeometry`) — absente tant qu'aucun tracé n'est prêt. */
  geometry?: ShapeGeometry;
  report?: ReportTable;
  constructionSteps?: readonly ChantierConstructionStep[];
  nomenclature?: readonly MaterialLine[];
  ledSummary?: LedPlan;
  profiles?: readonly ProfilePlan[];
  lightingRows?: readonly LightingExportRow[];
  witness?: WitnessDimension;
  preExport?: PreExportReport;
  mosaic?: MosaicPlan;
  notes?: string;
  referenceImage?: ChantierReferenceImageMeta;
};

const UNITS: readonly ChantierExportProjectMeta["units"][] = ["mm", "cm", "m"];
const OUVRAGE_TYPES: readonly ChantierOuvrageType[] = ["ceiling", "wall", "arch", "niche", "other"];

function assertText(value: unknown, label: string, max: number, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string") throw new ChantierExportDocumentError(`${label} doit être un texte.`);
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!optional && !cleaned) throw new ChantierExportDocumentError(`${label} est obligatoire.`);
  if (cleaned.length > max) throw new ChantierExportDocumentError(`${label} dépasse ${max} caractères.`);
  return cleaned || undefined;
}

function assertOptionalDimension(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    throw new ChantierExportDocumentError(`${label} est hors limites.`);
  }
  return value;
}

/**
 * Validation légère et bornée du contrat. Ne revalide pas le détail des sous-structures
 * (`ReportTable`, `MaterialLine`, `LedPlan`, …) : chacune est déjà validée par sa propre
 * fonction de construction (`buildReportTable`, `buildNomenclature`, `planLed`, …).
 */
export function validateChantierExportDocument(document: ChantierExportDocument): ChantierExportDocument {
  if (!document || typeof document !== "object") throw new ChantierExportDocumentError("Le document d'export chantier est invalide.");
  const project = document.project;
  if (!project || typeof project !== "object") throw new ChantierExportDocumentError("Les métadonnées du projet sont obligatoires.");
  if (typeof project.id !== "string" || !project.id.trim()) throw new ChantierExportDocumentError("L'identifiant du projet est obligatoire.");
  assertText(project.name, "Le nom du projet", 150);
  if (project.ouvrageType !== undefined && !OUVRAGE_TYPES.includes(project.ouvrageType)) {
    throw new ChantierExportDocumentError("Le type d'ouvrage est inconnu.");
  }
  if (!UNITS.includes(project.units)) throw new ChantierExportDocumentError("L'unité du projet est invalide.");
  assertOptionalDimension(project.roomWidthMm, "La largeur de la pièce");
  assertOptionalDimension(project.roomHeightMm, "La hauteur de la pièce");
  if (typeof project.generatedAt !== "string" || Number.isNaN(Date.parse(project.generatedAt))) {
    throw new ChantierExportDocumentError("La date de génération du document est invalide.");
  }
  assertText(document.notes, "Les notes", 4000, true);
  return document;
}

/** Nom de fichier normalisé et daté, cohérent avec `projectFileName` (`exports/document.ts`). */
export function chantierExportFileName(document: ChantierExportDocument, extension: "pdf" | "svg" | "dxf" | "png", suffix?: string): string {
  const date = document.project.generatedAt.slice(0, 10);
  const parts = [
    "elsatia-tools-chantier",
    document.project.siteName ? safeFilePart(document.project.siteName) : safeFilePart(document.project.name),
    ...(suffix ? [safeFilePart(suffix)] : []),
    date,
  ];
  return `${parts.join("-").slice(0, 150)}.${extension}`;
}
