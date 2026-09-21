/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §12 — tolérance px → monde.
 */

import { describe, expect, it } from "vitest";
import {
  POINTER_TOLERANCE_PX,
  SNAP_TOLERANCE_PX,
  TOUCH_SNAP_TOLERANCE_PX,
  TOUCH_TOLERANCE_PX,
  pointerPrecisionOf,
  selectionTolerancePx,
  snapTolerancePx,
  toleranceWorldFor,
} from "./pointer-targeting";
import { hitTest } from "../geometry/hit-test";
import { point } from "../geometry/primitives";
import type { ViewportState } from "./viewport-math";

const view = (scale: number): ViewportState => ({ scale, centerX: 0, centerY: 0 });

describe("conversion", () => {
  it("applique exactement tolerancePx / scale", () => {
    expect(toleranceWorldFor(12, view(1))).toBeCloseTo(12, 12);
    expect(toleranceWorldFor(12, view(0.1))).toBeCloseTo(120, 12);
    expect(toleranceWorldFor(12, view(4))).toBeCloseTo(3, 12);
  });

  it("rend la tolérance monde inversement proportionnelle au zoom", () => {
    const near = toleranceWorldFor(POINTER_TOLERANCE_PX, view(2));
    const far = toleranceWorldFor(POINTER_TOLERANCE_PX, view(0.5));
    expect(far / near).toBeCloseTo(4, 9);
  });
});

describe("stabilité visuelle (§2)", () => {
  // Un point à 8 px du curseur à l'écran doit être désignable à TOUS les zooms.
  const scene = { points: [point("P", 0, 0)] };

  it("désigne un point situé à 8 px, quel que soit le zoom", () => {
    for (const scale of [0.02, 0.1, 0.5, 1, 3, 12, 24]) {
      const worldOffset = 8 / scale; // 8 px convertis à ce zoom
      const tolerance = toleranceWorldFor(POINTER_TOLERANCE_PX, view(scale));
      expect(hitTest(scene, { x: worldOffset, y: 0 }, tolerance)?.entityId, `zoom ${scale}`).toBe("P");
    }
  });

  it("refuse un point situé à 20 px, quel que soit le zoom", () => {
    for (const scale of [0.02, 0.1, 0.5, 1, 3, 12, 24]) {
      const worldOffset = 20 / scale;
      const tolerance = toleranceWorldFor(POINTER_TOLERANCE_PX, view(scale));
      expect(hitTest(scene, { x: worldOffset, y: 0 }, tolerance), `zoom ${scale}`).toBeNull();
    }
  });

  it("la distance écran de bascule ne dépend pas du zoom", () => {
    const limits = [0.05, 1, 20].map((scale) => {
      const tolerance = toleranceWorldFor(POINTER_TOLERANCE_PX, view(scale));
      return tolerance * scale; // reconverti en pixels
    });
    for (const limit of limits) expect(limit).toBeCloseTo(POINTER_TOLERANCE_PX, 9);
  });
});

describe("pointeur grossier (§8)", () => {
  it("accorde plus de tolérance au doigt qu'à la souris", () => {
    expect(TOUCH_TOLERANCE_PX).toBeGreaterThan(POINTER_TOLERANCE_PX);
    expect(selectionTolerancePx("coarse")).toBe(TOUCH_TOLERANCE_PX);
    expect(selectionTolerancePx("fine")).toBe(POINTER_TOLERANCE_PX);
  });

  it("reste bornée pour que deux entités voisines restent distinguables", () => {
    expect(TOUCH_TOLERANCE_PX).toBeLessThanOrEqual(24);
  });

  it("garde l'accrochage plus serré que la sélection", () => {
    expect(SNAP_TOLERANCE_PX).toBeLessThan(POINTER_TOLERANCE_PX);
    expect(TOUCH_SNAP_TOLERANCE_PX).toBeLessThan(TOUCH_TOLERANCE_PX);
    expect(snapTolerancePx("coarse")).toBe(TOUCH_SNAP_TOLERANCE_PX);
    expect(snapTolerancePx("fine")).toBe(SNAP_TOLERANCE_PX);
  });

  it("classe le type de pointeur — le stylet vise comme une souris", () => {
    expect(pointerPrecisionOf("touch")).toBe("coarse");
    expect(pointerPrecisionOf("mouse")).toBe("fine");
    expect(pointerPrecisionOf("pen")).toBe("fine");
    expect(pointerPrecisionOf(undefined)).toBe("fine");
  });

  it("rend un petit point atteignable au doigt là où la souris échoue de peu", () => {
    const scene = { points: [point("P", 0, 0)] };
    const scale = 1;
    const target = { x: 16, y: 0 }; // 16 px : entre les deux tolérances
    expect(hitTest(scene, target, toleranceWorldFor(selectionTolerancePx("fine"), view(scale)))).toBeNull();
    expect(hitTest(scene, target, toleranceWorldFor(selectionTolerancePx("coarse"), view(scale)))?.entityId).toBe("P");
  });
});
