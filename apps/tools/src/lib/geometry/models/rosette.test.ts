import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createRosetteGeometry } from "./rosette";

// C4-LOT3-ROSETTES-V1 : mêmes invariants qu'en FIRST-FUNCTIONAL-LOT-V1 §18, contrôlés sur la
// sortie désormais produite via Engine B (`createRosette`, mode classique) puis le pont
// `parametricShapeToTraceModel`. Schéma d'identifiants Engine B inchangé pour ce modèle : centre
// "O", centres secondaires "C1..C6", pointes "T1..T6".
describe("createRosetteGeometry — C4-LOT3 (Engine B)", () => {
  it("produit 6 centres secondaires", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const secondary = model.points.filter((p) => /^C\d+$/.test(p.id));
    expect(secondary).toHaveLength(6);
  });

  it("rayon cohérent : chaque centre secondaire à R du centre, chaque cercle secondaire de rayon R", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const O = model.points.find((p) => p.id === "O")!;
    const secondary = model.points.filter((p) => /^C\d+$/.test(p.id));
    for (const item of secondary) expect(distance(O, item)).toBeCloseTo(1200, 8);
    // Mode classique (§2) : les 6 cercles secondaires sont "shape" (tracé final) ; le cercle
    // directeur (matérialisé depuis l'étape Engine B correspondante) est "construction", 7ᵉ
    // entité, masqué par défaut.
    const secondaryCircles = model.circles.filter((c) => c.role !== "construction");
    expect(secondaryCircles).toHaveLength(6);
    for (const circle of secondaryCircles) expect(circle.radius).toBeCloseTo(1200, 8);
    expect(model.circles.some((c) => c.role === "construction" && distance(O, c.centre) < 1e-6 && Math.abs(c.radius - 1200) < 1e-6)).toBe(true);
  });

  it("espacement angulaire 60° entre centres secondaires consécutifs", () => {
    const model = createRosetteGeometry({ diameter: 2400, rotation: 0 });
    const O = model.points.find((p) => p.id === "O")!;
    const secondary = model.points.filter((p) => /^C\d+$/.test(p.id));
    for (let index = 0; index < secondary.length; index++) {
      const current = secondary[index];
      const next = secondary[(index + 1) % secondary.length];
      let delta = ((Math.atan2(next.y - O.y, next.x - O.x) - Math.atan2(current.y - O.y, current.x - O.x)) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(60, 6);
    }
  });

  it("symétrie radiale : les 6 centres sont invariants par rotation de 60°", () => {
    const a = createRosetteGeometry({ diameter: 2400, rotation: 0 });
    const b = createRosetteGeometry({ diameter: 2400, rotation: 60 });
    const centresA = a.points.filter((p) => /^C\d+$/.test(p.id));
    const centresB = b.points.filter((p) => /^C\d+$/.test(p.id));
    for (const pointA of centresA) {
      const closest = Math.min(...centresB.map((pointB) => distance(pointA, pointB)));
      expect(closest).toBeLessThan(1e-6);
    }
  });

  it("invariant propre à la construction : chaque cercle secondaire passe exactement par le centre O", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const O = model.points.find((p) => p.id === "O")!;
    const secondaryCircles = model.circles.filter((c) => c.role !== "construction");
    for (const circle of secondaryCircles) expect(distance(O, circle.centre)).toBeCloseTo(circle.radius, 8);
  });

  it("invariant propre à la construction : la pointe de chaque pétale est à R√3 du centre", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const O = model.points.find((p) => p.id === "O")!;
    const R = model.dimensions.find((d) => d.id === "dim-radius")!.value;
    const tips = model.points.filter((p) => /^T\d+$/.test(p.id));
    expect(tips).toHaveLength(6);
    for (const tip of tips) expect(distance(O, tip)).toBeCloseTo(R * Math.sqrt(3), 6);
  });

  it("encombrement réel exposé et cohérent : Ø ≈ diamètre directeur × √3", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const envelope = model.dimensions.find((d) => d.id === "dim-envelope")!.value;
    expect(envelope).toBeCloseTo(2400 * Math.sqrt(3), 6);
    expect(envelope).toBeGreaterThan(2400); // dépasse bien le diamètre directeur — pas un alias
  });

  it("aucune coordonnée invalide", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("paramètre dynamique : le diamètre recalcule le rayon utilisé partout (directeur = secondaire)", () => {
    const a = createRosetteGeometry({ diameter: 2400 });
    const b = createRosetteGeometry({ diameter: 3000 });
    expect(a.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(1200, 8);
    expect(b.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(1500, 8);
  });

  it("refuse un diamètre invalide", () => {
    expect(() => createRosetteGeometry({ diameter: 0 })).toThrow();
    expect(() => createRosetteGeometry({ diameter: -50 })).toThrow();
    expect(() => createRosetteGeometry({ diameter: Number.NaN })).toThrow();
  });

  it("explication réellement renseignée, formule documentée", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    expect(model.explanation?.principle).toContain("R");
    expect(model.explanation?.steps?.length).toBeGreaterThan(0);
  });

  it("l'explication documente clairement l'écart diamètre directeur / encombrement réel (§6)", () => {
    const model = createRosetteGeometry({ diameter: 2400 });
    const mentionsEnvelope = (model.explanation?.tips ?? []).some((t) => t.includes("1,73")) || (model.explanation?.warnings ?? []).some((w) => w.includes("encombrement"));
    expect(mentionsEnvelope).toBe(true);
  });
});
