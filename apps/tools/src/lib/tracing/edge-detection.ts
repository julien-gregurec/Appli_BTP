/**
 * §14 — Détection de contour légère, sans bibliothèque de vision par ordinateur.
 *
 * Chaîne : niveaux de gris → seuil d'Otsu (ou seuil manuel) → masque binaire →
 * plus grande composante connexe → suivi de frontière de Moore.
 *
 * Ce que ce module N'EST PAS : une IA de reconnaissance de motif. Il fonctionne bien sur
 * un croquis au trait noir sur fond clair ou une capture nette et contrastée ; il échoue sur
 * une photo de chantier bruitée. C'est pourquoi son résultat sort toujours en
 * `RawContour { source: "detected", status: "proposition" }` (§17, §18) et jamais en
 * géométrie confirmée.
 *
 * Aucune dépendance ajoutée, aucun accès DOM : l'appelant fournit les pixels déjà décodés
 * et **déjà réduits** à la taille d'analyse (§42).
 */

import { MAX_ANALYSIS_PIXELS } from "./image-import";
import type { Point2D } from "./geometry-port";

export type GrayscaleImage = {
  width: number;
  height: number;
  /** Un octet par pixel, ligne par ligne. */
  data: Uint8Array;
};

export type BinaryMask = {
  width: number;
  height: number;
  /** 1 = pixel de motif, 0 = fond. */
  data: Uint8Array;
};

function assertSize(width: number, height: number, length: number, bytesPerPixel: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new Error("Dimensions d'image invalides pour la détection de contour.");
  }
  if (width * height > MAX_ANALYSIS_PIXELS) {
    throw new Error("Image trop grande pour la détection : réduisez-la à la taille d'analyse avant de lancer le traitement.");
  }
  if (length !== width * height * bytesPerPixel) throw new Error("Le tampon de pixels ne correspond pas aux dimensions annoncées.");
}

/** Luminance perceptuelle (Rec. 601) d'un tampon RGBA. */
export function toGrayscale(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GrayscaleImage {
  assertSize(width, height, rgba.length, 4);
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index++) {
    const offset = index * 4;
    data[index] = Math.round(0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2]);
  }
  return { width, height, data };
}

/** Étirement de contraste linéaire sur les percentiles 2 % / 98 %. */
export function stretchContrast(image: GrayscaleImage): GrayscaleImage {
  const histogram = new Uint32Array(256);
  for (const value of image.data) histogram[value]++;
  const total = image.data.length;
  const lowCut = total * 0.02;
  const highCut = total * 0.98;
  let cumulative = 0;
  let low = 0;
  let high = 255;
  for (let value = 0; value < 256; value++) {
    cumulative += histogram[value];
    if (cumulative >= lowCut) {
      low = value;
      break;
    }
  }
  cumulative = 0;
  for (let value = 0; value < 256; value++) {
    cumulative += histogram[value];
    if (cumulative >= highCut) {
      high = value;
      break;
    }
  }
  if (high - low < 8) return { ...image, data: Uint8Array.from(image.data) };
  const span = high - low;
  const data = new Uint8Array(image.data.length);
  for (let index = 0; index < data.length; index++) {
    data[index] = Math.max(0, Math.min(255, Math.round(((image.data[index] - low) * 255) / span)));
  }
  return { width: image.width, height: image.height, data };
}

/** Seuil global d'Otsu (maximisation de la variance interclasse). */
export function otsuThreshold(image: GrayscaleImage): number {
  const histogram = new Uint32Array(256);
  for (const value of image.data) histogram[value]++;
  const total = image.data.length;
  let sum = 0;
  for (let value = 0; value < 256; value++) sum += value * histogram[value];
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let bestVariance = -1;
  for (let value = 0; value < 256; value++) {
    weightBackground += histogram[value];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += value * histogram[value];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = value;
    }
  }
  return best;
}

/** Magnitude du gradient de Sobel, ramenée sur 0..255. */
export function sobelMagnitude(image: GrayscaleImage): GrayscaleImage {
  const { width, height, data } = image;
  const output = new Uint8Array(width * height);
  const at = (x: number, y: number) => data[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -at(x - 1, y - 1) + at(x + 1, y - 1) - 2 * at(x - 1, y) + 2 * at(x + 1, y) - at(x - 1, y + 1) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      output[y * width + x] = Math.min(255, Math.round(Math.hypot(gx, gy)));
    }
  }
  return { width, height, data: output };
}

export type BinarizePolarity = "motif-sombre" | "motif-clair";

/** Masque binaire : `motif-sombre` retient les pixels sous le seuil (trait noir sur fond clair). */
export function binarize(image: GrayscaleImage, threshold: number, polarity: BinarizePolarity = "motif-sombre"): BinaryMask {
  if (!Number.isFinite(threshold)) throw new Error("Le seuil de binarisation doit être fini.");
  const data = new Uint8Array(image.data.length);
  for (let index = 0; index < data.length; index++) {
    const isPattern = polarity === "motif-sombre" ? image.data[index] <= threshold : image.data[index] > threshold;
    data[index] = isPattern ? 1 : 0;
  }
  return { width: image.width, height: image.height, data };
}

