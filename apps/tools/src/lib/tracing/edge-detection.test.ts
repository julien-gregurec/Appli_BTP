import { describe, expect, it } from "vitest";
import {
  binarize,
  detectContour,
  largestComponent,
  otsuThreshold,
  sobelMagnitude,
  toGrayscale,
  traceOuterBoundary,
  type GrayscaleImage,
} from "./edge-detection";
import { boundsFromPoints } from "./geometry-port";

/** Croquis synthétique : motif sombre sur fond clair. */
function sketch(width: number, height: number, isPattern: (x: number, y: number) => boolean): GrayscaleImage {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = isPattern(x, y) ? 20 : 235;
  }
  return { width, height, data };
}

const SQUARE = sketch(120, 120, (x, y) => x >= 30 && x < 90 && y >= 20 && y < 100);
const DISC = sketch(160, 160, (x, y) => Math.hypot(x - 80, y - 80) <= 50);

describe("préparation de l'image (§14)", () => {
  it("convertit un tampon RGBA en niveaux de gris", () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255]);
    const grey = toGrayscale(rgba, 2, 2);
    expect(grey.data[0]).toBe(255);
    expect(grey.data[1]).toBe(0);
    expect(grey.data[2]).toBe(76);
    expect(grey.data[3]).toBe(29);
  });

  it("refuse un tampon incohérent avec les dimensions annoncées", () => {
    expect(() => toGrayscale(new Uint8ClampedArray(8), 4, 4)).toThrow();
  });

  it("sépare fond et motif par le seuil d'Otsu", () => {
    // Sur une image à deux niveaux (20 / 235), la variance interclasse est maximale dès 20 :
    // le seuil retenu sépare exactement le motif du fond.
    const threshold = otsuThreshold(SQUARE);
    expect(threshold).toBeGreaterThanOrEqual(20);
    expect(threshold).toBeLessThan(235);
    const mask = binarize(SQUARE, threshold);
    const pattern = mask.data.reduce((sum, value) => sum + value, 0);
    expect(pattern).toBe(60 * 80);
  });

  it("fait ressortir les bords avec le gradient de Sobel", () => {
    const gradient = sobelMagnitude(SQUARE);
    expect(gradient.data[gradient.width * 60 + 30]).toBeGreaterThan(100);
    expect(gradient.data[gradient.width * 60 + 60]).toBe(0);
  });
});

describe("composantes et suivi de frontière (§14)", () => {
  it("ne retient que la plus grande tache", () => {
    const twoBlobs = sketch(100, 100, (x, y) => (x < 40 && y < 40) || (x > 90 && y > 90));
    const { mask, pixelCount } = largestComponent(binarize(twoBlobs, otsuThreshold(twoBlobs)));
    expect(pixelCount).toBe(40 * 40);
    expect(mask.data[99 * 100 + 99]).toBe(0);
  });

  it("suit la frontière extérieure d'un carré", () => {
    const contour = traceOuterBoundary(largestComponent(binarize(SQUARE, otsuThreshold(SQUARE))).mask);
    const bounds = boundsFromPoints(contour);
    expect(bounds.minX).toBe(30);
    expect(bounds.maxX).toBe(89);
    expect(bounds.minY).toBe(20);
    expect(bounds.maxY).toBe(99);
    expect(contour.length).toBeGreaterThan(200);
  });
});

describe("chaîne de détection (§14, §17, §18)", () => {
  it("détecte un disque et en renvoie un contour exploitable", () => {
    const detection = detectContour(DISC);
    const bounds = boundsFromPoints(detection.points);
    expect(bounds.maxX - bounds.minX).toBeGreaterThanOrEqual(98);
    expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(101);
    expect(detection.coverage).toBeGreaterThan(0.25);
  });

  it("annonce toujours que le résultat est à valider", () => {
    expect(detectContour(SQUARE).notice).toBe("Contour automatique — à valider avant utilisation.");
  });

  it("refuse de produire un contour sur une image sans motif", () => {
    const empty = sketch(80, 80, () => false);
    expect(() => detectContour(empty)).toThrow(/non concluante/);
  });

  it("refuse une image dépassant le budget d'analyse", () => {
    const huge = { width: 4000, height: 3000, data: new Uint8Array(4000 * 3000) };
    expect(() => detectContour(huge)).toThrow(/trop grande/);
  });

  it("accepte un seuil manuel", () => {
    const detection = detectContour(SQUARE, { threshold: 128 });
    expect(detection.thresholdUsed).toBe(128);
  });
});
