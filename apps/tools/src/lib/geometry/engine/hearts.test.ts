import { describe, expect, it } from "vitest";
import { createHeart } from "./hearts";
import { distance } from "./measure";

describe("cœurs constructibles", () => {
  it("les deux lobes ont le rayon attendu (largeur/4) et sont tangents", () => {
    const heart = createHeart({ width: 400, height: 400 });
    expect(heart.primitives.arcs).toHaveLength(2);
    for (const arc of heart.primitives.arcs) expect(arc.radius).toBeCloseTo(100, 6);
    expect(distance(heart.primitives.points.leftLobe, heart.primitives.points.rightLobe)).toBeCloseTo(200, 6);
  });

  it("la pointe est alignée sur l'axe vertical du cœur", () => {
    const heart = createHeart({ width: 400, height: 500, centre: { x: 50, y: 0 } });
    expect(heart.primitives.points.cusp.x).toBeCloseTo(50, 6);
  });

  it("refuse une hauteur trop faible par rapport à la largeur", () => {
    expect(() => createHeart({ width: 1000, height: 100 })).toThrow();
  });

  it("ajoute une ligne de pliure centrale quand demandé", () => {
    const withCrease = createHeart({ width: 400, height: 400, centralCrease: true });
    const without = createHeart({ width: 400, height: 400 });
    expect(withCrease.primitives.segments.length).toBe(without.primitives.segments.length + 1);
  });
});
