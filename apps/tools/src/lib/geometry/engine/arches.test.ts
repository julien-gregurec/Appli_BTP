import { describe, expect, it } from "vitest";
import { createArch } from "./arches";
import { distance } from "./measure";

describe("arches paramétriques", () => {
  it("plein cintre : rayon = demi-largeur", () => {
    const arch = createArch({ type: "semicircular", width: 1000 });
    expect(arch.primitives.arcs[0].radius).toBeCloseTo(500, 6);
  });

  it("segmentaire : largeur 1600 / flèche 400 → rayon 1000 (cas connu)", () => {
    const arch = createArch({ type: "segmental", width: 1600, rise: 400 });
    expect(arch.primitives.arcs[0].radius).toBeCloseTo(1000, 6);
  });

  it("segmentaire refuse une flèche nulle ou négative", () => {
    expect(() => createArch({ type: "segmental", width: 1000, rise: 0 })).toThrow();
  });

  it("ogive équilatérale : rayon = largeur, flèche = largeur·√3/2", () => {
    const arch = createArch({ type: "lancet", width: 1000, pointedness: "equilateral" });
    expect(arch.primitives.arcs[0].radius).toBeCloseTo(1000, 6);
    const S = arch.primitives.points.S;
    expect(S.y).toBeCloseTo(1000 * (Math.sqrt(3) / 2), 6);
  });

  it("ogive refuse une flèche inférieure à la demi-largeur", () => {
    expect(() => createArch({ type: "lancet", width: 1000, rise: 400 })).toThrow();
  });

  it("arche composée : tangence interne vérifiée entre naissance et clé", () => {
    const arch = createArch({ type: "compound", width: 2000, haunchRadius: 300, crownRadius: 1200 });
    const A = arch.primitives.points.A;
    const B = arch.primitives.points.B;
    const S = arch.primitives.points.S;
    const CH1 = arch.primitives.points.CH1;
    const CH2 = arch.primitives.points.CH2;
    const C = arch.primitives.points.C;
    expect(distance(CH1, A)).toBeCloseTo(300, 6);
    expect(distance(CH2, B)).toBeCloseTo(300, 6);
    expect(distance(C, S)).toBeCloseTo(1200, 6);
    expect(distance(CH1, C)).toBeCloseTo(1200 - 300, 6);
    expect(distance(CH2, C)).toBeCloseTo(1200 - 300, 6);
  });

  it("arche composée impossible : lève une erreur explicite plutôt qu'une géométrie fausse", () => {
    expect(() => createArch({ type: "compound", width: 2000, haunchRadius: 300, crownRadius: 350 })).toThrow();
  });

  it("ENGINE-B-STEP-MEASUREMENTS-V1 §5 : l'ouverture de compas et les grandeurs d'implantation sont publiées comme mesures chantier", () => {
    const arch = createArch({ type: "semicircular", width: 1000, springHeight: 800 });
    const byId = new Map(arch.constructionSteps.map((s) => [s.id, s.measurements]));
    expect(byId.get("step-jambs")).toEqual(["1000.0 mm"]);
    expect(byId.get("step-spring")).toEqual(["800.0 mm"]);
    expect(byId.get("step-radius")).toEqual(["500.0 mm"]);
  });

  it("aucune mesure nulle publiée : ni hauteur de naissance à 0, ni décalage de centre à 0", () => {
    // Plein cintre sans surhaussement : le centre EST sur la ligne de départ (décalage nul) et
    // la naissance est au sol — deux grandeurs qui n'ont rien à reporter au chantier.
    const arch = createArch({ type: "semicircular", width: 1000 });
    expect(arch.constructionSteps.find((s) => s.id === "step-spring")?.measurements).toBeUndefined();
    expect(arch.constructionSteps.find((s) => s.id === "step-centre")?.measurements).toBeUndefined();
    // Segmentaire : le centre est réellement décalé, la mesure existe alors.
    const segmental = createArch({ type: "segmental", width: 1600, rise: 400 });
    expect(segmental.constructionSteps.find((s) => s.id === "step-centre")?.measurements).toEqual(["600.0 mm"]);
  });

  it("ogive : chaque mesure publiée est bien celle de son étape (largeur, écart des centres, rayon)", () => {
    const arch = createArch({ type: "lancet", width: 1000, pointedness: "sharp" });
    const radius = arch.primitives.arcs[0].radius;
    const centreGap = Math.abs(arch.primitives.points.CD.x - arch.primitives.points.CG.x);
    const byId = new Map(arch.constructionSteps.map((s) => [s.id, s.measurements]));
    expect(byId.get("step-baseline")).toEqual(["1000.0 mm"]);
    expect(byId.get("step-centres")).toEqual([`${centreGap.toFixed(1)} mm`]);
    expect(byId.get("step-radius")).toEqual([`${radius.toFixed(1)} mm`]);
    // Aucune mesure sur les étapes de tracé pur, qui ne portent aucune grandeur propre.
    expect(byId.get("step-arc-left")).toBeUndefined();
    expect(byId.get("step-apex")).toBeUndefined();
  });
});
