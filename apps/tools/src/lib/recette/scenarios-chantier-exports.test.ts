/**
 * RECETTE INTERNE — scénarios A à G du lot Chantier Exports V1.
 *
 * Fige les critères d'acceptation de l'intégration : pagination réelle du PDF chantier,
 * échelle d'impression honnête, garde-fous des gabarits 1:1 / mosaïque, SVG 1:1 coté en
 * millimètres et remontée des approximations DXF. Exécute les fonctions RÉELLES.
 */
import { describe, expect, it } from "vitest";
import type { jsPDF } from "jspdf";

import { buildChantierPdfDocument, buildChantierMosaicPdfDocument } from "../exports/chantier-pdf";
import { exportChantier } from "../exports/chantier-export-bus";
import { shapeGeometryToDxf } from "../exports/dxf";
import { renderFullScaleSvg } from "../exports/svg";
import type { ChantierExportDocument } from "../exports/chantier-document";
import type { ShapeGeometry } from "../geometry/shape-model";
import { buildReportTable } from "../chantier/report-table";
import { planMosaic } from "../chantier/mosaic";
import { describeDisplayScale } from "../chantier/print-scale";
import { assessMosaicSafety, PRINT_INSTRUCTION } from "../chantier/print-safety";

/** Texte réellement dessiné dans le flux PDF, page par page (jsPDF garde les pages en clair). */
function pageTexts(pdf: jsPDF): string[] {
  const pages = (pdf as unknown as { internal: { pages: string[][] } }).internal.pages;
  return pages
    .filter((page): page is string[] => Array.isArray(page))
    .map((page) =>
      page
        .join("\n")
        .split("\n")
        .flatMap((line) => [...line.matchAll(/\((.*?)\)\s*Tj/g)].map((match) => match[1]))
        .join(" "),
    );
}

const project: ChantierExportDocument["project"] = {
  id: "trace-recette",
  name: "Recette exports chantier",
  units: "mm",
  generatedAt: "2026-09-06T12:00:00.000Z",
};

const ellipseGeometry: ShapeGeometry = {
  id: "ellipse-recette",
  name: "Ellipse de recette",
  bounds: { minX: 0, minY: 0, maxX: 1200, maxY: 800 },
  referenceFrame: { unit: "mm", origin: { id: "O", x: 600, y: 400 }, xLabel: "X", yLabel: "Y", yOrientation: "up" },
  axes: [],
  points: [{ id: "O", x: 600, y: 400 }],
  segments: [],
  arcs: [],
  circles: [],
  ellipses: [{ id: "e1", centre: { id: "O", x: 600, y: 400 }, radiusX: 600, radiusY: 400 }],
  constructionLines: [],
  dimensions: [],
  controls: [],
  quantities: [],
  steps: [],
};

function reportOf(count: number) {
  return buildReportTable(
    Array.from({ length: count }, (_, index) => ({
      label: `P${index + 1}`,
      point: { x: 100 + index * 7, y: 50 + index * 3 },
    })),
  );
}

describe("Scénario A — table de report > 40 points : aucune ligne perdue", () => {
  it("rend les 60 libellés de report dans le PDF, sur plusieurs pages", () => {
    const rowCount = 60;
    const pdf = buildChantierPdfDocument({ project, report: reportOf(rowCount) });
    const text = pageTexts(pdf).join(" ");

    for (let index = 1; index <= rowCount; index++) {
      expect(text, `libellé P${index} absent du PDF`).toContain(`P${index}`);
    }
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  });

  it("le nombre de pages croît avec le nombre de lignes — jamais de troncature silencieuse", () => {
    const pages = [45, 120, 400].map((count) => buildChantierPdfDocument({ project, report: reportOf(count) }).getNumberOfPages());
    expect(pages[1]).toBeGreaterThan(pages[0]);
    expect(pages[2]).toBeGreaterThan(pages[1]);
  });
});

describe("Scénario B — PDF multipage : pagination et en-têtes répétés", () => {
  const pdf = buildChantierPdfDocument({ project, report: reportOf(120) });

  it("chaque page porte sa pagination « Page X / Y »", () => {
    const texts = pageTexts(pdf);
    const total = pdf.getNumberOfPages();
    expect(total).toBeGreaterThan(2);
    texts.forEach((text, index) => {
      expect(text, `page ${index + 1} sans pagination`).toMatch(new RegExp(`Page\\s*${index + 1}\\s*/\\s*${total}`));
    });
  });

  it("l'en-tête de tableau est répété sur chaque page de report", () => {
    const reportPages = pageTexts(pdf).filter((text) => /\bP\d+\b/.test(text));
    expect(reportPages.length).toBeGreaterThan(1);
    for (const text of reportPages) {
      expect(text, "en-tête de colonne absent d'une page de report").toMatch(/Rep|Label|X \(mm\)|Distance/i);
    }
  });
});

