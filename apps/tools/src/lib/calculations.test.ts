import { describe, expect, it } from "vitest";
import { CalculationError, arcFromChordRise, circle, distribute, distributeAdvanced, distributeByMaximumSpacing, distributeGlazing, estimateGlassWeight, estimatePaint, estimatePanels, insulationResistance, rectangleDiagonal, rightAngle345, rightTriangle, segmentalArch, slopeFromPercent, solveSlope } from "./calculations";

describe("moteur de calcul", () => {
  it("calcule la diagonale 3-4-5 sans arrondi intermédiaire", () => {
    expect(rectangleDiagonal(3, 4)).toBe(5);
    expect(rightTriangle({ a: 3, b: 4 })).toEqual({ a: 3, b: 4, c: 5 });
  });

  it("retrouve un côté manquant", () => {
    expect(rightTriangle({ a: 3, c: 5 }).b).toBe(4);
  });

  it("refuse une géométrie impossible", () => {
    expect(() => rightTriangle({ a: 6, c: 5 })).toThrow(CalculationError);
    expect(() => rectangleDiagonal(0, 4)).toThrow("supérieur à zéro");
  });

  it("convertit une pente de 2 % sur 4 m en 80 mm", () => {
    const result = slopeFromPercent(4_000, 2);
    expect(result.rise).toBe(80);
    expect(result.degrees).toBeCloseTo(1.1457628, 6);
  });

  it("conserve PI pour les cercles", () => {
    const result = circle({ diameter: 2 });
    expect(result.radius).toBe(1);
    expect(result.circumference).toBe(Math.PI * 2);
    expect(result.area).toBe(Math.PI);
  });

  it("répartit régulièrement sept éléments", () => {
    const result = distribute({ total: 8_430, count: 7, elementWidth: 1_000 });
    expect(result.gap).toBeCloseTo(238.3333333333, 8);
    expect(result.positions.at(-1)).toBeCloseTo(7_430, 8);
  });

  it("refuse une répartition qui ne tient pas", () => {
    expect(() => distribute({ total: 1_000, count: 3, elementWidth: 400 })).toThrow("ne tiennent pas");
  });

  it("calcule une arche plein cintre", () => {
    const arch = segmentalArch(1_600, 800);
    expect(arch.radius).toBe(800);
    expect(arch.centreBelowSpring).toBe(0);
    expect(arch.arcLength).toBeCloseTo(Math.PI * 800, 8);
  });

  it("dimensionne un angle droit selon le ratio exact 3:4:5", () => {
    expect(rightAngle345(1_500)).toEqual({ a: 1_500, b: 2_000, c: 2_500 });
    expect(() => rightAngle345(-1)).toThrow(CalculationError);
  });

  it("résout la pente depuis les quatre couples de données", () => {
    expect(solveSlope({ mode: "percent-from-run", run: 4_000, percent: 2 }).rise).toBe(80);
    expect(solveSlope({ mode: "percent-from-rise", run: 4_000, rise: 80 }).percent).toBe(2);
    expect(solveSlope({ mode: "run-from-rise", rise: 80, percent: 2 }).run).toBe(4_000);
    const degrees = solveSlope({ mode: "degrees-from-run", run: 4_000, degrees: 45 });
    expect(degrees.rise).toBeCloseTo(4_000, 8);
    expect(degrees.slopeLength).toBeCloseTo(Math.hypot(4_000, 4_000), 8);
    expect(() => solveSlope({ mode: "run-from-rise", rise: 80, percent: -2 })).toThrow(CalculationError);
  });

  it("calcule un arc mineur et un arc majeur depuis corde et flèche", () => {
    const minor = arcFromChordRise(1_600, 400);
    expect(minor.radius).toBe(1_000);
    expect(minor.angleDegrees).toBeCloseTo(106.2602, 3);
    const major = arcFromChordRise(1_600, 1_200);
    expect(major.radius).toBeCloseTo(866.6667, 3);
    expect(major.angleDegrees).toBeGreaterThan(180);
  });

  it("répartit selon un entraxe maximum sans jamais le dépasser", () => {
    const result = distributeByMaximumSpacing({ total: 4_270, maxSpacing: 600 });
    expect(result.intervals).toBe(8);
    expect(result.elementCount).toBe(9);
    expect(result.actualSpacing).toBeCloseTo(533.75, 8);
    expect(result.actualSpacing).toBeLessThanOrEqual(600);
    expect(result.positions.at(-1)).toBe(4_270);
  });

  it("gère les retraits et exclusions d’extrémités pour les fixations", () => {
    const result = distributeByMaximumSpacing({ total: 2_000, maxSpacing: 600, startRetreat: 100, endRetreat: 100, includeStart: false, includeEnd: false });
    expect(result.intervals).toBe(3);
    expect(result.positions).toEqual([700, 1_300]);
    expect(result.elementCount).toBe(2);
  });

  it("répartit des vitrages et referme le total de contrôle", () => {
    const result = distributeGlazing({ total: 8_430, paneCount: 7, mullionWidth: 50, clearancePerSide: 5, startFrame: 50, endFrame: 50 });
    expect(result.paneWidth).toBeCloseTo(1_137.142857, 6);
    expect(result.controlTotal).toBeCloseTo(8_430, 8);
    expect(result.positions).toHaveLength(7);
  });

  it("estime le poids d’un vitrage composé à 2,5 kg/m²/mm", () => {
    const result = estimateGlassWeight({ widthMm: 1_000, heightMm: 2_000, thicknessesMm: [4, 6, 0] });
    expect(result.area).toBe(2);
    expect(result.totalThickness).toBe(10);
    expect(result.estimatedWeight).toBe(50);
  });

  it("arrondit le quantitatif de plaques à l’entier supérieur", () => {
    const result = estimatePanels({ area: 52, panelWidth: 1.2, panelHeight: 2.5, wastePercent: 10 });
    expect(result.areaWithWaste).toBeCloseTo(57.2, 8);
    expect(result.minimumCount).toBe(20);
  });

  it("déduit les ouvertures et cumule les couches de peinture", () => {
    const result = estimatePaint({ grossArea: 80, openingsArea: 8, yieldPerLitre: 10, coats: 2, marginPercent: 10 });
    expect(result.netArea).toBe(72);
    expect(result.cumulativeArea).toBe(144);
    expect(result.litres).toBeCloseTo(15.84, 8);
  });

  it("convertit les millimètres en mètres avant de calculer R", () => {
    const result = insulationResistance(140, 0.032);
    expect(result.thicknessMetres).toBe(0.14);
    expect(result.resistance).toBeCloseTo(4.375, 8);
  });

  it("calcule ou conserve la largeur d’élément avec marges et séparateurs", () => {
    const solved = distributeAdvanced({ total: 1_000, count: 3, separatorWidth: 20, startGap: 10, endGap: 10 });
    expect(solved.elementWidth).toBeCloseTo(313.333333, 5);
    expect(solved.controlTotal).toBeCloseTo(1_000, 8);
    const known = distributeAdvanced({ total: 1_000, count: 3, elementWidth: 250, separatorWidth: 20, startGap: 10, endGap: 10 });
    expect(known.gap).toBe(115);
    expect(known.controlTotal).toBe(1_000);
  });

  it("refuse les quantitatifs physiquement impossibles", () => {
    expect(() => distributeGlazing({ total: 200, paneCount: 2, mullionWidth: 200, clearancePerSide: 10 })).toThrow(CalculationError);
    expect(() => estimatePaint({ grossArea: 20, openingsArea: 20, yieldPerLitre: 10, coats: 2, marginPercent: 0 })).toThrow(CalculationError);
    expect(() => estimatePanels({ area: 20, panelWidth: 1, panelHeight: 2, wastePercent: 101 })).toThrow(CalculationError);
  });
});
