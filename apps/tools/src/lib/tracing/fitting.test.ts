import { describe, expect, it } from "vitest";
import {
  approximateEllipseForSite,
  distanceToEllipse,
  fitArc,
  fitCircle,
  fitEllipse,
  fitGeometry,
  fitLine,
  sampleEllipse,
  tangencyBetweenArcs,
  tangencyBetweenCircles,
} from "./fitting";
import type { Point2D } from "./geometry-port";

function arcPoints(centre: Point2D, radius: number, fromDeg: number, toDeg: number, count: number, noise = 0): Point2D[] {
  const points: Point2D[] = [];
  for (let index = 0; index <= count; index++) {
    const angle = ((fromDeg + ((toDeg - fromDeg) * index) / count) * Math.PI) / 180;
    const wobble = noise === 0 ? 0 : noise * Math.sin(index * 2.7);
    points.push({ x: centre.x + (radius + wobble) * Math.cos(angle), y: centre.y + (radius + wobble) * Math.sin(angle) });
  }
  return points;
}

describe("ajustement de droite (§22)", () => {
  it("retrouve une droite exacte avec une erreur nulle", () => {
    const points = Array.from({ length: 20 }, (_, index) => ({ x: index * 10, y: 50 + index * 5 }));
    const fit = fitLine(points);
    expect(fit.maxError).toBeLessThan(1e-9);
    expect(fit.segment.start.x).toBeCloseTo(0, 6);
    expect(fit.segment.end.x).toBeCloseTo(190, 6);
  });

  it("gère un segment vertical, où une régression y = ax + b exploserait", () => {
    const points = Array.from({ length: 10 }, (_, index) => ({ x: 300, y: index * 12 }));
    const fit = fitLine(points);
    expect(fit.maxError).toBeLessThan(1e-9);
  });
});

describe("ajustement de cercle (§24)", () => {
  it("retrouve centre et rayon d'un cercle parfait", () => {
    const fit = fitCircle(arcPoints({ x: 1200, y: 800 }, 602, 0, 359, 120));
    expect(fit.circle.centre.x).toBeCloseTo(1200, 6);
    expect(fit.circle.centre.y).toBeCloseTo(800, 6);
    expect(fit.circle.radius).toBeCloseTo(602, 6);
    expect(fit.maxError).toBeLessThan(1e-6);
  });

  it("mesure l'erreur d'ajustement sur des points bruités au lieu de l'inventer", () => {
    const fit = fitCircle(arcPoints({ x: 0, y: 0 }, 600, 0, 359, 120, 2));
    expect(fit.circle.radius).toBeCloseTo(600, 0);
    expect(fit.maxError).toBeGreaterThan(0);
    expect(fit.maxError).toBeLessThan(4);
    expect(fit.rmsError).toBeLessThanOrEqual(fit.maxError);
  });

  it("refuse d'ajuster un cercle sur des points alignés", () => {
    expect(() => fitCircle([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }])).toThrow(/alignés|confondus/);
  });
});

describe("ajustement d'arc (§22)", () => {
  it("retrouve rayon et ouverture d'un arc", () => {
    const fit = fitArc(arcPoints({ x: 500, y: 500 }, 250, 20, 140, 60));
    expect(fit.arc.radius).toBeCloseTo(250, 6);
    expect(fit.sweepDeg).toBeCloseTo(120, 3);
    expect(fit.maxError).toBeLessThan(1e-6);
  });
});

describe("ajustement d'ellipse (§25)", () => {
  it("retrouve les demi-axes d'une ellipse axée", () => {
    const ellipse = { centre: { x: 100, y: 60 }, radiusX: 400, radiusY: 250, rotation: 0 };
    const fit = fitEllipse(sampleEllipse(ellipse, 120));
    expect(fit.ellipse.centre.x).toBeCloseTo(100, 4);
    expect(Math.max(fit.ellipse.radiusX, fit.ellipse.radiusY)).toBeCloseTo(400, 4);
    expect(Math.min(fit.ellipse.radiusX, fit.ellipse.radiusY)).toBeCloseTo(250, 4);
    expect(fit.maxError).toBeLessThan(0.05);
  });

  it("retrouve une ellipse inclinée", () => {
    const ellipse = { centre: { x: -20, y: 15 }, radiusX: 300, radiusY: 120, rotation: Math.PI / 5 };
    const fit = fitEllipse(sampleEllipse(ellipse, 160));
    expect(Math.max(fit.ellipse.radiusX, fit.ellipse.radiusY)).toBeCloseTo(300, 3);
    expect(fit.maxError).toBeLessThan(0.05);
  });

  it("mesure la distance d'un point à l'ellipse", () => {
    const ellipse = { centre: { x: 0, y: 0 }, radiusX: 200, radiusY: 100, rotation: 0 };
    expect(distanceToEllipse({ x: 210, y: 0 }, ellipse)).toBeCloseTo(10, 3);
    expect(distanceToEllipse({ x: 0, y: 90 }, ellipse)).toBeCloseTo(10, 3);
  });

  it("propose une approximation en arcs traçables au compas, avec écart mesuré", () => {
    const ellipse = { centre: { x: 0, y: 0 }, radiusX: 900, radiusY: 600, rotation: 0 };
    const approximation = approximateEllipseForSite(ellipse, 3);
    expect(approximation.elements.length).toBeGreaterThan(0);
    expect(approximation.maxError).toBeLessThanOrEqual(3);
    expect(approximation.notice).toContain("compas");
  });
});

