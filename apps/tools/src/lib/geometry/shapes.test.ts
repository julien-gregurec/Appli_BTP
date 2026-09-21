import { describe, expect, it } from "vitest";
import { createAdvancedArch, createArchedNiche, createRoomEllipse, createRadialMotif, createRing, createRoomCircle, positionInRoom } from "./shapes";
import { createArcPath, createPlanTransform } from "./plan-model";

describe("formes Pro reproductibles", () => {
  it("construit plein cintre, segmentaire, rayon et hauteur totale", () => {
    const semicircle = createAdvancedArch({ mode: "semicircle", width: 1600 });
    expect(semicircle.quantities.find((q) => q.id === "q-radius")?.value).toBe(800);
    const segment = createAdvancedArch({ mode: "segmental", width: 1600, rise: 400 });
    expect(segment.quantities.find((q) => q.id === "q-radius")?.value).toBe(1000);
    const radius = createAdvancedArch({ mode: "radius", width: 1600, radius: 1000 });
    expect(radius.points.find((p) => p.id === "S")?.y).toBeCloseTo(400, 8);
    const total = createAdvancedArch({ mode: "total-spring", width: 1600, totalHeight: 2400, springHeight: 1800 });
    expect(total.points.find((p) => p.id === "S")?.y).toBe(2400);
    expect(segment.controls.find((control) => control.id === "control-radius-a")?.value).toBeCloseTo(1000, 8);
  });

  it("refuse les arches et épaisseurs impossibles", () => {
    expect(() => createAdvancedArch({ mode: "radius", width: 2000, radius: 900 })).toThrow(/demi-largeur/);
    expect(() => createAdvancedArch({ mode: "segmental", width: 1600, rise: 400, thickness: 1000 })).toThrow(/supprime/);
    expect(() => createAdvancedArch({ mode: "total-spring", width: 1600, totalHeight: 1800, springHeight: 1900 })).toThrow(/sous/);
  });

  it("positionne un cercle et refuse tout dépassement de pièce", () => {
    const circle = createRoomCircle({ roomLength: 5000, roomWidth: 4000, diameter: 2400, mode: "centred" });
    expect(circle.points.find((p) => p.id === "O")).toMatchObject({ x: 2500, y: 2000 });
    expect(circle.controls.map((item) => item.value)).toEqual([2500, 2500, 2000, 2000]);
    expect(() => positionInRoom({ roomLength: 2000, roomWidth: 2000, shapeWidth: 2400, shapeHeight: 1000, mode: "centred" })).toThrow(/dépasse/);
  });

  it("calcule les foyers d’une ellipse et respecte les symétries", () => {
    const ellipse = createRoomEllipse({ roomLength: 5000, roomWidth: 4000, width: 3000, height: 1800, mode: "centred" });
    const centre = ellipse.points.find((p) => p.id === "O")!; const f1 = ellipse.points.find((p) => p.id === "F1")!; const f2 = ellipse.points.find((p) => p.id === "F2")!;
    expect(f1.x + f2.x).toBeCloseTo(centre.x * 2, 8);
    expect(f1.y).toBe(centre.y); expect(f2.y).toBe(centre.y);
    expect(ellipse.controls.find((c) => c.id === "control-string")?.value).toBe(3000);
    expect(() => createRoomEllipse({ roomLength: 5000, roomWidth: 4000, width: 0, height: 1800, mode: "centred" })).toThrow(/supérieur/);
    expect(() => createRoomEllipse({ roomLength: 5000, roomWidth: 4000, width: 1800, height: 3000, mode: "centred" })).toThrow(/grand axe/);
  });

  it("distingue la face et la coupe exacte d’une niche cintrée", () => {
    const niche = createArchedNiche({ mode: "total-spring", width: 1200, totalHeight: 2000, springHeight: 1500, depth: 350 });
    expect(niche.segments.map((item) => item.id)).toEqual(expect.arrayContaining(["cut-bottom", "cut-end", "cut-top", "cut-face"]));
    expect(niche.dimensions.find((item) => item.id === "dim-depth")?.value).toBe(350);
    expect(niche.controls.find((item) => item.id === "control-depth")?.pointIds).toEqual(["Z0", "Z1"]);
    expect(niche.quantities.find((item) => item.id === "q-interior")?.quality).toBe("estimate");
  });

  it.each([4, 5, 6, 8] as const)("génère un moteur radial à %i secteurs", (sectors) => {
    const pattern = createRadialMotif({ diameter: 2400, centralDiameter: 500, sectors, rotationDegrees: 17 });
    expect(pattern.circles.filter((circle) => circle.id.startsWith("petal-"))).toHaveLength(sectors);
    expect(pattern.quantities.find((q) => q.id === "q-sector")?.value).toBeCloseTo(360 / sectors, 10);
    expect((pattern.quantities.find((q) => q.id === "q-sector")?.value ?? 0) * sectors).toBeCloseTo(360, 10);
    expect(pattern.points.find((p) => p.id === "P1")?.x).toBeCloseTo(1200 * Math.cos(17 * Math.PI / 180), 8);
  });

  it("produit un plan exportable sans ids dupliqués ni valeurs non finies", () => {
    const model = createRing(2400, undefined, 250); const ids = [...model.points, ...model.circles, ...model.dimensions, ...model.steps].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length); expect(JSON.stringify(model)).not.toMatch(/NaN|Infinity/);
    expect(model.dimensions.length).toBeGreaterThan(0); expect(model.bounds.maxX).toBeGreaterThan(model.bounds.minX);
    const transform = createPlanTransform(model); const left = transform.point({ x: model.bounds.minX, y: 0 }); const right = transform.point({ x: model.bounds.maxX, y: 0 });
    expect(left.x).toBeLessThan(right.x); expect(transform.point({ x: 0, y: 100 }).y).toBeLessThan(transform.point({ x: 0, y: 0 }).y);
  });

  it("projette une arche vers le haut après inversion de l’axe écran", () => {
    const model = createAdvancedArch({ mode: "segmental", width: 1600, rise: 500 });
    const path = createArcPath(model.arcs[0], createPlanTransform(model));
    expect(path).toMatch(/ A .* 0 0 1 /);
  });

  it("dérive les instructions des dimensions réellement calculées", () => {
    const small = createAdvancedArch({ mode: "segmental", width: 1600, rise: 400 }); const large = createAdvancedArch({ mode: "segmental", width: 2400, rise: 600 });
    expect(JSON.stringify(small.steps)).toContain("1 000 mm"); expect(JSON.stringify(large.steps)).toContain("1 500 mm");
    expect(JSON.stringify(small.steps)).not.toBe(JSON.stringify(large.steps));
    for (const step of small.steps) for (const id of step.pointIds) expect(small.points.some((point) => point.id === id)).toBe(true);
  });
});
