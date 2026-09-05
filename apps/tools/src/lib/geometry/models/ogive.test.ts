import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createOgiveGeometry } from "./ogive";

describe("createOgiveGeometry — FUNDAMENTAL-MODELS-V1 §16", () => {
  it("centres corrects : chaque centre est le point de naissance opposé", () => {
    const model = createOgiveGeometry({ width: 1200 });
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const arcA = model.arcs.find((a) => a.id === "arc-from-a")!;
    const arcB = model.arcs.find((a) => a.id === "arc-from-b")!;
    expect(arcA.centre).toMatchObject({ x: A.x, y: A.y });
    expect(arcB.centre).toMatchObject({ x: B.x, y: B.y });
  });

  it("sommet commun aux deux arcs (dans la tolérance flottante)", () => {
    const model = createOgiveGeometry({ width: 1200 });
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const S = model.points.find((p) => p.id === "S")!;
    // S doit être exactement au rayon de chacun des deux cercles.
    expect(distance(A, S)).toBeCloseTo(1200, 6);
    expect(distance(B, S)).toBeCloseTo(1200, 6);
  });

  it("rayons cohérents : rayon = largeur, identique pour les deux arcs", () => {
    const model = createOgiveGeometry({ width: 1200 });
    expect(model.arcs.every((a) => a.radius === 1200)).toBe(true);
    expect(model.quantities.find((q) => q.id === "q-radius")?.value).toBeCloseTo(1200, 8);
  });

  it("symétrie : le sommet est sur l'axe médian de A-B", () => {
    const model = createOgiveGeometry({ width: 1200 });
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const S = model.points.find((p) => p.id === "S")!;
    expect(S.x).toBeCloseTo((A.x + B.x) / 2, 6);
  });

  it("intersection valide : la hauteur suit la formule de l'équilatéral W√3/2", () => {
    const model = createOgiveGeometry({ width: 1200 });
    const height = model.quantities.find((q) => q.id === "q-height")!.value;
    expect(height).toBeCloseTo(1200 * (Math.sqrt(3) / 2), 6);
  });

  it("recalcul avec une autre largeur", () => {
    const model = createOgiveGeometry({ width: 2000 });
    expect(model.quantities.find((q) => q.id === "q-radius")?.value).toBeCloseTo(2000, 8);
    expect(model.quantities.find((q) => q.id === "q-height")?.value).toBeCloseTo(2000 * (Math.sqrt(3) / 2), 6);
  });

  it("nommé clairement comme une variante précise, pas une famille générale", () => {
    const model = createOgiveGeometry();
    expect(model.name).toBe("Ogive simple à deux centres");
    expect(model.slug).toBe("ogive-equilateral");
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createOgiveGeometry({ width: 1200 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("refuse une largeur invalide", () => {
    expect(() => createOgiveGeometry({ width: 0 })).toThrow();
    expect(() => createOgiveGeometry({ width: -100 })).toThrow();
    expect(() => createOgiveGeometry({ width: Number.NaN })).toThrow();
  });
});
