import { describe, expect, it } from "vitest";
import {
  clampPan,
  clampZoom,
  createViewportTransform,
  fitToBounds,
  MAX_ZOOM,
  MIN_ZOOM,
  panByScreen,
  screenDistance,
  screenMidpoint,
  screenToWorld,
  screenToWorldLength,
  visibleWorldBounds,
  worldToScreen,
  worldToScreenLength,
  zoomAt,
  zoomByStep,
  zoomPercent,
  type ViewportSize,
  type ViewportState,
} from "./viewport-math";

const SIZE: ViewportSize = { width: 800, height: 600 };
const VIEW: ViewportState = { scale: 0.5, centerX: 1000, centerY: 700 };
const BOUNDS = { minX: 0, minY: 0, maxX: 2000, maxY: 1400 };

describe("worldToScreen", () => {
  it("projette le centre du monde au centre du viewport", () => {
    expect(worldToScreen({ x: VIEW.centerX, y: VIEW.centerY }, VIEW, SIZE)).toEqual({ x: 400, y: 300 });
  });

  it("inverse l'axe Y (monde vers le haut, écran vers le bas)", () => {
    const higher = worldToScreen({ x: 1000, y: 900 }, VIEW, SIZE);
    expect(higher.x).toBe(400);
    expect(higher.y).toBe(200);
  });

  it("applique l'échelle en px/mm", () => {
    expect(worldToScreen({ x: 1200, y: 700 }, VIEW, SIZE).x).toBe(500);
  });

  it("reste défini pour une taille de conteneur nulle (avant mesure)", () => {
    const projected = worldToScreen({ x: 0, y: 0 }, VIEW, { width: 0, height: 0 });
    expect(Number.isFinite(projected.x)).toBe(true);
    expect(Number.isFinite(projected.y)).toBe(true);
  });
});

describe("screenToWorld", () => {
  it("renvoie le centre du monde pour le centre du viewport", () => {
    expect(screenToWorld({ x: 400, y: 300 }, VIEW, SIZE)).toEqual({ x: 1000, y: 700 });
  });

  it("monte dans le monde quand on remonte à l'écran", () => {
    expect(screenToWorld({ x: 400, y: 100 }, VIEW, SIZE).y).toBe(1100);
  });
});

describe("roundtrip écran ↔ monde", () => {
  const views: ViewportState[] = [
    { scale: 0.5, centerX: 1000, centerY: 700 },
    { scale: 3.25, centerX: -420.5, centerY: 88.125 },
    { scale: MIN_ZOOM, centerX: 0, centerY: 0 },
    { scale: MAX_ZOOM, centerX: 12345.75, centerY: -987.5 },
  ];

  it("worldToScreen ∘ screenToWorld = identité", () => {
    for (const view of views) {
      for (const screen of [{ x: 0, y: 0 }, { x: 123, y: 457 }, { x: 800, y: 600 }, { x: -50, y: 640 }]) {
        const roundtrip = worldToScreen(screenToWorld(screen, view, SIZE), view, SIZE);
        expect(roundtrip.x).toBeCloseTo(screen.x, 9);
        expect(roundtrip.y).toBeCloseTo(screen.y, 9);
      }
    }
  });

  it("screenToWorld ∘ worldToScreen = identité", () => {
    for (const view of views) {
      for (const world of [{ x: 0, y: 0 }, { x: 1523.75, y: -880.25 }, { x: 1e5, y: 1e5 }]) {
        const roundtrip = screenToWorld(worldToScreen(world, view, SIZE), view, SIZE);
        expect(roundtrip.x).toBeCloseTo(world.x, 6);
        expect(roundtrip.y).toBeCloseTo(world.y, 6);
      }
    }
  });

  it("est déterministe (mêmes entrées, mêmes sorties)", () => {
    expect(screenToWorld({ x: 317, y: 211 }, VIEW, SIZE)).toEqual(screenToWorld({ x: 317, y: 211 }, VIEW, SIZE));
  });
});

describe("conversions de longueur", () => {
  it("convertit dans les deux sens", () => {
    expect(worldToScreenLength(1000, VIEW)).toBe(500);
    expect(screenToWorldLength(500, VIEW)).toBe(1000);
  });
});

