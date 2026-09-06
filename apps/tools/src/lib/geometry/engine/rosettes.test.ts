import { describe, expect, it } from "vitest";
import { createRosette } from "./rosettes";

describe("rosaces génériques", () => {
  it("rosace à 6 éléments circulaires", () => {
    const rosette = createRosette({ outerDiameter: 2000, innerDiameter: 400, count: 6, elementType: "circle" });
    // 6 pétales + 1 cercle central.
    expect(rosette.primitives.circles).toHaveLength(7);
    const central = rosette.primitives.circles.find((c) => c.radius === 200);
    expect(central).toBeDefined();
  });

  it("rosace à pétales utilise des arcs", () => {
    const rosette = createRosette({ outerDiameter: 2000, innerDiameter: 400, count: 8, elementType: "petal" });
    expect(rosette.primitives.arcs.length).toBeGreaterThan(0);
    expect(rosette.primitives.circles).toHaveLength(1);
  });

  it("refuse un diamètre intérieur supérieur ou égal à l'extérieur", () => {
    expect(() => createRosette({ outerDiameter: 500, innerDiameter: 500, count: 6 })).toThrow();
  });
});
