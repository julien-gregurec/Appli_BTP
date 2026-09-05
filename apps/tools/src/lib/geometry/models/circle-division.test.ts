import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createCircleDivisionDemo } from "./circle-division";

describe("createCircleDivisionDemo — invariants (ENGINE-FOUNDATION-V1 §16)", () => {
  it("diamètre=2000 mm / divisions=6 -> rayon=1000 mm, 6 points, 60° entre chaque point", () => {
    const model = createCircleDivisionDemo({ diameter: 2000, divisions: 6 });
    const [centre, ...dividedPoints] = model.points;
    expect(dividedPoints).toHaveLength(6);

    // même distance centre -> chaque point
    for (const item of dividedPoints) expect(distance(centre, item)).toBeCloseTo(1000, 8);

    // 60° entre points consécutifs, ordre stable
    for (let index = 0; index < dividedPoints.length; index++) {
      const current = dividedPoints[index];
      const next = dividedPoints[(index + 1) % dividedPoints.length];
      const angleCurrent = Math.atan2(current.y - centre.y, current.x - centre.x);
      const angleNext = Math.atan2(next.y - centre.y, next.x - centre.x);
      let delta = ((angleNext - angleCurrent) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(60, 6);
    }

    // fermeture géométrique : le premier et le dernier point encadrent bien un tour complet
    const ids = dividedPoints.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    // aucune valeur NaN ni Infinity dans le modèle entier
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);

    expect(model.quantities.find((q) => q.id === "q-sector")?.value).toBeCloseTo(60, 8);
  });

  it("ordre stable d'un appel à l'autre pour les mêmes paramètres", () => {
    const first = createCircleDivisionDemo({ diameter: 2000, divisions: 6 });
    const second = createCircleDivisionDemo({ diameter: 2000, divisions: 6 });
    expect(first.points.map((p) => ({ id: p.id, x: p.x, y: p.y }))).toEqual(second.points.map((p) => ({ id: p.id, x: p.x, y: p.y })));
  });

  it("reste techniquement interne : slug/statut cohérents avec un usage non publié", () => {
    const model = createCircleDivisionDemo();
    expect(model.slug).toBe("demo-circle-division");
    expect(model.status).toBe("preview");
  });

  it("refuse un nombre de divisions invalide", () => {
    expect(() => createCircleDivisionDemo({ diameter: 2000, divisions: 0 })).toThrow();
    expect(() => createCircleDivisionDemo({ diameter: 2000, divisions: 2.5 })).toThrow();
  });

  it("refuse un diamètre invalide", () => {
    expect(() => createCircleDivisionDemo({ diameter: 0, divisions: 6 })).toThrow();
    expect(() => createCircleDivisionDemo({ diameter: -100, divisions: 6 })).toThrow();
  });

  it("fonctionne avec une seule division (cas limite)", () => {
    const model = createCircleDivisionDemo({ diameter: 2000, divisions: 1 });
    expect(model.points).toHaveLength(2);
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });
});
