import { describe, expect, it } from "vitest";
import { circleArea, polygonArea } from "./area";

describe("aires", () => {
  it("aire d'un cercle de rayon 10", () => {
    expect(circleArea({ centre: { x: 0, y: 0 }, radius: 10 })).toBeCloseTo(Math.PI * 100, 8);
  });

  it("aire d'un carré 100x100 via la formule du lacet", () => {
    const area = polygonArea({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] });
    expect(area).toBe(10000);
  });

  it("aire indépendante du sens de parcours (valeur absolue)", () => {
    const ccw = polygonArea({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] });
    const cw = polygonArea({ points: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }] });
    expect(ccw).toBe(cw);
    expect(ccw).toBe(5000);
  });
});
