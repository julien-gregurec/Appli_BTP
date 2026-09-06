/**
 * §3 — Bus d'export chantier.
 *
 * Point d'entrée unique : `exportChantier(document, format, options)`. Aucun `switch` dispersé
 * dans les composants — l'UI choisit un format et appelle cette seule fonction. Chaque format
 * délègue à une brique déjà livrée (§7 DXF, §8 SVG) ou nouvelle à ce lot (§4 PNG, §5 PDF).
 *
 * `pdf-mosaic` et `print-1to1` sont exposés comme capacités : `chantierExportCapabilities`
 * indique si elles sont réellement exploitables pour le document fourni (nécessite une
 * géométrie ET un `MosaicPlan` déjà calculé par `planMosaic`).
 *
 * §6 — Gate pré-export : si `document.preExport` est fourni et contient au moins une erreur,
 * toute génération de fichier est refusée avant même de router vers un format.
 */

import { renderFullScaleSvg, renderPlanSvg } from "./svg";
import { renderDxf, shapeGeometryToDxf } from "./dxf";
import { renderChantierPng, type PngExportOptions } from "./png";
import { buildChantierPdf, buildChantierMosaicPdf } from "./chantier-pdf";
import { chantierExportFileName, validateChantierExportDocument, type ChantierExportDocument } from "./chantier-document";
import type { SvgExportOptions } from "./svg";
import { downloadBlob, shareBlob, type DownloadOutcome, type ShareOutcome } from "./share";
import type { CheckIssue } from "../chantier/pre-export-check";
import { assessMosaicSafety } from "../chantier/print-safety";

export type ChantierExportFormat = "pdf" | "svg" | "svg-1to1" | "dxf" | "png" | "pdf-mosaic" | "print-1to1";

export const CHANTIER_EXPORT_FORMATS: readonly ChantierExportFormat[] = ["pdf", "svg", "svg-1to1", "dxf", "png", "pdf-mosaic", "print-1to1"];

export class ChantierExportError extends Error {}

export class ChantierExportBlockedError extends ChantierExportError {
  constructor(public readonly issues: readonly CheckIssue[]) {
    super("Export bloqué par le contrôle pré-export : au moins une erreur doit être corrigée.");
  }
}

export type ChantierExportCapability = { format: ChantierExportFormat; ready: boolean; reason?: string };

const FORMAT_LABELS: Record<ChantierExportFormat, string> = {
  pdf: "Dossier PDF",
  svg: "Plan SVG",
  "svg-1to1": "Gabarit SVG 1:1",
  dxf: "Plan DXF",
  png: "Image PNG",
  "pdf-mosaic": "Mosaïque PDF (A4/A3…)",
  "print-1to1": "Impression 1:1",
};

export function chantierExportFormatLabel(format: ChantierExportFormat): string {
  return FORMAT_LABELS[format];
}

/** Capacités réellement exploitables pour ce document — sert à griser les formats indisponibles côté UI. */
export function chantierExportCapabilities(document: ChantierExportDocument): ChantierExportCapability[] {
  const hasGeometry = Boolean(document.geometry);
  const hasMosaic = Boolean(document.mosaic);
  // §39 — un plan de mosaïque au-delà du plafond n'est pas « prêt » : le dire ici évite
  // de proposer un bouton qui ne pourra que échouer.
  const safety = document.mosaic ? assessMosaicSafety(document.mosaic) : undefined;
  const mosaicReady = hasGeometry && hasMosaic && safety?.level !== "blocked";
  const mosaicReason = mosaicReady
    ? undefined
    : safety?.level === "blocked"
      ? safety.message
      : "Géométrie et plan de mosaïque (planMosaic) requis.";
  return [
    { format: "pdf", ready: true },
    { format: "svg", ready: hasGeometry, reason: hasGeometry ? undefined : "Géométrie requise." },
    { format: "svg-1to1", ready: hasGeometry, reason: hasGeometry ? undefined : "Géométrie requise." },
    { format: "dxf", ready: hasGeometry, reason: hasGeometry ? undefined : "Géométrie requise." },
    { format: "png", ready: hasGeometry, reason: hasGeometry ? undefined : "Géométrie requise." },
    { format: "pdf-mosaic", ready: mosaicReady, reason: mosaicReason },
    { format: "print-1to1", ready: mosaicReady, reason: mosaicReason },
  ];
}

export type ChantierExportOptions = { svg?: SvgExportOptions; png?: PngExportOptions };

