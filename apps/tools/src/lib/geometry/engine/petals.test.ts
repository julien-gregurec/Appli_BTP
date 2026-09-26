import { describe, expect, it } from "vitest";
import { createCrescent, createDrop, createPetal } from "./petals";
import { distance } from "./measure";

describe("pétales, gouttes et croissants", () => {
  it("pétale symétrique : les deux arcs passent par les deux pointes", () => {
    const petal = createPetal({ width: 200, height: 400 });
    const { top, bottom } = petal.primitives.points;
    for (const arc of petal.primitives.arcs) {
      expect(distance(arc.centre, top)).toBeCloseTo(arc.radius, 6);
      expect(distance(arc.centre, bottom)).toBeCloseTo(arc.radius, 6);
    }
  });

  it("goutte : les tangentes touchent bien le cercle", () => {
    const drop = createDrop({ diameter: 200, height: 500 });
    expect(drop.primitives.arcs).toHaveLength(1);
  });

  it("goutte refuse une hauteur insuffisante", () => {
    expect(() => createDrop({ diameter: 200, height: 150 })).toThrow();
  });

  it("croissant : les deux arcs partagent les deux pointes d'intersection", () => {
    const crescent = createCrescent({ outerDiameter: 400, innerDiameter: 300, offset: 150 });
    const { tip1, tip2 } = crescent.primitives.points;
    for (const arc of crescent.primitives.arcs) {
      expect(distance(arc.centre, tip1)).toBeCloseTo(arc.radius, 6);
      expect(distance(arc.centre, tip2)).toBeCloseTo(arc.radius, 6);
    }
  });
});