describe("panByScreen", () => {
  it("déplace le plan dans le sens du geste", () => {
    const panned = panByScreen(VIEW, 100, 0);
    expect(worldToScreen({ x: VIEW.centerX, y: VIEW.centerY }, panned, SIZE).x).toBe(500);
  });

  it("déplace verticalement en respectant l'inversion d'axe", () => {
    const panned = panByScreen(VIEW, 0, 60);
    expect(worldToScreen({ x: VIEW.centerX, y: VIEW.centerY }, panned, SIZE).y).toBe(360);
  });

  it("ne modifie pas le zoom", () => {
    expect(panByScreen(VIEW, 37, -12).scale).toBe(VIEW.scale);
  });

  it("ignore un delta non fini", () => {
    expect(panByScreen(VIEW, Number.NaN, 0).centerX).toBe(VIEW.centerX);
  });
});

describe("zoomAt", () => {
  it("laisse le point du monde sous l'ancre exactement sous l'ancre", () => {
    const anchor = { x: 640, y: 120 };
    const before = screenToWorld(anchor, VIEW, SIZE);
    for (const factor of [1.2, 1 / 1.2, 4, 0.25]) {
      const zoomed = zoomAt(VIEW, SIZE, anchor, factor);
      const after = worldToScreen(before, zoomed, SIZE);
      expect(after.x).toBeCloseTo(anchor.x, 6);
      expect(after.y).toBeCloseTo(anchor.y, 6);
    }
  });

  it("multiplie l'échelle par le facteur", () => {
    expect(zoomAt(VIEW, SIZE, { x: 10, y: 10 }, 2).scale).toBeCloseTo(1, 9);
  });

  it("zoome autour du centre avec zoomByStep", () => {
    const zoomed = zoomByStep(VIEW, SIZE, 2);
    expect(zoomed.centerX).toBeCloseTo(VIEW.centerX, 9);
    expect(zoomed.centerY).toBeCloseTo(VIEW.centerY, 9);
    expect(zoomed.scale).toBeCloseTo(1, 9);
  });

  it("ignore un facteur invalide", () => {
    expect(zoomAt(VIEW, SIZE, { x: 10, y: 10 }, 0).scale).toBe(VIEW.scale);
    expect(zoomAt(VIEW, SIZE, { x: 10, y: 10 }, Number.NaN).scale).toBe(VIEW.scale);
  });
});

describe("limites de zoom", () => {
  it("borne l'échelle entre MIN_ZOOM et MAX_ZOOM", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-3)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(MIN_ZOOM);
    expect(clampZoom(1e9)).toBe(MAX_ZOOM);
    expect(clampZoom(1)).toBe(1);
  });

  it("ne dépasse jamais les bornes, même après zooms répétés", () => {
    let view = VIEW;
    for (let index = 0; index < 200; index += 1) view = zoomAt(view, SIZE, { x: 400, y: 300 }, 1.3);
    expect(view.scale).toBe(MAX_ZOOM);
    for (let index = 0; index < 400; index += 1) view = zoomAt(view, SIZE, { x: 400, y: 300 }, 1 / 1.3);
    expect(view.scale).toBe(MIN_ZOOM);
  });

  it("garde l'ancre stable une fois la borne atteinte", () => {
    const saturated: ViewportState = { scale: MAX_ZOOM, centerX: 0, centerY: 0 };
    const anchor = { x: 200, y: 500 };
    const before = screenToWorld(anchor, saturated, SIZE);
    const after = worldToScreen(before, zoomAt(saturated, SIZE, anchor, 2), SIZE);
    expect(after.x).toBeCloseTo(anchor.x, 6);
    expect(after.y).toBeCloseTo(anchor.y, 6);
  });
});