/** Plus grande composante connexe (4-connexité) du masque, isolée dans un nouveau masque. */
export function largestComponent(mask: BinaryMask): { mask: BinaryMask; pixelCount: number } {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let bestLabel = -1;
  let bestCount = 0;
  let label = 0;
  for (let start = 0; start < data.length; start++) {
    if (data[start] !== 1 || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = label;
    let count = 0;
    while (head < tail) {
      const index = queue[head++];
      count++;
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0 && data[index - 1] === 1 && labels[index - 1] === -1) {
        labels[index - 1] = label;
        queue[tail++] = index - 1;
      }
      if (x < width - 1 && data[index + 1] === 1 && labels[index + 1] === -1) {
        labels[index + 1] = label;
        queue[tail++] = index + 1;
      }
      if (y > 0 && data[index - width] === 1 && labels[index - width] === -1) {
        labels[index - width] = label;
        queue[tail++] = index - width;
      }
      if (y < height - 1 && data[index + width] === 1 && labels[index + width] === -1) {
        labels[index + width] = label;
        queue[tail++] = index + width;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestLabel = label;
    }
    label++;
  }
  const output = new Uint8Array(data.length);
  if (bestLabel >= 0) for (let index = 0; index < data.length; index++) if (labels[index] === bestLabel) output[index] = 1;
  return { mask: { width, height, data: output }, pixelCount: bestCount };
}

/**
 * Suivi de frontière de Moore (critère d'arrêt de Jacob) sur le masque : renvoie le contour
 * extérieur fermé, en coordonnées pixel (origine en haut à gauche).
 */
export function traceOuterBoundary(mask: BinaryMask): Point2D[] {
  const { width, height, data } = mask;
  let startIndex = -1;
  for (let index = 0; index < data.length; index++) {
    if (data[index] === 1) {
      startIndex = index;
      break;
    }
  }
  if (startIndex < 0) throw new Error("Aucun motif détecté : ajustez le contraste ou le seuil, ou tracez le contour à la main.");
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[y * width + x] === 1;
  const neighbours: readonly [number, number][] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const start = { x: startIndex % width, y: Math.floor(startIndex / width) };
  const contour: Point2D[] = [start];
  let current = start;
  let backtrackDirection = 4; // on arrive du pixel de gauche (le précédent balayé)
  const maxSteps = width * height * 4;
  for (let step = 0; step < maxSteps; step++) {
    let found = false;
    for (let offset = 1; offset <= 8; offset++) {
      const direction = (backtrackDirection + offset) % 8;
      const [dx, dy] = neighbours[direction];
      const candidate = { x: current.x + dx, y: current.y + dy };
      if (!inside(candidate.x, candidate.y)) continue;
      backtrackDirection = (direction + 4) % 8; // on repart du pixel qu'on vient de quitter
      current = candidate;
      found = true;
      break;
    }
    if (!found) break; // pixel isolé
    if (current.x === start.x && current.y === start.y) break;
    contour.push(current);
  }
  return contour;
}

/* -------------------------------------------------------------------------- */
/*  Chaîne complète                                                           */
/* -------------------------------------------------------------------------- */

export type DetectContourOptions = {
  /** Seuil manuel 0..255. Par défaut : seuil d'Otsu calculé sur l'image. */
  threshold?: number;
  polarity?: BinarizePolarity;
  /** Applique un gradient de Sobel avant seuillage (utile sur une photo peu contrastée). */
  useGradient?: boolean;
  /** Sous ce taux de pixels retenus, la détection est jugée non concluante. */
  minimumCoverage?: number;
};

export type DetectContourResult = {
  /** Contour fermé en pixels image — une **proposition**, jamais une géométrie confirmée. */
  points: Point2D[];
  thresholdUsed: number;
  /** Part des pixels de l'image appartenant à la composante retenue (0..1). */
  coverage: number;
  /** Avertissement à afficher tel quel (§37) ; toujours renseigné. */
  notice: string;
};

/** Sous ce taux, le résultat est presque toujours du bruit. */
export const MIN_DETECTION_COVERAGE = 0.0005;

/**
 * §14 — Chaîne de détection complète sur une image déjà réduite. Le résultat est
 * explicitement une proposition à valider (§18).
 */
export function detectContour(image: GrayscaleImage, options: DetectContourOptions = {}): DetectContourResult {
  assertSize(image.width, image.height, image.data.length, 1);
  const prepared = options.useGradient ? sobelMagnitude(stretchContrast(image)) : stretchContrast(image);
  const polarity: BinarizePolarity = options.polarity ?? (options.useGradient ? "motif-clair" : "motif-sombre");
  const threshold = options.threshold ?? otsuThreshold(prepared);
  const mask = binarize(prepared, threshold, polarity);
  const { mask: component, pixelCount } = largestComponent(mask);
  const coverage = pixelCount / (image.width * image.height);
  const minimumCoverage = options.minimumCoverage ?? MIN_DETECTION_COVERAGE;
  if (coverage < minimumCoverage) {
    throw new Error("Détection non concluante : aucun motif suffisamment marqué. Ajustez le seuil ou tracez le contour à la main.");
  }
  const points = traceOuterBoundary(component);
  if (points.length < 3) {
    throw new Error("Détection non concluante : contour trop court. Ajustez le seuil ou tracez le contour à la main.");
  }
  return {
    points,
    thresholdUsed: threshold,
    coverage,
    notice: "Contour automatique — à valider avant utilisation.",
  };
}