describe("Scénario C — gabarit 1:1 : dimensions physiques et consigne 100 %", () => {
  const mosaic = planMosaic({ contentWidthMm: 1200, contentHeightMm: 800, format: "A4" });
  const pdf = buildChantierMosaicPdfDocument({ project, geometry: ellipseGeometry, mosaic });
  const text = pageTexts(pdf).join(" ");

  it("porte la consigne « imprimer à 100 % »", () => {
    expect(PRINT_INSTRUCTION).toMatch(/100\s*%/);
    expect(text).toContain("Imprimer à 100");
  });

  it("annonce les dimensions réelles du motif en millimètres", () => {
    expect(text).toMatch(/Motif complet\s*:\s*1\s*200\s*×\s*800\s*mm/);
  });
});

describe("Scénario D — mosaïque : numéros, repère HAUT, dimensions, voisinage", () => {
  const mosaic = planMosaic({ contentWidthMm: 1200, contentHeightMm: 800, format: "A4" });
  const pdf = buildChantierMosaicPdfDocument({ project, geometry: ellipseGeometry, mosaic });
  const texts = pageTexts(pdf);

  it("produit une page d'assemblage puis une page par feuille", () => {
    expect(mosaic.sheetCount).toBeGreaterThan(1);
    expect(pdf.getNumberOfPages()).toBe(1 + mosaic.sheetCount);
  });

  it("porte le repère d'orientation HAUT DU MOTIF", () => {
    expect(texts.join(" ")).toContain("HAUT DU MOTIF");
  });

  it("identifie chaque feuille et annonce ses voisines", () => {
    const sheetPages = texts.slice(1);
    expect(sheetPages).toHaveLength(mosaic.sheetCount);
    for (const tile of mosaic.tiles) {
      expect(texts.join(" "), `feuille ${tile.label} absente`).toContain(tile.label);
    }
    // Une mosaïque de plusieurs feuilles doit décrire le voisinage, sinon l'assemblage est aveugle.
    expect(sheetPages.some((text) => /droite|gauche|haut|bas/i.test(text))).toBe(true);
  });

  it("le garde-fou de volume classe ce gabarit comme praticable", () => {
    expect(assessMosaicSafety(mosaic).level).not.toBe("blocked");
  });
});

describe("Scénario E — DXF avec ellipse : approximation signalée", () => {
  it("shapeGeometryToDxf remonte l'approximation polyligne", () => {
    const { approximations } = shapeGeometryToDxf(ellipseGeometry);
    expect(approximations.length).toBeGreaterThan(0);
    expect(approximations.join(" ")).toMatch(/ellipse/i);
  });

  it("l'approximation survit jusqu'au résultat d'export — elle n'est plus jetée", async () => {
    const result = await exportChantier({ project, geometry: ellipseGeometry }, "dxf");
    expect(result.approximations.length).toBeGreaterThan(0);
    // L'ellipse n'existe pas en DXF R12 : elle est livrée en POLYLINE échantillonnée.
    expect(result.approximations.join(" ")).toMatch(/POLYLINE/);
    expect(result.approximations.join(" ")).toMatch(/ellipse/i);
  });

  it("un export exact ne fabrique pas d'approximation", async () => {
    const result = await exportChantier({ project, geometry: ellipseGeometry }, "svg");
    expect(result.approximations).toEqual([]);
  });
});

describe("Scénario F — SVG 1:1 : dimensions physiques en millimètres", () => {
  const svg = renderFullScaleSvg(ellipseGeometry, "Recette");

  it("déclare width/height en mm à l'emprise réelle (motif + marges)", () => {
    expect(svg).toMatch(/width="1220mm"/);
    expect(svg).toMatch(/height="820mm"/);
  });

  it("le viewBox est en unités millimétriques, donc 1 unité = 1 mm", () => {
    expect(svg).toMatch(/viewBox="0 0 1220 820"/);
  });

  it("le bus expose le format svg-1to1", async () => {
    const result = await exportChantier({ project, geometry: ellipseGeometry }, "svg-1to1");
    expect(result.mimeType).toBe("image/svg+xml");
    expect(result.fileName).toContain("1-1");
  });
});

describe("Scénario G — facteur 0,999 ne doit JAMAIS s'afficher « 1:1 »", () => {
  it("un facteur voisin de 1 est décrit comme ajusté, pas comme taille réelle", () => {
    const scale = describeDisplayScale(0.999);
    expect(scale.kind).not.toBe("full-size");
    expect(scale.label).not.toBe("1:1");
    expect(scale.caption).not.toMatch(/dimensions réelles/i);
  });

  it("seul un facteur strictement 1 donne « 1:1 »", () => {
    expect(describeDisplayScale(1).label).toBe("1:1");
    expect(describeDisplayScale(1).kind).toBe("full-size");
  });

  it("aucun facteur proche de 1 ne se replie sur « 1:1 »", () => {
    for (const factor of [0.999, 0.9999, 1.001, 1.0001, 0.99999]) {
      expect(describeDisplayScale(factor).label, `facteur ${factor}`).not.toBe("1:1");
    }
  });
});
