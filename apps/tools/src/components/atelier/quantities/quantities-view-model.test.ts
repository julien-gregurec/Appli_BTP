import { describe, expect, it } from "vitest";
import type { Quantity } from "../../../lib/geometry/shape-model";
import { buildNomenclatureViewModel } from "./nomenclature-view-model";
import { buildMarginViewModel, MARGIN_OPTIONS, resolveMarginChoice } from "./margin-view-model";
import { buildProfilePlanViewModel } from "./profile-view-model";
import { buildLightingSummaryViewModel } from "./lighting-view-model";

describe("NomenclatureTable — adaptateur (§5, §9)", () => {
  it("construit la nomenclature depuis un agrégat brut", () => {
    const model = buildNomenclatureViewModel({
      input: {
        lengthsMm: [{ label: "Contour principal", value: 18420 }],
        surfacesM2: [{ label: "Surface", value: 6.35 }],
        counts: [{ label: "Spots", value: 8 }],
      },
    });
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.hasMarginColumn).toBe(false);
    expect(model.lines.map((line) => [line.unit, line.quality])).toEqual([
      ["ml", "exact"],
      ["m²", "estimate"],
      ["u", "exact"],
    ]);
    expect(model.lines[0].quantity).toBe(18.42);
  });

  it("dérive la nomenclature des quantités d'une ShapeGeometry du moteur (§34)", () => {
    const quantities: Quantity[] = [
      { id: "perimetre", label: "Périmètre", value: 12000, unit: "mm", quality: "exact" },
      { id: "aire", label: "Aire", value: 9_000_000, unit: "mm²", quality: "estimate" },
    ];
    const model = buildNomenclatureViewModel({ quantities });
    expect(model.ok && model.lines.map((line) => [line.label, line.unit, line.quantity])).toEqual([
      ["Périmètre", "ml", 12],
      ["Aire", "m²", 9],
    ]);
  });

  it("ajoute la colonne « quantité à prévoir » quand une marge > 0 est fournie (§6)", () => {
    const model = buildNomenclatureViewModel({
      input: { lengthsMm: [{ label: "Gorge LED", value: 17850 }] },
      margin: { kind: "preset", percent: 10 },
    });
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.hasMarginColumn).toBe(true);
    // Quantité géométrique d'origine inchangée, marge appliquée à part.
    expect(model.lines[0].quantity).toBe(17.85);
    expect(model.lines[0].withMargin).toBeCloseTo(19.64, 2);
  });

  it("n'ajoute pas de colonne marge pour une marge de 0 %", () => {
    const model = buildNomenclatureViewModel({
      input: { lengthsMm: [{ label: "Contour", value: 1000 }] },
      margin: { kind: "preset", percent: 0 },
    });
    expect(model.ok && model.hasMarginColumn).toBe(false);
    expect(model.ok && model.lines[0].withMargin).toBeUndefined();
  });

  it("gère l'absence totale de source (§13 valeurs vides)", () => {
    const model = buildNomenclatureViewModel({});
    expect(model.ok && model.empty).toBe(true);
    expect(model.ok && model.lines).toEqual([]);
  });

  it("refuse deux sources concurrentes", () => {
    const model = buildNomenclatureViewModel({ lines: [], input: { lengthsMm: [] } });
    expect(model.ok).toBe(false);
    expect(!model.ok && model.error).toMatch(/une seule source/);
  });

  it("propage une erreur backend (longueur négative)", () => {
    const model = buildNomenclatureViewModel({ input: { lengthsMm: [{ label: "X", value: -3 }] } });
    expect(model.ok).toBe(false);
  });
});

