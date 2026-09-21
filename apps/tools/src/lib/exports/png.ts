/**
 * §21 (workflow production) — Export PNG.
 *
 * Approche client, sans bibliothèque supplémentaire : plan SVG (`renderPlanSvg`) → `Image`
 * → `<canvas>` → `Blob` PNG. Le SVG produit par `renderPlanSvg` a un `viewBox` logique fixe
 * (1000×720, cf. `exports/svg.ts`) : ce n'est pas un gabarit à l'échelle 1:1 (réservé au PDF
 * mosaïque/1:1, `exports/chantier-pdf.ts`), seulement un aperçu raster à deux résolutions.
 */

import { renderPlanSvg, type SvgExportOptions } from "./svg";
import type { ShapeGeometry } from "../geometry/shape-model";

export class PngExportError extends Error {}

export type PngResolution = "standard" | "hd";
export type PngBackground = "white" | "transparent";

export type PngExportOptions = {
  resolution?: PngResolution;
  background?: PngBackground;
  mode?: SvgExportOptions["mode"];
};

export type PngDimensions = { widthPx: number; heightPx: number };

/** Dimensions logiques du plan produit par `renderPlanSvg` (cf. `exports/svg.ts`). */
export const PNG_LOGICAL_WIDTH = 1000;
export const PNG_LOGICAL_HEIGHT = 720;

/** Multiplicateur appliqué à la taille logique selon la résolution demandée. */
const RESOLUTION_SCALE: Record<PngResolution, number> = { standard: 1, hd: 3 };

/** Plafond défensif : au-delà, un `<canvas>` peut échouer à s'allouer sur mobile. */
export const MAX_PNG_DIMENSION_PX = 6000;

export function assertWithinPngLimits(widthPx: number, heightPx: number): void {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    throw new PngExportError("Les dimensions PNG calculées sont invalides.");
  }
  if (widthPx > MAX_PNG_DIMENSION_PX || heightPx > MAX_PNG_DIMENSION_PX) {
    throw new PngExportError(`Les dimensions PNG dépassent la limite autorisée (${MAX_PNG_DIMENSION_PX} px).`);
  }
}

export function resolvePngDimensions(resolution: PngResolution = "standard"): PngDimensions {
  const scale = RESOLUTION_SCALE[resolution];
  if (!scale) throw new PngExportError(`Résolution PNG inconnue : ${resolution}.`);
  const widthPx = Math.round(PNG_LOGICAL_WIDTH * scale);
  const heightPx = Math.round(PNG_LOGICAL_HEIGHT * scale);
  assertWithinPngLimits(widthPx, heightPx);
  return { widthPx, heightPx };
}

function isBrowserRenderingAvailable(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined" && typeof HTMLCanvasElement !== "undefined";
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new PngExportError("Impossible de charger le plan SVG pour la conversion PNG.")); };
    image.src = url;
  });
}

/**
 * Rendu PNG du plan coté. Nécessite un environnement navigateur (canvas) : échoue
 * proprement côté serveur plutôt que de produire un fichier vide ou incorrect.
 */
export async function renderChantierPng(model: ShapeGeometry, title: string, options: PngExportOptions = {}): Promise<Blob> {
  if (!isBrowserRenderingAvailable()) {
    throw new PngExportError("L'export PNG nécessite un navigateur : le rendu canvas est indisponible côté serveur.");
  }
  const { widthPx, heightPx } = resolvePngDimensions(options.resolution ?? "standard");
  const svg = renderPlanSvg(model, title, { mode: options.mode ?? "complete", includeLegend: true });

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const context = canvas.getContext("2d");
  if (!context) throw new PngExportError("Le contexte de dessin canvas est indisponible.");

  if (options.background !== "transparent") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, widthPx, heightPx);
  }

  const image = await loadSvgImage(svg);
  context.drawImage(image, 0, 0, widthPx, heightPx);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new PngExportError("La génération du fichier PNG a échoué."));
    }, "image/png");
  });
}
