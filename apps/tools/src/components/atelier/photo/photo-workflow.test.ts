import { describe, expect, it } from "vitest";
import {
  PICKING_TARGET,
  addPickedPoint,
  confirmBlockers,
  parseRealDistance,
  photoSteps,
  quadOf,
} from "./photo-workflow";
import { importReferenceImage, calibrateReference } from "../../../lib/tracing/api";
import { createRawContour } from "../../../lib/tracing/vectorization";
import { buildTracingProjectFromInput } from "../../../lib/tracing/atelier";

function imported() {
  return importReferenceImage({
    id: "img-1",
    name: "rosace.jpg",
    mimeOrName: "image/jpeg",
    source: "gallery",
    sourceWidthPx: 4032,
    sourceHeightPx: 3024,
    sizeBytes: 2_000_000,
  }).image;
}

function calibrated() {
  return calibrateReference(imported(), {
    pointA: { x: 0, y: 0 },
    pointB: { x: 1000, y: 0 },
    realDistance: 2000,
    realUnit: "mm",
  });
}

const contour = createRawContour({
  id: "c1",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ],
  space: "image-pixels",
  closed: true,
  source: "detected",
});

describe("photoSteps (WORKSHOP-UI-CANONICAL-V2 §6)", () => {
  it("sans image, seul l'import est ouvert et le reste dit pourquoi il ne l'est pas", () => {
    const steps = photoSteps({ image: null, contour: null, confirmed: false });
    expect(steps.map((step) => step.status)).toEqual(["current", "locked", "locked", "locked", "locked"]);
    // Une étape verrouillée qui n'expliquerait rien obligerait à deviner.
    for (const step of steps) expect(step.detail.length).toBeGreaterThan(0);
  });

  it("une image importée mais non calibrée ouvre la calibration, pas le contour", () => {
    const steps = photoSteps({ image: imported(), contour: null, confirmed: false });
    expect(steps[0].status).toBe("done");
    expect(steps[1].status).toBe("current");
    expect(steps[3].status).toBe("locked");
    expect(steps[3].detail).toMatch(/Calibrez d’abord/);
  });

  it("l'échelle calibrée est affichée telle que le canon la publie, jamais recalculée", () => {
    const steps = photoSteps({ image: calibrated(), contour: null, confirmed: false });
    // 2000 mm pour 1000 px → 2 mm/px.
    expect(steps[1].detail).toContain("2 mm par pixel");
    expect(steps[1].detail).toContain("non contrôlée");
    expect(steps[3].status).toBe("current");
  });

  it("un contour détecté reste annoncé comme PROPOSITION", () => {
    const steps = photoSteps({ image: calibrated(), contour, confirmed: false });
    expect(steps[3].detail).toContain("proposition");
    expect(steps[4].status).toBe("current");
  });
});

describe("confirmBlockers (§6/§13)", () => {
  const libre = buildTracingProjectFromInput({ type: "ceiling", name: "Relevé" });

  it("laisse passer un tracé libre calibré avec un contour et aucune réserve bloquante", () => {
    expect(confirmBlockers(libre, calibrated(), contour, [])).toEqual([]);
  });

  it("refuse un projet paramétrique — c'est la règle du canon, annoncée avant le travail", () => {
    const blockers = confirmBlockers({ modelId: "rosette-6" }, calibrated(), contour, []);
    expect(blockers.some((item) => item.includes("modèle paramétrique"))).toBe(true);
  });

  it("refuse sans échelle : un contour en pixels n'a aucune dimension", () => {
    const blockers = confirmBlockers(libre, imported(), contour, []);
    expect(blockers.some((item) => item.includes("Échelle non définie"))).toBe(true);
  });

  it("relaie les réserves de niveau erreur, et seulement celles-là", () => {
    const blockers = confirmBlockers(libre, calibrated(), contour, [
      { code: "contour-automatique", level: "avertissement", title: "Auto", detail: "à vérifier" },
      { code: "forme-non-fiable", level: "erreur", title: "Forme non fiable", detail: "reprendre" },
    ]);
    expect(blockers).toEqual(["Forme non fiable — reprendre"]);
  });
});

describe("saisie des points et des distances", () => {
  it("n'accepte jamais plus de points que le mode n'en attend", () => {
    let points: readonly { x: number; y: number }[] = [];
    for (let index = 0; index < 5; index++) points = addPickedPoint(points, { x: index, y: 0 }, "calibration");
    expect(points).toHaveLength(PICKING_TARGET.calibration);
  });

  it("ignore un clic quand rien n'est demandé", () => {
    const points: readonly { x: number; y: number }[] = [];
    expect(addPickedPoint(points, { x: 1, y: 1 }, "none")).toBe(points);
  });

  it("ne devine pas un coin manquant", () => {
    expect(quadOf([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toBeNull();
    expect(quadOf([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toEqual({
      a: { x: 0, y: 0 },
      b: { x: 1, y: 0 },
      c: { x: 1, y: 1 },
      d: { x: 0, y: 1 },
    });
  });

  it("accepte la virgule décimale et refuse tout ce qui n'est pas une longueur", () => {
    expect(parseRealDistance("1 200,5")).toBeNull();
    expect(parseRealDistance("1200,5")).toBeCloseTo(1200.5, 9);
    expect(parseRealDistance("0")).toBeNull();
    expect(parseRealDistance("-3")).toBeNull();
    expect(parseRealDistance("abc")).toBeNull();
  });
});
