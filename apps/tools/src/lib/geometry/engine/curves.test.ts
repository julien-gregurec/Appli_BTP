import { describe, expect, it } from "vitest";
import { createDoubleSCurve, createFigureEight, createLinkedCircles, createSCurve } from "./curves";
import { distance } from "./measure";

describe("courbes en S, en 8 et cercles reliés", () => {
  it("S simple : deux arcs de flèches opposées", () => {
    const s = createSCurve({ width: 100, height: 400 });
    expect(s.primitives.arcs).toHaveLength(2);
  });

  it("double S : quatre arcs", () => {
    const s = createDoubleSCurve({ width: 100, height: 400 });
    expect(s.primitives.arcs).toHaveLength(4);
  });

  it("forme en 8 : deux cercles tangents au centre déclaré", () => {
    const eight = createFigureEight({ loopDiameter: 200 });
    const [c1, c2] = eight.primitives.circles;
    expect(distance(c1.centre, c2.centre)).toBeCloseTo(c1.radius + c2.radius, 6);
  });

  it("cercles reliés : les tangentes touchent bien les deux cercles", () => {
    const linked = createLinkedCircles({ diameter1: 200, diameter2: 100, centreDistance: 400 });
    const [c1, c2] = linked.primitives.circles;
    for (const segment of linked.primitives.segments) {
      expect(distance(segment.start, c1.centre)).toBeCloseTo(c1.radius, 4);
      expect(distance(segment.end, c2.centre)).toBeCloseTo(c2.radius, 4);
    }
  });
});
