import { describe, expect, it } from "vitest";
import { distance } from "./measure";
import { createStar } from "./stars";

describe("étoiles", () => {
  it("étoile à 5 branches a 10 sommets alternant les deux rayons", () => {
    const star = createStar({ points: 5, outerRadius: 100, innerRadius: 40 });
    const vertices = star.primitives.polygons[0].points;
    expect(vertices).toHaveLength(10);
    vertices.forEach((v, i) => {
      const expected = i % 2 === 0 ? 100 : 40;
      expect(distance(v, star.centre)).toBeCloseTo(expected, 6);
    });
  });

  it("refuse un rayon intérieur supérieur ou égal au rayon extérieur", () => {
    expect(() => createStar({ points: 5, outerRadius: 100, innerRadius: 100 })).toThrow();
  });

  it("refuse moins de 3 branches", () => {
    expect(() => createStar({ points: 2, outerRadius: 100, innerRadius: 40 })).toThrow();
  });

  it("innerAngleOffsetDegrees absent -> comportement historique inchangé (demi-secteur)", () => {
    const withDefault = createStar({ points: 6, outerRadius: 100, innerRadius: 40, rotationDegrees: 0 });
    const explicitHalfSector = createStar({ points: 6, outerRadius: 100, innerRadius: 40, rotationDegrees: 0, innerAngleOffsetDegrees: 180 / 6 });
    withDefault.primitives.polygons[0].points.forEach((p, i) => {
      const q = explicitHalfSector.primitives.polygons[0].points[i];
      expect(p.x).toBeCloseTo(q.x, 9);
      expect(p.y).toBeCloseTo(q.y, 9);
    });
  });

  it("innerAngleOffsetDegrees (twist) : chaque sommet intérieur est décalé de l'angle demandé par rapport à son sommet extérieur apparié", () => {
    const twist = 25;
    const star = createStar({ points: 6, outerRadius: 100, innerRadius: 40, rotationDegrees: 0, innerAngleOffsetDegrees: twist });
    const vertices = star.primitives.polygons[0].points;
    for (let i = 0; i < vertices.length; i += 2) {
      const outerAngle = Math.atan2(vertices[i].y, vertices[i].x);
      const innerAngle = Math.atan2(vertices[i + 1].y, vertices[i + 1].x);
      let delta = ((innerAngle - outerAngle) * 180) / Math.PI;
      while (delta > 180) delta -= 360;
      while (delta <= -180) delta += 360;
      expect(delta).toBeCloseTo(twist, 6);
    }
  });
});
