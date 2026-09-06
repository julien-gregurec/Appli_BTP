import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { DEFAULT_FLOW_BOTTOM, DEFAULT_FLOW_TOP, PdfFlow, stampPages } from "./pdf-flow";

const newPdf = () => new jsPDF({ unit: "mm", format: "a4", compress: true });

describe("flux paginé (§5)", () => {
  it("part du haut de la zone utile et connaît ses bornes", () => {
    const flow = new PdfFlow(newPdf());
    expect(flow.y).toBe(DEFAULT_FLOW_TOP);
    expect(flow.isPageEmpty).toBe(true);
    expect(flow.limit).toBeCloseTo(flow.pageHeight - DEFAULT_FLOW_BOTTOM, 6);
    expect(flow.contentWidth).toBeCloseTo(flow.pageWidth - flow.left - flow.right, 6);
  });

  it("ne rompt pas la page tant que le contenu tient", () => {
    const flow = new PdfFlow(newPdf());
    expect(flow.ensure(10)).toBe(false);
    expect(flow.pdf.getNumberOfPages()).toBe(1);
  });

  it("ajoute une page dès que le contenu ne tient plus, et remonte le curseur", () => {
    const pdf = newPdf();
    const flow = new PdfFlow(pdf);
    flow.advance(flow.remaining - 1);
    expect(flow.ensure(10)).toBe(true);
    expect(pdf.getNumberOfPages()).toBe(2);
    expect(flow.y).toBe(DEFAULT_FLOW_TOP);
  });

  it("notifie chaque rupture de page pour réimprimer un en-tête de tableau", () => {
    const flow = new PdfFlow(newPdf());
    const breaks: number[] = [];
    flow.onPageBreak = (broken) => breaks.push(broken.pdf.getNumberOfPages());
    for (let index = 0; index < 200; index++) {
      flow.ensure(5);
      flow.advance(5);
    }
    expect(breaks.length).toBeGreaterThan(0);
    expect(breaks).toEqual(breaks.map((_, index) => index + 2));
  });

  it("startPage n'ouvre pas de page blanche si la page courante est vierge", () => {
    const pdf = newPdf();
    const flow = new PdfFlow(pdf);
    flow.startPage();
    expect(pdf.getNumberOfPages()).toBe(1);
    flow.advance(10);
    flow.startPage();
    expect(pdf.getNumberOfPages()).toBe(2);
  });

  it("refuse une hauteur réservée invalide", () => {
    const flow = new PdfFlow(newPdf());
    expect(() => flow.ensure(Number.NaN)).toThrow();
    expect(() => flow.ensure(-1)).toThrow();
  });

  it("stampPages appose en-tête et pied sur toutes les pages avec le total exact", () => {
    const pdf = newPdf();
    pdf.addPage();
    pdf.addPage();
    const seen: { page: number; total: number }[] = [];
    stampPages(pdf, (page, total) => seen.push({ page, total }), () => {});
    expect(seen).toEqual([
      { page: 1, total: 3 },
      { page: 2, total: 3 },
      { page: 3, total: 3 },
    ]);
  });
});
