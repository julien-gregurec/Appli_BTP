import { describe, expect, it } from "vitest";
import {
  buildGridModel,
  chooseGridStep,
  formatGridStep,
  GRID_STEPS_MM,
  majorGridInterval,
  MAX_GRID_LINES,
  MIN_GRID_SPACING_PX,
} from "./grid";
import { fitToBounds, type ViewportSize, type ViewportState } from "./viewport-math";

const SIZE: ViewportSize = { width: 800, height: 600 };

describe("chooseGridStep", () => {
  it("retient le pas fin quand le zoom est fort", () => {
    expect(chooseGridStep(4)).toBe(10);
  });

  it("élargit le pas au fur et à mesure du dézoom", () => {
    expect(chooseGridStep(1.2)).toBe(10);
    expect(chooseGridStep(0.5)).toBe(50);
    expect(chooseGridStep(0.15)).toBe(100);
    expect(chooseGridStep(0.05)).toBe(500);
    expect(chooseGridStep(0.005)).toBe(5000);
  });

  it("ne descend jamais sous l'espacement lisible", () => {
    for (const scale of [0.004, 0.02, 0.3, 1, 7, 24]) {
      const step = chooseGridStep(scale);
      const isLargest = step === GRID_STEPS_MM[GRID_STEPS_MM.length - 1];
      expect(isLargest || step * scale >= MIN_GRID_SPACING_PX).toBe(true);
    }
  });

  it("est monotone : dézoomer ne réduit jamais le pas", () => {
    let previous = 0;
    for (const scale of [24, 12, 6, 3, 1, 0.5, 0.2, 0.05, 0.01, 0.004]) {
      const step = chooseGridStep(scale);
      expect(step).toBeGreaterThanOrEqual(previous);
      previous = step;
    }
  });

  it("retombe sur le pas le plus large pour une échelle invalide", () => {
    expect(chooseGridStep(Number.NaN)).toBe(5000);
    expect(chooseGridStep(0)).toBe(5000);
  });
});

describe("majorGridInterval", () => {
  it("accentue une graduation sur cinq", () => {
    expect(majorGridInterval(10)).toBe(50);
    expect(majorGridInterval(100)).toBe(500);
  });

  it("n'accentue rien au-delà du pas le plus large", () => {
    expect(majorGridInterval(5000)).toBe(5000);
  });
});

describe("buildGridModel", () => {
  const view: ViewportState = { scale: 0.5, centerX: 1000, centerY: 700 };

  it("produit des lignes couvrant tout le viewport", () => {
    const model = buildGridModel(view, SIZE);
    expect(model).not.toBeNull();
    for (const line of model!.vertical) {
      expect(line.position).toBeGreaterThanOrEqual(-1e-6);
      expect(line.position).toBeLessThanOrEqual(SIZE.width + 1e-6);
    }
    for (const line of model!.horizontal) {
      expect(line.position).toBeGreaterThanOrEqual(-1e-6);
      expect(line.position).toBeLessThanOrEqual(SIZE.height + 1e-6);
    }
  });

  it("espace les lignes du pas retenu", () => {
    const model = buildGridModel(view, SIZE)!;
    expect(model.stepMm).toBe(chooseGridStep(view.scale));
    const gaps = model.vertical.slice(1).map((line, index) => line.position - model.vertical[index].position);
    for (const gap of gaps) expect(gap).toBeCloseTo(model.stepMm * view.scale, 6);
  });

  it("marque les graduations majeures", () => {
    const model = buildGridModel(view, SIZE)!;
    expect(model.vertical.some((line) => line.major)).toBe(true);
    expect(model.vertical.some((line) => !line.major)).toBe(true);
  });

  it("s'adapte au zoom sans jamais dépasser le plafond de lignes", () => {
    for (const scale of [0.004, 0.02, 0.1, 0.5, 2, 8, 24]) {
      const model = buildGridModel({ scale, centerX: 0, centerY: 0 }, SIZE);
      if (model) expect(model.vertical.length + model.horizontal.length).toBeLessThanOrEqual(MAX_GRID_LINES);
    }
  });

  it("renvoie null quand le conteneur n'est pas encore mesuré", () => {
    expect(buildGridModel(view, { width: 0, height: 0 })).toBeNull();
  });

  it("garde une densité raisonnable sur une vue recentrée", () => {
    const fitted = fitToBounds({ minX: 0, minY: 0, maxX: 2400, maxY: 1800 }, SIZE);
    const model = buildGridModel(fitted, SIZE)!;
    expect(model.vertical.length).toBeGreaterThan(2);
    expect(model.vertical.length).toBeLessThan(120);
  });
});

describe("formatGridStep", () => {
  it("passe en mètres au-delà du millier de millimètres", () => {
    expect(formatGridStep(100)).toBe("100 mm");
    expect(formatGridStep(1000)).toBe("1 m");
    expect(formatGridStep(5000)).toBe("5 m");
  });
});
