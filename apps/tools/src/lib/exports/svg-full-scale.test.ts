import { describe, expect, it } from "vitest";
import { renderFullScaleSvg, renderPlanSvg, SVG_LAYERS } from "./svg";
import type { ShapeGeometry } from "../geometry/shape-model";

const model: ShapeGeometry = {
  id: "rosette", name: "Rosace",
  bounds: { minX: 0, minY: 0, maxX: 1200, maxY: 800 },
  referenceFrame: { unit: "mm", origin: { id: "O", x: 0, y: 0 }, xLabel: "X", yLabel: "Y", yOrientation: "up" },
  axes: [],
  points: [{ id: "O", x: 0, y: 0 }],
  segments: [{ id: "s1", start: { id: "A", x: 0, y: 0 }, end: { id: "B", x: 1200, y: 0 } }],
  arcs: [{ id: "a1", centre: { id: "C", x: 600, y: 400 }, radius: 300, startAngle: 0, endAngle: Math.PI }],
  circles: [{ id: "c1", centre: { id: "C", x: 600, y: 400 }, radius: 200 }],
  ellipses: [],
  constructionLines: [{ id: "cl1", start: { id: "A", x: 0, y: 400 }, end: { id: "B", x: 1200, y: 400 }, role: "axis" }],
  dimensions: [{ id: "d1", kind: "linear", from: { id: "A", x: 0, y: 0 }, to: { id: "B", x: 1200, y: 0 }, label: "1200 mm", value: 1200, unit: "mm" }],
  controls: [], quantities: [], steps: [],
};

describe("calques SVG (§14, §17)", () => {
  it("le plan regroupe les entités en calques nommés", () => {
    const svg = renderPlanSvg(model, "Rosace");
    expect(svg).toContain('<g id="elsatia-final"');
    expect(svg).toContain('<g id="elsatia-construction"');
    expect(svg).toContain('<g id="elsatia-cotations"');
  });

  it("n'émet aucun calque vide", () => {
    const svg = renderPlanSvg({ ...model, constructionLines: [], dimensions: [], points: [] }, "Rosace");
    expect(svg).not.toContain('<g id="elsatia-construction"');
    expect(svg).not.toContain('<g id="elsatia-cotations"');
    expect(svg).toContain('<g id="elsatia-final"');
  });

  it("les noms de calques restent alignés sur la convention DXF", () => {
    expect(SVG_LAYERS).toContain("elsatia-construction");
    expect(SVG_LAYERS).toContain("elsatia-cotations");
  });
});

describe("plan ajusté : jamais annoncé 1:1 (§6)", () => {
  it("porte son échelle réelle et se déclare non 1:1", () => {
    const svg = renderPlanSvg(model, "Rosace");
    expect(svg).toContain('data-elsatia-full-scale="false"');
    expect(svg).not.toContain('data-elsatia-scale="1:1"');
    expect(svg).toMatch(/data-elsatia-scale="1:[\d,.]+"/);
  });
});

describe("gabarit SVG 1:1 (§14)", () => {
  it("exprime ses dimensions en millimètres réels, marges comprises", () => {
    const svg = renderFullScaleSvg(model, "Rosace", { marginMm: 10 });
    expect(svg).toContain('width="1220mm"');
    expect(svg).toContain('height="820mm"');
    expect(svg).toContain('viewBox="0 0 1220 820"');
    expect(svg).toContain('data-elsatia-full-scale="true"');
  });

  it("reporte les coordonnées sans mise à l'échelle (rayon réel conservé)", () => {
    const svg = renderFullScaleSvg(model, "Rosace", { marginMm: 0 });
    expect(svg).toContain('r="200"');
  });

  it("inverse l'axe Y du repère chantier vers le repère SVG", () => {
    // Centre monde (600, 400), bounds maxY = 800, marge 0 → y SVG = 800 - 400 = 400.
    const svg = renderFullScaleSvg(model, "Rosace", { marginMm: 0 });
    expect(svg).toContain('cx="600" cy="400"');
  });

  it("n'incorpore aucun raster et ne produit aucune coordonnée non finie", () => {
    const svg = renderFullScaleSvg(model, "Rosace");
    expect(svg).not.toMatch(/<image|data:image/);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it("porte la consigne d'impression à 100 %", () => {
    expect(renderFullScaleSvg(model, "Rosace")).toMatch(/100 ?%/);
  });

  it("n'inclut la construction que si on la demande", () => {
    expect(renderFullScaleSvg(model, "Rosace")).not.toContain('<g id="elsatia-construction"');
    expect(renderFullScaleSvg(model, "Rosace", { includeConstruction: true })).toContain('<g id="elsatia-construction"');
  });

  it("refuse une emprise vide ou non finie plutôt que de produire un faux gabarit", () => {
    expect(() => renderFullScaleSvg({ ...model, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }, "x")).toThrow(/emprise/i);
    expect(() => renderFullScaleSvg({ ...model, bounds: { minX: 0, minY: 0, maxX: Number.NaN, maxY: 10 } }, "x")).toThrow(/non finies/i);
    expect(() => renderFullScaleSvg(model, "x", { marginMm: -1 })).toThrow(/marge/i);
  });
});
