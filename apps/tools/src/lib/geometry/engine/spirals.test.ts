import { describe, expect, it } from "vitest";
import { approximateSpiralWithArcs, archimedeanSpiralRadius } from "./spirals";

describe("spirales", () => {
  it("rayon exact de la spirale d'Archimède après un tour complet", () => {
    const radius = archimedeanSpiralRadius({ startRadius: 100, growthPerTurn: 50, turns: 1 }, 2 * Math.PI);
    expect(radius).toBeCloseTo(150, 8);
  });

  it("version chantier : distingue explicitement une qualité approximée avec erreur mesurée", () => {
    const shape = approximateSpiralWithArcs({ startRadius: 100, growthPerTurn: 50, turns: 2, maxErrorMm: 2 });
    expect(shape.quality).toBe("approximated");
    expect(shape.errorTolerance).toBeLessThanOrEqual(2);
    expect(shape.primitives.arcs.length).toBeGreaterThan(0);
  });
});
