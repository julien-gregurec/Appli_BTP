import { describe, expect, it } from "vitest";
import { assessMosaicSafety, MAX_MOSAIC_SHEETS, MOSAIC_SHEET_WARNING_THRESHOLD, PRINT_INSTRUCTION } from "./print-safety";
import { planMosaic } from "./mosaic";

describe("garde-fous d'impression (§38, §39)", () => {
  it("un gabarit courant ne déclenche aucune alerte", () => {
    const plan = planMosaic({ contentWidthMm: 500, contentHeightMm: 800, format: "A4" });
    const safety = assessMosaicSafety(plan);
    expect(safety.level).toBe("ok");
    expect(safety.message).toBeUndefined();
    expect(safety.sheetCount).toBe(plan.sheetCount);
  });

  it("prévient au-delà du seuil d'alerte", () => {
    const safety = assessMosaicSafety({ sheetCount: MOSAIC_SHEET_WARNING_THRESHOLD, format: "A4" });
    expect(safety.level).toBe("warning");
    expect(safety.message).toContain(String(MOSAIC_SHEET_WARNING_THRESHOLD));
  });

  it("bloque au-delà du plafond dur", () => {
    const safety = assessMosaicSafety({ sheetCount: MAX_MOSAIC_SHEETS + 1, format: "A4" });
    expect(safety.level).toBe("blocked");
    expect(safety.message).toMatch(/plafond/i);
  });

  it("le plafond est strictement supérieur au seuil d'alerte", () => {
    expect(MAX_MOSAIC_SHEETS).toBeGreaterThan(MOSAIC_SHEET_WARNING_THRESHOLD);
  });

  it("refuse un nombre de feuilles incohérent", () => {
    expect(() => assessMosaicSafety({ sheetCount: 0, format: "A4" })).toThrow();
    expect(() => assessMosaicSafety({ sheetCount: 1.5, format: "A4" })).toThrow();
  });

  it("la consigne imprimante nomme le 100 % et interdit l'ajustement à la page (§7)", () => {
    expect(PRINT_INSTRUCTION).toMatch(/100 ?%/);
    expect(PRINT_INSTRUCTION).toMatch(/ajuster à la page/i);
  });
});
