import { describe, expect, it } from "vitest";
import { createRosette } from "./rosettes";

describe("rosaces génériques", () => {
  it("rosace à 6 éléments circulaires", () => {
    const rosette = createRosette({ outerDiameter: 2000, innerDiameter: 400, count: 6, elementType: "circle" });
    // 6 pétales + 1 cercle central.
    expect(rosette.primitives.circles).toHaveLength(7);
    const central = rosette.primitives.circles.find((c) => c.radius === 200);
    expect(central).toBeDefined();
  });

  it("rosace à pétales utilise des arcs", () => {
    const rosette = createRosette({ outerDiameter: 2000, innerDiameter: 400, count: 8, elementType: "petal" });
    expect(rosette.primitives.arcs.length).toBeGreaterThan(0);
    expect(rosette.primitives.circles).toHaveLength(1);
  });

  it("refuse un diamètre intérieur supérieur ou égal à l'extérieur", () => {
    expect(() => createRosette({ outerDiameter: 500, innerDiameter: 500, count: 6 })).toThrow();
  });

  it("C4-LOT3-V1 §2 : sans diamètre intérieur, construction classique — chaque cercle passe exactement par O", () => {
    const rosette = createRosette({ outerDiameter: 2400, count: 6, elementType: "circle", rotationDegrees: 0 });
    // Pas de cercle central (aucun diamètre intérieur fourni) : uniquement les 6 éléments.
    expect(rosette.primitives.circles).toHaveLength(6);
    for (const circle of rosette.primitives.circles) {
      const distanceToOrigin = Math.hypot(circle.centre.x, circle.centre.y);
      expect(distanceToOrigin).toBeCloseTo(circle.radius, 9); // passe exactement par O
      expect(circle.radius).toBeCloseTo(1200, 9); // = outerDiameter / 2, sans division supplémentaire
    }
  });

  it("C4-LOT3-V1 §2 : les centres secondaires sont nommés C1..CN et exposés dans primitives.points", () => {
    const rosette = createRosette({ outerDiameter: 2400, count: 6, elementType: "circle", rotationDegrees: 0 });
    for (let i = 1; i <= 6; i++) expect(rosette.primitives.points[`C${i}`]).toBeDefined();
    expect(Math.hypot(rosette.primitives.points.C1.x, rosette.primitives.points.C1.y)).toBeCloseTo(1200, 9);
  });

  it("C4-LOT3-V1 §6 : pointes nommées T1..TN à R√3 de O (encombrement réel), exposées via metadata.tipDistance, sur demande explicite (computeTips)", () => {
    const rosette = createRosette({ outerDiameter: 2400, count: 6, elementType: "circle", rotationDegrees: 0, computeTips: true });
    for (let i = 1; i <= 6; i++) {
      const tip = rosette.primitives.points[`T${i}`];
      expect(tip).toBeDefined();
      expect(Math.hypot(tip.x, tip.y)).toBeCloseTo(1200 * Math.sqrt(3), 6);
    }
    expect(rosette.metadata.tipDistance).toBeCloseTo(1200 * Math.sqrt(3), 6);
  });

  it("les pointes ne sont pas calculées quand un diamètre intérieur est fourni (mode anneau)", () => {
    const rosette = createRosette({ outerDiameter: 2400, innerDiameter: 400, count: 6, elementType: "circle", computeTips: true });
    expect(rosette.primitives.points.T1).toBeUndefined();
    expect(rosette.metadata.tipDistance).toBeUndefined();
  });

  it("computeTips par défaut (absent) : aucune pointe calculée, même en mode classique — évite d'ajouter des points non demandés (ex. fleurs à petits pétales inscrits)", () => {
    const rosette = createRosette({ outerDiameter: 1200, count: 4, elementType: "circle" });
    expect(rosette.primitives.points.T1).toBeUndefined();
    expect(rosette.metadata.tipDistance).toBeUndefined();
  });

  it("C5-CLEANUP-V1 §2 : centralCircleRatio produit le cercle central ET son étape dédiée, avant l'étape de contrôle", () => {
    const rosette = createRosette({ outerDiameter: 1200, count: 4, elementType: "circle", rotationDegrees: 0, centralCircleRatio: 0.35 });
    expect(rosette.metadata.centralCircleRadius).toBeCloseTo(600 * 0.35, 9);
    const central = rosette.primitives.circles.filter((c) => Math.abs(c.radius - 210) < 1e-9);
    expect(central).toHaveLength(1);
    expect(central[0].centre).toEqual({ x: 0, y: 0 });
    expect(central[0].role).toBe("shape");
    const ids = rosette.constructionSteps.map((step) => step.id);
    expect(ids).toEqual(["step-centre", "step-director-circle", "step-divide", "step-elements", "step-centre-circle", "step-check"]);
    const step = rosette.constructionSteps.find((item) => item.id === "step-centre-circle")!;
    expect(step.instruction).toContain("210.0 mm");
    expect(step.geometry).toContainEqual({ kind: "circle", circle: { centre: { x: 0, y: 0 }, radius: 210 } });
  });

  it("C5-CLEANUP-V1 §2 : sans centralCircleRatio, ni cercle central ni étape (comportement historique inchangé)", () => {
    const rosette = createRosette({ outerDiameter: 1200, count: 4, elementType: "circle", rotationDegrees: 0 });
    expect(rosette.metadata.centralCircleRadius).toBeUndefined();
    expect(rosette.primitives.circles).toHaveLength(4);
    expect(rosette.constructionSteps.map((step) => step.id)).not.toContain("step-centre-circle");
  });

  it("C5-CLEANUP-V1 §2 : centralCircleRatio refusé en mode anneau (le diamètre intérieur EST déjà le cercle central) et hors ]0;1[", () => {
    expect(() => createRosette({ outerDiameter: 2400, innerDiameter: 800, count: 6, centralCircleRatio: 0.35 })).toThrow(/diamètre intérieur/);
    for (const ratio of [0, 1, 1.5, -0.2, Number.NaN]) {
      expect(() => createRosette({ outerDiameter: 1200, count: 4, centralCircleRatio: ratio })).toThrow(/entre 0 et 1/);
    }
  });
});
