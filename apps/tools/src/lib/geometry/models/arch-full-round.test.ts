import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createArchFullRoundGeometry } from "./arch-full-round";

describe("createArchFullRoundGeometry — FUNDAMENTAL-MODELS-V1 §15", () => {
  it("width = 1200 -> radius = 600", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    expect(model.quantities.find((q) => q.id === "q-radius")?.value).toBeCloseTo(600, 8);
  });

  it("sommet à rayon correct : distance O -> S = rayon", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    const O = model.points.find((p) => p.id === "O")!;
    const S = model.points.find((p) => p.id === "S")!;
    const radius = model.quantities.find((q) => q.id === "q-radius")!.value;
    expect(distance(O, S)).toBeCloseTo(radius, 6);
  });

  it("symétrie : A et B équidistants du centre, sommet sur l'axe médian", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    const O = model.points.find((p) => p.id === "O")!;
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    const S = model.points.find((p) => p.id === "S")!;
    expect(distance(O, A)).toBeCloseTo(distance(O, B), 8);
    expect(S.x).toBeCloseTo((A.x + B.x) / 2, 8);
  });

  it("naissance gauche/droite correctement espacée de la largeur", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    const A = model.points.find((p) => p.id === "A")!;
    const B = model.points.find((p) => p.id === "B")!;
    expect(distance(A, B)).toBeCloseTo(1200, 8);
  });

  it("hauteur calculée : pour un plein cintre, la flèche vaut la demi-largeur", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    expect(model.dimensions.find((d) => d.id === "dim-rise")?.value).toBeCloseTo(600, 8);
  });

  it("paramètres dynamiques : une autre largeur recalcule tout", () => {
    const model = createArchFullRoundGeometry({ width: 2000 });
    expect(model.quantities.find((q) => q.id === "q-radius")?.value).toBeCloseTo(1000, 8);
  });

  it("reste interne : slug/statut cohérents avec un usage non publié", () => {
    const model = createArchFullRoundGeometry();
    expect(model.slug).toBe("arch-full-round");
    expect(model.status).toBe("preview");
  });

  it("explication réellement renseignée", () => {
    const model = createArchFullRoundGeometry();
    expect(model.explanation?.objective).toBeTruthy();
    expect(model.explanation?.steps?.length).toBeGreaterThan(0);
  });

  it("refuse une largeur invalide", () => {
    expect(() => createArchFullRoundGeometry({ width: 0 })).toThrow();
    expect(() => createArchFullRoundGeometry({ width: -10 })).toThrow();
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createArchFullRoundGeometry({ width: 1200 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });
});