describe("choix de la primitive (§21, §22, §36)", () => {
  it("préfère une droite quand les points sont alignés", () => {
    const proposal = fitGeometry(Array.from({ length: 15 }, (_, index) => ({ x: index * 20, y: 100 })), 1);
    expect(proposal.fit.kind).toBe("line");
    expect(proposal.status).toBe("proposition");
    expect(proposal.label).toContain("à valider");
  });

  it("propose un arc avec son rayon quand la courbe s'y prête", () => {
    const proposal = fitGeometry(arcPoints({ x: 0, y: 0 }, 602, 10, 100, 40), 5);
    expect(proposal.fit.kind).toBe("arc");
    if (proposal.fit.kind === "arc") expect(proposal.fit.arc.radius).toBeCloseTo(602, 3);
    expect(proposal.label).toContain("Arc proposé");
  });

  it("propose un cercle sur un contour fermé circulaire", () => {
    const proposal = fitGeometry(arcPoints({ x: 300, y: 300 }, 150, 0, 359, 90), 2, { closed: true });
    expect(proposal.fit.kind).toBe("circle");
  });

  it("conserve la polyligne quand aucune primitive ne tient sous la tolérance", () => {
    const zigzag = Array.from({ length: 24 }, (_, index) => ({ x: index * 10, y: index % 2 === 0 ? 0 : 80 }));
    const proposal = fitGeometry(zigzag, 1, { allowEllipse: false });
    expect(proposal.fit.kind).toBe("polyline");
    expect(proposal.rejected.length).toBeGreaterThan(0);
    expect(proposal.rejected.every((entry) => entry.maxError > 1)).toBe(true);
  });

  it("n'accepte jamais une tolérance nulle ou négative", () => {
    expect(() => fitGeometry([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0)).toThrow();
  });
});

describe("points de tangence (§23)", () => {
  it("trouve le point de raccordement de deux cercles tangents extérieurement", () => {
    const tangency = tangencyBetweenCircles({ centre: { x: 0, y: 0 }, radius: 100 }, { centre: { x: 250, y: 0 }, radius: 150 }, 0.5);
    expect(tangency.kind).toBe("externe");
    expect(tangency.point).toEqual({ x: 100, y: 0 });
    expect(tangency.gap).toBeCloseTo(0, 9);
  });

  it("trouve une tangence intérieure", () => {
    const tangency = tangencyBetweenCircles({ centre: { x: 0, y: 0 }, radius: 300 }, { centre: { x: 100, y: 0 }, radius: 200 }, 0.5);
    expect(tangency.kind).toBe("interne");
    expect(tangency.point?.x).toBeCloseTo(300, 9);
  });

  it("dit franchement quand deux cercles ne se raccordent pas", () => {
    const tangency = tangencyBetweenCircles({ centre: { x: 0, y: 0 }, radius: 100 }, { centre: { x: 500, y: 0 }, radius: 150 }, 1);
    expect(tangency.kind).toBe("aucune");
    expect(tangency.point).toBeNull();
    expect(tangency.notice).toContain("ne se raccordent pas");
  });

  it("refuse un point de tangence situé hors des arcs réellement tracés", () => {
    const first = { centre: { x: 0, y: 0 }, radius: 100, startAngle: Math.PI / 2, endAngle: Math.PI, counterClockwise: true };
    const second = { centre: { x: 250, y: 0 }, radius: 150, startAngle: Math.PI / 2, endAngle: Math.PI, counterClockwise: true };
    const tangency = tangencyBetweenArcs(first, second, 0.5);
    expect(tangency.kind).toBe("aucune");
    expect(tangency.notice).toContain("hors des deux arcs");
  });
});