export type ChantierExportResult = {
  format: ChantierExportFormat;
  blob: Blob;
  fileName: string;
  mimeType: string;
  /**
   * §18 — Approximations géométriques réellement introduites par le format de sortie
   * (ex. ellipse convertie en polyligne pour DXF R12). Vide quand la conversion est exacte.
   * Le lot P0 calculait cette liste puis la jetait : le DXF était livré comme exact.
   * L'appelant DOIT l'afficher si elle n'est pas vide.
   */
  approximations: readonly string[];
};

function requireGeometry(document: ChantierExportDocument, format: ChantierExportFormat) {
  if (!document.geometry) throw new ChantierExportError(`Une géométrie (ShapeGeometry) est requise pour l'export ${chantierExportFormatLabel(format)}.`);
  return document.geometry;
}

function requireMosaic(document: ChantierExportDocument, format: ChantierExportFormat) {
  if (!document.mosaic) throw new ChantierExportError(`Un plan de mosaïque (planMosaic) est requis pour l'export ${chantierExportFormatLabel(format)}.`);
  return document.mosaic;
}

/** Point d'entrée unique du bus d'export chantier. */
export async function exportChantier(rawDocument: ChantierExportDocument, format: ChantierExportFormat, options: ChantierExportOptions = {}): Promise<ChantierExportResult> {
  const document = validateChantierExportDocument(rawDocument);

  if (document.preExport && !document.preExport.canExport) {
    throw new ChantierExportBlockedError(document.preExport.issues.filter((issue) => issue.severity === "error"));
  }

  switch (format) {
    case "pdf": {
      const bytes = buildChantierPdf(document);
      return { format, blob: new Blob([bytes], { type: "application/pdf" }), fileName: chantierExportFileName(document, "pdf"), mimeType: "application/pdf", approximations: [] };
    }
    case "svg": {
      const geometry = requireGeometry(document, format);
      const svg = renderPlanSvg(geometry, document.project.name, options.svg);
      return { format, blob: new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), fileName: chantierExportFileName(document, "svg"), mimeType: "image/svg+xml", approximations: [] };
    }
    case "svg-1to1": {
      const geometry = requireGeometry(document, format);
      const svg = renderFullScaleSvg(geometry, document.project.name);
      return { format, blob: new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), fileName: chantierExportFileName(document, "svg", "1-1"), mimeType: "image/svg+xml", approximations: [] };
    }
    case "dxf": {
      const geometry = requireGeometry(document, format);
      const { entities, approximations } = shapeGeometryToDxf(geometry);
      const dxf = renderDxf(entities);
      return { format, blob: new Blob([dxf], { type: "application/dxf" }), fileName: chantierExportFileName(document, "dxf"), mimeType: "application/dxf", approximations };
    }
    case "png": {
      const geometry = requireGeometry(document, format);
      const blob = await renderChantierPng(geometry, document.project.name, options.png);
      // Le PNG est un aperçu raster : il n'est jamais un document dimensionnel (§4).
      return { format, blob, fileName: chantierExportFileName(document, "png"), mimeType: "image/png", approximations: ["Aperçu raster : ne pas utiliser comme gabarit dimensionnel."] };
    }
    case "pdf-mosaic": {
      requireGeometry(document, format);
      requireMosaic(document, format);
      const bytes = buildChantierMosaicPdf(document);
      return { format, blob: new Blob([bytes], { type: "application/pdf" }), fileName: chantierExportFileName(document, "pdf", "mosaique"), mimeType: "application/pdf", approximations: [] };
    }
    case "print-1to1": {
      requireGeometry(document, format);
      requireMosaic(document, format);
      const bytes = buildChantierMosaicPdf(document);
      return { format, blob: new Blob([bytes], { type: "application/pdf" }), fileName: chantierExportFileName(document, "pdf", "1-1"), mimeType: "application/pdf", approximations: [] };
    }
    default: {
      const exhaustive: never = format;
      throw new ChantierExportError(`Format d'export chantier inconnu : ${String(exhaustive)}.`);
    }
  }
}

/** §9 — Partage : Web Share (avec fichier) en priorité, repli téléchargement. Réutilise `share.ts` (aucun plugin natif ajouté). */
export async function shareExportedFile(result: ChantierExportResult, title: string, text: string): Promise<ShareOutcome> {
  return shareBlob(result.blob, result.fileName, title, text);
}

/** Téléchargement direct (sans tentative de partage), pour un bouton « Télécharger » explicite. */
export async function downloadExportedFile(result: ChantierExportResult): Promise<DownloadOutcome> {
  return downloadBlob(result.blob, result.fileName);
}
