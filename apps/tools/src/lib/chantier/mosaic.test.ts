import { describe, expect, it } from "vitest";
import { PAPER_SIZES_MM, planMosaic, sheetCaption } from "./mosaic";

describe("impression mosaïque (§16–§18)", () => {
  it("un petit motif tient sur une seule feuille (§16)", () => {
    const plan = planMosaic({ contentWidthMm: 150, contentHeightMm: 200, format: "A4" });
    expect(plan.columns).toBe(1);
    expect(plan.rows).toBe(1);
    expect(plan.sheetCount).toBe(1);
    expect(plan.fitsSingleSheet).toBe(true);
    expect(plan.tiles[0].contentWidthMm).toBe(150);
    expect(plan.witness.lengthMm).toBe(100);
    expect(plan.witness.text).toMatch(/exactement 100 mm/);
  });

  it("découpe un grand motif A4 avec recouvrement et couvre tout le motif", () => {
    const plan = planMosaic({ contentWidthMm: 500, contentHeightMm: 800, format: "A4", marginMm: 10, overlapMm: 10 });
    expect([plan.usableWidthMm, plan.usableHeightMm]).toEqual([190, 277]);
    expect(plan.columns).toBe(3);
    expect(plan.rows).toBe(3);
    expect(plan.sheetCount).toBe(9);
    expect(plan.assembly).toEqual([
      ["A1", "A2", "A3"],
      ["B1", "B2", "B3"],
      ["C1", "C2", "C3"],
    ]);

    const last = plan.tiles.find((tile) => tile.column === 2 && tile.row === 0)!;
    expect(last.contentXMm).toBe(310); // borné pour ne pas dépasser le motif
    expect(last.contentXMm + last.contentWidthMm).toBeCloseTo(500, 6);
    expect(last.overlapRightMm).toBe(0);

    const first = plan.tiles.find((tile) => tile.index === 1)!;
    expect(first.overlapRightMm).toBe(10);
    expect(first.overlapBottomMm).toBe(10);
    expect(sheetCaption(first)).toBe("Feuille 1 / 9");
  });

  it("prend en compte l'orientation paysage", () => {
    const portrait = planMosaic({ contentWidthMm: 260, contentHeightMm: 260, format: "A4" });
    const landscape = planMosaic({ contentWidthMm: 260, contentHeightMm: 260, format: "A4", orientation: "landscape" });
    expect(portrait.sheetWidthMm).toBe(PAPER_SIZES_MM.A4.width);
    expect(landscape.sheetWidthMm).toBe(PAPER_SIZES_MM.A4.height);
    expect(landscape.columns).toBe(1); // 260 < 277 utile en paysage
  });

  it("refuse un recouvrement supérieur à la zone utile et une marge trop grande", () => {
    expect(() => planMosaic({ contentWidthMm: 1000, contentHeightMm: 1000, format: "A4", overlapMm: 999 })).toThrow(/recouvrement/i);
    expect(() => planMosaic({ contentWidthMm: 100, contentHeightMm: 100, format: "A4", marginMm: 200 })).toThrow(/marge/i);
  });

  it("refuse des dimensions de motif nulles", () => {
    expect(() => planMosaic({ contentWidthMm: 0, contentHeightMm: 100, format: "A4" })).toThrow(/supérieures à 0/);
  });
});
