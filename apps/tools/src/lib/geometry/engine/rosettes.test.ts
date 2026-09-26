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

  it("ENGINE-B-STEP-MEASUREMENTS-V1 §5 : chaque étape mesurable publie la grandeur déjà calculée par le générateur", () => {
    const shape = createRosette({ outerDiameter: 800, count: 8, elementType: "circle", rotationDegrees: 0, centralCircleRatio: 0.25 });
    const byId = new Map(shape.constructionSteps.map((s) => [s.id, s.measurements]));
    expect(byId.get("step-centre")).toBeUndefined(); // aucune grandeur à reporter
    expect(byId.get("step-director-circle")).toEqual(["400.0 mm"]);
    expect(byId.get("step-divide")).toEqual(["45.00°"]);
    expect(byId.get("step-elements")).toEqual(["400.0 mm"]);
    expect(byId.get("step-centre-circle")).toEqual(["100.0 mm"]); // 400 × 0,25
  });

  it("mode anneau : la mesure du cercle central est le rayon intérieur réellement utilisé", () => {
    const shape = createRosette({ outerDiameter: 1000, innerDiameter: 400, count: 6, elementType: "circle" });
    const step = shape.constructionSteps.find((s) => s.id === "step-centre-circle")!;
    expect(step.measurements).toEqual(["200.0 mm"]);
  });

  it("mode pétale : la mesure de l'étape des éléments décrit la largeur et la hauteur du pétale", () => {
    const shape = createRosette({ outerDiameter: 1000, innerDiameter: 400, count: 6, elementType: "petal", elementWidth: 120 });
    const step = shape.constructionSteps.find((s) => s.id === "step-elements")!;
    expect(step.measurements).toEqual(["120.0 mm", "300.0 mm"]);
  });

  it("pointes calculées : l'étape de contrôle publie l'encombrement pointe à pointe", () => {
    const shape = createRosette({ outerDiameter: 600, count: 6, elementType: "circle", computeTips: true });
    const withTips = shape.constructionSteps.find((s) => s.id === "step-check")!;
    expect(withTips.measurements).toHaveLength(1);
    const withoutTips = createRosette({ outerDiameter: 600, count: 6, elementType: "circle" }).constructionSteps.find((s) => s.id === "step-check")!;
    expect(withoutTips.measurements).toBeUndefined();
  });
});