describe("fitToBounds", () => {
  it("fait tenir la géométrie dans le viewport, marge comprise", () => {
    const fitted = fitToBounds(BOUNDS, SIZE, 32);
    const corners = [
      worldToScreen({ x: BOUNDS.minX, y: BOUNDS.minY }, fitted, SIZE),
      worldToScreen({ x: BOUNDS.maxX, y: BOUNDS.maxY }, fitted, SIZE),
    ];
    for (const corner of corners) {
      expect(corner.x).toBeGreaterThanOrEqual(32 - 1e-6);
      expect(corner.x).toBeLessThanOrEqual(SIZE.width - 32 + 1e-6);
      expect(corner.y).toBeGreaterThanOrEqual(32 - 1e-6);
      expect(corner.y).toBeLessThanOrEqual(SIZE.height - 32 + 1e-6);
    }
  });

  it("centre la vue sur le milieu des bornes", () => {
    const fitted = fitToBounds(BOUNDS, SIZE);
    expect(fitted.centerX).toBe(1000);
    expect(fitted.centerY).toBe(700);
  });

  it("est idempotent (recentrer deux fois ne bouge plus)", () => {
    expect(fitToBounds(BOUNDS, SIZE)).toEqual(fitToBounds(BOUNDS, SIZE));
  });

  it("reste borné pour une géométrie dégénérée", () => {
    const degenerate = fitToBounds({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, SIZE);
    expect(degenerate.scale).toBeLessThanOrEqual(MAX_ZOOM);
    expect(degenerate.scale).toBeGreaterThanOrEqual(MIN_ZOOM);
  });
});

describe("clampPan", () => {
  it("laisse une vue centrée inchangée", () => {
    const centered = fitToBounds(BOUNDS, SIZE);
    expect(clampPan(centered, BOUNDS, SIZE)).toEqual(centered);
  });

  it("empêche de perdre le plan hors écran", () => {
    const runaway: ViewportState = { scale: 0.5, centerX: 1e6, centerY: -1e6 };
    const clamped = clampPan(runaway, BOUNDS, SIZE);
    const visible = visibleWorldBounds(clamped, SIZE);
    expect(visible.minX).toBeLessThanOrEqual(BOUNDS.maxX + 1e-6);
    expect(visible.maxX).toBeGreaterThanOrEqual(BOUNDS.minX - 1e-6);
    expect(visible.minY).toBeLessThanOrEqual(BOUNDS.maxY + 1e-6);
    expect(visible.maxY).toBeGreaterThanOrEqual(BOUNDS.minY - 1e-6);
  });

  it("garde le plan atteignable après une longue série de pans", () => {
    let view = fitToBounds(BOUNDS, SIZE);
    for (let index = 0; index < 500; index += 1) view = clampPan(panByScreen(view, -80, -80), BOUNDS, SIZE);
    const visible = visibleWorldBounds(view, SIZE);
    expect(visible.minX).toBeLessThanOrEqual(BOUNDS.maxX);
    expect(visible.maxY).toBeGreaterThanOrEqual(BOUNDS.minY);
  });

  it("ne modifie pas l'échelle", () => {
    expect(clampPan({ scale: 2, centerX: 1e9, centerY: 1e9 }, BOUNDS, SIZE).scale).toBe(2);
  });
});

describe("pinch", () => {
  it("mesure distance et milieu entre deux contacts", () => {
    expect(screenDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(screenMidpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it("zoome autour du point entre les doigts", () => {
    const first = { x: 200, y: 200 };
    const second = { x: 400, y: 500 };
    const anchor = screenMidpoint(first, second);
    const before = screenToWorld(anchor, VIEW, SIZE);
    const zoomed = zoomAt(VIEW, SIZE, anchor, screenDistance(first, second) / (screenDistance(first, second) / 2));
    const after = worldToScreen(before, zoomed, SIZE);
    expect(after.x).toBeCloseTo(anchor.x, 6);
    expect(after.y).toBeCloseTo(anchor.y, 6);
  });
});

describe("zoomPercent", () => {
  it("affiche 100 % pour la vue recentrée", () => {
    const fitted = fitToBounds(BOUNDS, SIZE);
    expect(zoomPercent(fitted, fitted)).toBe(100);
  });

  it("double quand l'échelle double", () => {
    const fitted = fitToBounds(BOUNDS, SIZE);
    expect(zoomPercent({ ...fitted, scale: fitted.scale * 2 }, fitted)).toBe(200);
  });
});

describe("createViewportTransform", () => {
  it("expose la même forme que createPlanTransform (width/height/scale/point/radius)", () => {
    const transform = createViewportTransform(VIEW, SIZE);
    expect(transform.width).toBe(800);
    expect(transform.height).toBe(600);
    expect(transform.scale).toBe(0.5);
    expect(transform.radius(100)).toBe(50);
    expect(transform.point({ x: VIEW.centerX, y: VIEW.centerY })).toEqual({ x: 400, y: 300 });
  });
});
