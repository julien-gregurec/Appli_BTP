import { describe, expect, it } from "vitest";
import { buildReportViewModel } from "./report-view-model";
import { buildWitnessViewModel, WITNESS_PRESETS_MM } from "./witness-view-model";
import { originBadgeModel, qualityBadgeModel } from "../shared/badges";
import { formatDecimal, formatMm, formatPercent, formatQuantity } from "../shared/format";

describe("ReportTableView — adaptateur props → affichage (§2, §9)", () => {
  it("convertit les points en lignes formatées (mm, degrés)", () => {
    const model = buildReportViewModel({
      points: [
        { label: "A", point: { x: 1250, y: 600 } },
        { label: "B", point: { x: 2100, y: 600 } },
      ],
    });
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.empty).toBe(false);
    expect(model.columns.map((column) => column.key)).toEqual(["label", "x", "y", "distance", "angle"]);
    // Colonnes numériques marquées pour l'alignement + le libellé mobile.
    expect(model.columns.filter((column) => column.numeric).map((column) => column.unit)).toEqual(["mm", "mm", "mm", "°"]);
    expect(model.rows[0].cells).toEqual(["A", "1250,0", "600,0", "1386,5", "25,6°"]);
  });

  it("respecte le nombre de décimales demandé", () => {
    const model = buildReportViewModel({ points: [{ label: "A", point: { x: 1000, y: 0 } }], fractionDigits: 2 });
    expect(model.ok && model.rows[0].cells[3]).toBe("1000,00");
  });

  it("gère une liste de points vide sans erreur (§13 valeurs vides)", () => {
    const model = buildReportViewModel({ points: [] });
    expect(model.ok && model.empty).toBe(true);
    expect(model.ok && model.rows).toEqual([]);
  });

  it("n'affiche le badge d'origine que s'il est fourni explicitement (§3)", () => {
    const withoutOrigin = buildReportViewModel({ points: [{ label: "A", point: { x: 1, y: 1 } }] });
    expect(withoutOrigin.ok && withoutOrigin.measurementOrigin).toBeUndefined();
    const withOrigin = buildReportViewModel({
      points: [{ label: "A", point: { x: 1, y: 1 } }],
      measurementOrigin: "approximated",
    });
    expect(withOrigin.ok && withOrigin.measurementOrigin).toBe("approximated");
  });

  it("propage proprement une erreur backend (point non fini)", () => {
    const model = buildReportViewModel({ points: [{ label: "X", point: { x: Number.POSITIVE_INFINITY, y: 0 } }] });
    expect(model.ok).toBe(false);
    expect(!model.ok && model.error).toMatch(/invalides/);
  });

  it("propage proprement une origine de report invalide", () => {
    const model = buildReportViewModel({
      points: [{ label: "A", point: { x: 0, y: 0 } }],
      origin: { x: Number.NaN, y: 0 },
    });
    expect(model.ok).toBe(false);
  });
});

describe("Badges origine / qualité — §12 (jamais la couleur seule)", () => {
  it("porte un libellé, un code et un glyphe pour chaque origine", () => {
    const exact = originBadgeModel("exact");
    expect(exact).toMatchObject({ label: "Exact (géométrie)", code: "EXACT", trusted: true });
    expect(exact.glyph).not.toBe("");
    const approx = originBadgeModel("approximated");
    expect(approx.trusted).toBe(false);
    expect(approx.warning).not.toBe("");
  });

  it("distingue exact / estimation par le texte et la forme, pas la couleur", () => {
    expect(qualityBadgeModel("exact")).toMatchObject({ label: "Exact", glyph: "●" });
    expect(qualityBadgeModel("estimate")).toMatchObject({ label: "Estimation", glyph: "◐" });
  });
});

describe("Cote témoin — WitnessDimensionCard (§4)", () => {
  it("réutilise witnessDimension pour la longueur par défaut", () => {
    const model = buildWitnessViewModel();
    expect(model.ok && model.witness.lengthMm).toBe(100);
    expect(model.ok && model.isDefault).toBe(true);
    expect(model.ok && model.witness.text).toContain("100 mm");
  });

  it("expose des préréglages exploitables", () => {
    expect(WITNESS_PRESETS_MM).toContain(100);
    for (const preset of WITNESS_PRESETS_MM) expect(buildWitnessViewModel(preset).ok).toBe(true);
  });

  it("propage l'erreur backend pour une longueur ≤ 0", () => {
    const model = buildWitnessViewModel(0);
    expect(model.ok).toBe(false);
    expect(!model.ok && model.error).toMatch(/supérieure à 0/);
  });
});

describe("Formatage d'affichage", () => {
  it("formate en français (virgule, séparateur de milliers)", () => {
    expect(formatDecimal(1386.54, 1)).toBe("1 386,5");
    expect(formatMm(1386.54)).toBe("1 386,5 mm");
    expect(formatQuantity(6, "u")).toBe("6 u");
    expect(formatQuantity(18.42, "ml")).toBe("18,42 ml");
    expect(formatPercent(10)).toBe("10 %");
    expect(formatPercent(7.5)).toBe("7,5 %");
  });
});
