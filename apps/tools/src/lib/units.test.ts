import { describe, expect, it } from "vitest";
import { convertArea, convertLength, convertVolume, degreesToPercent, percentToDegrees } from "./units";

describe("système d’unités centralisé", () => {
  it("convertit les longueurs", () => {
    expect(convertLength(1, "m", "mm")).toBe(1_000);
    expect(convertLength(1, "in", "mm")).toBe(25.4);
  });

  it("convertit les surfaces sans facteur linéaire erroné", () => {
    expect(convertArea(1, "m²", "cm²")).toBe(10_000);
  });

  it("convertit litres et mètres cubes", () => {
    expect(convertVolume(1, "m³", "L")).toBe(1_000);
  });

  it("convertit pente et degrés dans les deux sens", () => {
    const angle = percentToDegrees(2);
    expect(degreesToPercent(angle)).toBeCloseTo(2, 12);
  });
});