describe("MarginSelector — adaptateur (§6)", () => {
  it("expose les préréglages 0 / 5 / 10 / 15 % + personnalisée", () => {
    expect(MARGIN_OPTIONS.map((option) => option.label)).toEqual(["0 %", "5 %", "10 %", "15 %", "Personnalisée"]);
  });

  it.each([0, 5, 10, 15] as const)("applique le préréglage %s %% via applyMargin", (percent) => {
    const model = buildMarginViewModel(10000, resolveMarginChoice({ kind: "preset", percent }));
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.breakdown.baseMm).toBe(10000);
    expect(model.breakdown.percent).toBe(percent);
    expect(model.breakdown.marginMm).toBeCloseTo((10000 * percent) / 100, 6);
    expect(model.breakdown.withMarginMm).toBeCloseTo(10000 + (10000 * percent) / 100, 6);
  });

  it("accepte une marge personnalisée dans les bornes", () => {
    const model = buildMarginViewModel(2000, resolveMarginChoice({ kind: "custom", percent: 7.5 }));
    expect(model.ok && model.breakdown.marginMm).toBeCloseTo(150, 6);
    expect(model.ok && model.breakdown.withMarginMm).toBeCloseTo(2150, 6);
  });

  it("normalise un préréglage inconnu vers 0 %", () => {
    expect(resolveMarginChoice({ kind: "preset", percent: 12 })).toEqual({ kind: "preset", percent: 0 });
  });

  it("propage l'erreur pour une marge personnalisée hors bornes", () => {
    expect(buildMarginViewModel(2000, resolveMarginChoice({ kind: "custom", percent: 250 })).ok).toBe(false);
    expect(buildMarginViewModel(2000, resolveMarginChoice({ kind: "custom", percent: -1 })).ok).toBe(false);
  });

  it("ne modifie jamais la quantité de base", () => {
    const base = 4321;
    const model = buildMarginViewModel(base, resolveMarginChoice({ kind: "preset", percent: 15 }));
    expect(model.ok && model.breakdown.baseMm).toBe(base);
  });
});

describe("ProfilePlanCard — adaptateur (§7)", () => {
  it("réutilise planProfiles pour longueur, barres et chute", () => {
    const model = buildProfilePlanViewModel({
      input: { type: "Cornière", totalLengthMm: 5460, barLengthMm: 3000, margin: { kind: "preset", percent: 10 } },
    });
    expect(model.ok).toBe(true);
    if (!model.ok || !model.plan) return;
    expect(model.plan.barCount).toBe(3);
    expect(model.plan.orderedMm).toBe(9000);
    expect(model.plan.margin.withMarginMm).toBeCloseTo(6006, 6);
    expect(model.plan.offcutMm).toBeCloseTo(2994, 6);
  });

  it("accepte un plan déjà calculé", () => {
    const model = buildProfilePlanViewModel({
      input: { totalLengthMm: 3000 },
    });
    expect(model.ok && model.plan?.type).toBe("Profil");
  });

  it("renvoie plan null sans données (§13 valeurs vides)", () => {
    const model = buildProfilePlanViewModel({});
    expect(model.ok && model.plan).toBeNull();
  });

  it("propage l'erreur backend (longueur négative)", () => {
    const model = buildProfilePlanViewModel({ input: { totalLengthMm: -5 } });
    expect(model.ok).toBe(false);
  });
});

describe("LightingSummaryCard — résumé lecture seule (§8)", () => {
  it("compte les appareils par type depuis des fixtures", () => {
    const model = buildLightingSummaryViewModel({
      fixtures: [
        { id: "s1", kind: "spot", position: { x: 0, y: 0 } },
        { id: "s2", kind: "spot", position: { x: 100, y: 0 } },
        { id: "l1", kind: "lustre", position: { x: 50, y: 50 } },
      ],
    });
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.totalFixtures).toBe(3);
    expect(model.fixtures.find((entry) => entry.kind === "spot")?.count).toBe(2);
  });

  it("accepte un comptage direct et un résumé LED fourni", () => {
    const model = buildLightingSummaryViewModel({
      summary: { spot: 6, "led-supply": 1 },
      led: { totalLengthMm: 5040, withMarginMm: 5544, breaks: 0, rollCount: 2 },
    });
    expect(model.ok && model.hasContent).toBe(true);
    expect(model.ok && model.led?.rollCount).toBe(2);
  });

  it("signale l'absence de donnée d'éclairage (§13 valeurs vides)", () => {
    const model = buildLightingSummaryViewModel({});
    expect(model.ok && model.hasContent).toBe(false);
    expect(model.ok && model.fixtures).toEqual([]);
  });

  it("refuse fixtures et summary simultanés", () => {
    const model = buildLightingSummaryViewModel({ fixtures: [], summary: { spot: 1 } });
    expect(model.ok).toBe(false);
  });

  it("propage l'erreur backend (type d'appareil inconnu)", () => {
    const model = buildLightingSummaryViewModel({
      // @ts-expect-error test d'un type invalide propagé par summariseLighting
      fixtures: [{ id: "x", kind: "neon", position: { x: 0, y: 0 } }],
    });
    expect(model.ok).toBe(false);
  });
});
