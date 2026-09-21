import { describe, expect, it } from "vitest";
import {
  assertWithinPngLimits,
  MAX_PNG_DIMENSION_PX,
  PNG_LOGICAL_HEIGHT,
  PNG_LOGICAL_WIDTH,
  PngExportError,
  renderChantierPng,
  resolvePngDimensions,
} from "./png";
import type { ShapeGeometry } from "../geometry/shape-model";

const model: ShapeGeometry = {
  id: "m", name: "m",
  bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
  referenceFrame: { unit: "mm", origin: { id: "O", x: 0, y: 0 }, xLabel: "X", yLabel: "Y", yOrientation: "up" },
  axes: [], points: [], segments: [], arcs: [], circles: [], ellipses: [], constructionLines: [], dimensions: [], controls: [], quantities: [], steps: [],
};

describe("dimensions PNG (§4 workflow exports)", () => {
  it("résolution standard = taille logique du plan SVG", () => {
    expect(resolvePngDimensions("standard")).toEqual({ widthPx: PNG_LOGICAL_WIDTH, heightPx: PNG_LOGICAL_HEIGHT });
  });

  it("résolution HD = un multiple net de la résolution standard", () => {
    const hd = resolvePngDimensions("hd");
    const standard = resolvePngDimensions("standard");
    expect(hd.widthPx).toBeGreaterThan(standard.widthPx);
    expect(hd.widthPx % standard.widthPx).toBe(0);
  });

  it("refuse une résolution inconnue", () => {
    expect(() => resolvePngDimensions("ultra" as never)).toThrow(PngExportError);
  });

  it("refuse des dimensions excessives (garde défensive)", () => {
    expect(() => assertWithinPngLimits(MAX_PNG_DIMENSION_PX + 1, 100)).toThrow(/limite/i);
    expect(() => assertWithinPngLimits(100, MAX_PNG_DIMENSION_PX + 1)).toThrow(/limite/i);
    expect(() => assertWithinPngLimits(100, 100)).not.toThrow();
  });

  it("refuse des dimensions non finies ou négatives", () => {
    expect(() => assertWithinPngLimits(Number.NaN, 100)).toThrow(PngExportError);
    expect(() => assertWithinPngLimits(-10, 100)).toThrow(PngExportError);
  });
});

describe("rendu PNG — garde environnement serveur", () => {
  it("échoue proprement côté serveur plutôt que de produire un fichier incorrect", async () => {
    await expect(renderChantierPng(model, "Test")).rejects.toThrow(/navigateur/i);
    await expect(renderChantierPng(model, "Test")).rejects.toBeInstanceOf(PngExportError);
  });
});
