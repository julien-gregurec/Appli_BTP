import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createCircleDivisionGeometry } from "./circle-division";

// C4-LOT1-V1 : mêmes invariants qu'en FIRST-FUNCTIONAL-LOT-V1 §16, contrôlés sur la sortie
// produite via Engine B (`createCircleDivision`) puis le pont `parametricShapeToTraceModel`.
// Schéma d'identifiants Engine B inchangé pour ce modèle : centre "O", points "P1..PN".
describe("createCircleDivisionGeometry — C4-LOT1 (Engine B)", () => {
  it("diamètre 2000 mm / 6 divisions -> rayon 1000 mm, 6 points, 60° entre chaque point consécutif", () => {
    const model = createCircleDivisionGeometry({ diameter: 2000, divisions: 6 });
    const [centre, ...dividedPoints] = model.points;
    expect(dividedPoints).toHaveLength(6);
    for (const item of dividedPoints) expect(distance(centre, item)).toBeCloseTo(1000, 8);

    for (let index = 0; index < dividedPoints.length; index++) {
      const current = dividedPoints[index];
      const next = dividedPoints[(index + 1) % dividedPoints.length];
      const angleCurrent = Math.atan2(current.y - centre.y, current.x - centre.x);
      const angleNext = Math.atan2(next.y - centre.y, next.x - centre.x);
      let delta = ((angleNext - angleCurrent) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(60, 6);
    }

    const ids = dividedPoints.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
    expect(model.dimensions.find((d) => d.id === "dim-sector")?.value).toBeCloseTo(60, 6);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(1000, 8);
    expect(model.dimensions.find((d) => d.id === "dim-diameter")?.value).toBeCloseTo(2000, 8);
  });

  it("diamètre 2400 mm / 8 divisions -> rayon 1200 mm, angle 45°", () => {
    const model = createCircleDivisionGeometry({ diameter: 2400, divisions: 8 });
    const [centre, ...dividedPoints] = model.points;
    expect(dividedPoints).toHaveLength(8);
    for (const item of dividedPoints) expect(distance(centre, item)).toBeCloseTo(1200, 8);
    expect(model.dimensions.find((d) => d.id === "dim-sector")?.value).toBeCloseTo(45, 6);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(1200, 8);
  });

  it.each([3, 4, 5, 6, 8, 10, 12])("fonctionne pour %i divisions", (divisions) => {
    const model = createCircleDivisionGeometry({ diameter: 2000, divisions });
    expect(model.points).toHaveLength(divisions + 1);
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
    expect(model.dimensions.find((d) => d.id === "dim-sector")?.value).toBeCloseTo(360 / divisions, 4);
  });

  it("le cercle directeur reste géométriquement un cercle : aucun segment de contour, aucun polygone", () => {
    const model = createCircleDivisionGeometry({ diameter: 2000, divisions: 8 });
    expect(model.segments).toHaveLength(0);
    expect(model.polygons ?? []).toHaveLength(0);
    expect(model.circles).toHaveLength(1);
    expect(model.circles[0].role).not.toBe("construction");
  });

  it("ordre stable d'un appel à l'autre pour les mêmes paramètres", () => {
    const first = createCircleDivisionGeometry({ diameter: 2000, divisions: 6 });
    const second = createCircleDivisionGeometry({ diameter: 2000, divisions: 6 });
    expect(first.points.map((p) => ({ id: p.id, x: p.x, y: p.y }))).toEqual(second.points.map((p) => ({ id: p.id, x: p.x, y: p.y })));
  });

  it("paramètre dynamique : changer le diamètre recalcule le rayon, rien n'est figé en dur", () => {
    expect(createCircleDivisionGeometry({ diameter: 2400, divisions: 6 }).dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(1200, 8);
    expect(createCircleDivisionGeometry({ diameter: 3000, divisions: 6 }).dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(1500, 8);
  });

  it("startAngle décale les points sans changer le rayon ni l'angle de secteur", () => {
    const rotated = createCircleDivisionGeometry({ diameter: 2000, divisions: 6, startAngle: 30 });
    const [centre, first] = rotated.points;
    const angle = (Math.atan2(first.y - centre.y, first.x - centre.x) * 180) / Math.PI;
    expect(angle).toBeCloseTo(30, 6);
    expect(rotated.dimensions.find((d) => d.id === "dim-sector")?.value).toBeCloseTo(60, 6);
  });

  it("explication réellement renseignée (pas de structure vide)", () => {
    const model = createCircleDivisionGeometry();
    expect(model.explanation?.objective).toBeTruthy();
    expect(model.explanation?.steps?.length).toBeGreaterThan(0);
    expect(model.explanation?.finalCheck).toBeTruthy();
  });

  it("fonctionne avec une seule division (cas limite)", () => {
    const model = createCircleDivisionGeometry({ diameter: 2000, divisions: 1 });
    expect(model.points).toHaveLength(2);
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
    expect(model.dimensions.find((d) => d.id === "dim-sector")).toBeUndefined();
  });

  it("refuse un diamètre invalide", () => {
    expect(() => createCircleDivisionGeometry({ diameter: 0, divisions: 6 })).toThrow();
    expect(() => createCircleDivisionGeometry({ diameter: -100, divisions: 6 })).toThrow();
    expect(() => createCircleDivisionGeometry({ diameter: Number.NaN, divisions: 6 })).toThrow();
  });

  it("refuse un nombre de divisions invalide", () => {
    expect(() => createCircleDivisionGeometry({ diameter: 2000, divisions: 0 })).toThrow();
    expect(() => createCircleDivisionGeometry({ diameter: 2000, divisions: 2.5 })).toThrow();
    expect(() => createCircleDivisionGeometry({ diameter: 2000, divisions: 25 })).toThrow();
  });

  it("refuse un angle de départ non fini", () => {
    expect(() => createCircleDivisionGeometry({ diameter: 2000, divisions: 6, startAngle: Number.NaN })).toThrow();
    expect(() => createCircleDivisionGeometry({ diameter: 2000, divisions: 6, startAngle: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("reste interne : slug/statut cohérents avec un usage non publié", () => {
    const model = createCircleDivisionGeometry();
    expect(model.slug).toBe("circle-division");
    expect(model.status).toBe("preview");
  });
});
