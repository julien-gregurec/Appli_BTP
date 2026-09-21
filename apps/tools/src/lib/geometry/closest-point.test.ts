/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §12 — projections géométriques.
 *
 * Les cas non triviaux (arc, ellipse) sont confrontés à une recherche exhaustive : c'est la
 * seule manière de prouver qu'on calcule bien un MINIMUM GLOBAL et pas un minimum local
 * plausible. Les valeurs attendues ne sont donc pas recopiées du résultat obtenu.
 */

import { describe, expect, it } from "vitest";
import {
  arcContainsAngle,
  arcEndpoints,
  arcMidpoint,
  arcSweep,
  closestPointOnArc,
  closestPointOnCircle,
  closestPointOnEllipse,
  closestPointOnPath,
  closestPointOnPoint,
  closestPointOnPolygon,
  closestPointOnPolyline,
  closestPointOnSegment,
  type PlanePoint,
} from "./closest-point";
import { point } from "./primitives";
import type { Arc, Circle, Ellipse, Polygon, Polyline } from "./primitives";

/** Minimum global par échantillonnage dense — référence indépendante du code testé. */
function bruteForceOnParametric(target: PlanePoint, at: (t: number) => PlanePoint, from: number, to: number, samples: number) {
  let best = { point: at(from), distance: Number.POSITIVE_INFINITY };
  for (let index = 0; index <= samples; index += 1) {
    const candidate = at(from + ((to - from) * index) / samples);
    const distance = Math.hypot(target.x - candidate.x, target.y - candidate.y);
    if (distance < best.distance) best = { point: candidate, distance };
  }
  return best;
}

describe("point", () => {
  it("mesure la distance euclidienne", () => {
    expect(closestPointOnPoint({ x: 0, y: 0 }, { x: 3, y: 4 }).distance).toBeCloseTo(5, 12);
  });

  it("renvoie le point lui-même", () => {
    expect(closestPointOnPoint({ x: 10, y: 10 }, { x: 3, y: 4 }).point).toEqual({ x: 3, y: 4 });
  });
});

describe("segment — projection bornée", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };

  it("projette perpendiculairement à l'intérieur", () => {
    const hit = closestPointOnSegment({ x: 40, y: 30 }, start, end);
    expect(hit.point).toEqual({ x: 40, y: 0 });
    expect(hit.distance).toBeCloseTo(30, 12);
  });

  it("borne au départ quand la cible est en amont — jamais sur la droite infinie", () => {
    const hit = closestPointOnSegment({ x: -50, y: 0 }, start, end);
    expect(hit.point).toEqual({ x: 0, y: 0 });
    expect(hit.distance).toBeCloseTo(50, 12);
  });

  it("borne à l'arrivée quand la cible est en aval", () => {
    const hit = closestPointOnSegment({ x: 180, y: 0 }, start, end);
    expect(hit.point).toEqual({ x: 100, y: 0 });
    expect(hit.distance).toBeCloseTo(80, 12);
  });

  it("ne lève pas sur un segment nul", () => {
    const hit = closestPointOnSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(hit.distance).toBeCloseTo(5, 12);
  });

  it("coïncide avec la recherche exhaustive sur un segment oblique", () => {
    const a = { x: -37, y: 11 };
    const b = { x: 64, y: -83 };
    const target = { x: 12, y: 40 };
    const reference = bruteForceOnParametric(target, (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }), 0, 1, 400000);
    expect(closestPointOnSegment(target, a, b).distance).toBeCloseTo(reference.distance, 6);
  });
});

describe("cercle — contour, pas disque", () => {
  const circle: Circle = { id: "c", centre: point("O", 0, 0), radius: 100 };

  it("mesure l'écart au contour depuis l'extérieur", () => {
    expect(closestPointOnCircle({ x: 250, y: 0 }, circle).distance).toBeCloseTo(150, 12);
  });

  it("mesure l'écart au contour depuis l'intérieur", () => {
    expect(closestPointOnCircle({ x: 40, y: 0 }, circle).distance).toBeCloseTo(60, 12);
  });

  it("place le centre à `radius` du contour — un clic au centre ne désigne pas le cercle", () => {
    const hit = closestPointOnCircle({ x: 0, y: 0 }, circle);
    expect(hit.distance).toBeCloseTo(100, 12);
    expect(hit.point).toEqual({ x: 100, y: 0 });
  });

  it("renvoie un point réellement sur le cercle", () => {
    const hit = closestPointOnCircle({ x: 73, y: -41 }, circle);
    expect(Math.hypot(hit.point.x, hit.point.y)).toBeCloseTo(100, 9);
  });
});

describe("arc — balayage et extrémités", () => {
  const quarter: Arc = { id: "a", centre: point("O", 0, 0), radius: 100, startAngle: 0, endAngle: Math.PI / 2 };

  it("normalise le balayage comme le rendu SVG", () => {
    expect(arcSweep(quarter)).toBeCloseTo(Math.PI / 2, 12);
    expect(arcSweep({ startAngle: 0, endAngle: Math.PI / 2, counterClockwise: false })).toBeCloseTo(-((3 * Math.PI) / 2), 12);
  });

  it("reconnaît un angle dans le secteur et hors du secteur", () => {
    expect(arcContainsAngle(quarter, Math.PI / 4)).toBe(true);
    expect(arcContainsAngle(quarter, Math.PI)).toBe(false);
  });

  it("projette radialement dans le secteur", () => {
    const hit = closestPointOnArc({ x: 200, y: 200 }, quarter);
    expect(hit.distance).toBeCloseTo(Math.hypot(200, 200) - 100, 9);
  });

  it("retombe sur l'extrémité hors secteur — pas de projection sur une portion non dessinée", () => {
    const hit = closestPointOnArc({ x: -300, y: -10 }, quarter);
    const [start, end] = arcEndpoints(quarter);
    const nearest = Math.min(Math.hypot(-300 - start.x, -10 - start.y), Math.hypot(-300 - end.x, -10 - end.y));
    expect(hit.distance).toBeCloseTo(nearest, 9);
  });

  it("place le milieu SUR l'arc, pas sur la corde", () => {
    const middle = arcMidpoint(quarter);
    expect(Math.hypot(middle.x, middle.y)).toBeCloseTo(100, 9);
    expect(middle.x).toBeCloseTo(100 * Math.cos(Math.PI / 4), 9);
  });

  it("coïncide avec la recherche exhaustive, secteur et hors secteur", () => {
    const arc: Arc = { id: "a", centre: point("O", 20, -15), radius: 130, startAngle: 0.4, endAngle: 3.1 };
    const sweep = arcSweep(arc);
    for (const target of [{ x: 300, y: 200 }, { x: -400, y: -260 }, { x: 20, y: -15 }, { x: 25, y: 90 }]) {
      const reference = bruteForceOnParametric(
        target,
        (t) => ({ x: arc.centre.x + arc.radius * Math.cos(arc.startAngle + sweep * t), y: arc.centre.y + arc.radius * Math.sin(arc.startAngle + sweep * t) }),
        0,
        1,
        400000,
      );
      expect(closestPointOnArc(target, arc).distance).toBeCloseTo(reference.distance, 4);
    }
  });

  it("traite un arc complet comme un cercle", () => {
    const full: Arc = { id: "a", centre: point("O", 0, 0), radius: 50, startAngle: 0, endAngle: Math.PI * 2 };
    expect(closestPointOnArc({ x: 0, y: -120 }, full).distance).toBeCloseTo(70, 9);
  });
});

describe("ellipse — minimum global, rotation comprise", () => {
  function bruteForceEllipse(target: PlanePoint, ellipse: Ellipse, samples: number) {
    const rotation = ellipse.rotation ?? 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    return bruteForceOnParametric(
      target,
      (t) => {
        const angle = t * Math.PI * 2;
        const localX = ellipse.radiusX * Math.cos(angle);
        const localY = ellipse.radiusY * Math.sin(angle);
        return { x: ellipse.centre.x + localX * cos - localY * sin, y: ellipse.centre.y + localX * sin + localY * cos };
      },
      0,
      1,
      samples,
    );
  }

  const cases: { name: string; ellipse: Ellipse; targets: PlanePoint[] }[] = [
    {
      name: "axée, allongée en X",
      ellipse: { id: "e", centre: point("O", 0, 0), radiusX: 1200, radiusY: 800 },
      targets: [{ x: 2000, y: 900 }, { x: 100, y: 50 }, { x: 0, y: 0 }, { x: 1199, y: 0 }, { x: 0, y: 1500 }, { x: -400, y: -30 }],
    },
    {
      name: "axée, allongée en Y",
      ellipse: { id: "e", centre: point("O", -300, 250), radiusX: 400, radiusY: 1500 },
      targets: [{ x: 900, y: 900 }, { x: -300, y: 250 }, { x: -290, y: 260 }, { x: -300, y: 1900 }],
    },
    {
      name: "tournée de 37°",
      ellipse: { id: "e", centre: point("O", 120, -80), radiusX: 900, radiusY: 350, rotation: (37 * Math.PI) / 180 },
      targets: [{ x: 1500, y: 600 }, { x: 120, y: -80 }, { x: -700, y: -500 }, { x: 130, y: -70 }],
    },
    {
      name: "quasi circulaire",
      ellipse: { id: "e", centre: point("O", 0, 0), radiusX: 500, radiusY: 499.9 },
      targets: [{ x: 700, y: 3 }, { x: 0, y: 0 }, { x: -1, y: 480 }],
    },
    {
      name: "très aplatie",
      ellipse: { id: "e", centre: point("O", 0, 0), radiusX: 2000, radiusY: 40 },
      targets: [{ x: 500, y: 300 }, { x: 0, y: 0 }, { x: 1999, y: 1 }, { x: -2500, y: -5 }],
    },
  ];

  for (const scenario of cases) {
    it(`trouve le minimum global — ${scenario.name}`, () => {
      for (const target of scenario.targets) {
        const reference = bruteForceEllipse(target, scenario.ellipse, 2_000_000);
        const computed = closestPointOnEllipse(target, scenario.ellipse);
        // Jamais pire que l'échantillonnage : c'est ce qui distingue un calcul exact d'une approximation.
        expect(computed.distance).toBeLessThanOrEqual(reference.distance + 1e-6);
        expect(computed.distance).toBeCloseTo(reference.distance, 5);
      }
    });
  }

  it("renvoie un point réellement sur l'ellipse", () => {
    const ellipse: Ellipse = { id: "e", centre: point("O", 50, 20), radiusX: 700, radiusY: 300, rotation: 0.9 };
    for (const target of [{ x: 1000, y: 800 }, { x: 50, y: 20 }, { x: -900, y: 40 }]) {
      const hit = closestPointOnEllipse(target, ellipse);
      const dx = hit.point.x - 50;
      const dy = hit.point.y - 20;
      const localX = dx * Math.cos(0.9) + dy * Math.sin(0.9);
      const localY = -dx * Math.sin(0.9) + dy * Math.cos(0.9);
      expect((localX / 700) ** 2 + (localY / 300) ** 2).toBeCloseTo(1, 6);
    }
  });

  it("ne lève pas sur une ellipse dégénérée", () => {
    expect(closestPointOnEllipse({ x: 5, y: 5 }, { id: "e", centre: point("O", 0, 0), radiusX: 0, radiusY: 100 }).distance).toBeCloseTo(Math.hypot(5, 5), 9);
  });
});

describe("polyligne et contour", () => {
  const polyline: Polyline = { id: "p", points: [point("A", 0, 0), point("B", 100, 0), point("C", 100, 100)] };
  const polygon: Polygon = { id: "g", points: [point("A", 0, 0), point("B", 100, 0), point("C", 100, 100), point("D", 0, 100)] };

  it("prend le meilleur côté d'une polyligne", () => {
    expect(closestPointOnPolyline({ x: 110, y: 50 }, polyline)?.distance).toBeCloseTo(10, 12);
  });

  it("n'invente pas le côté de fermeture d'une polyligne ouverte", () => {
    // (0,100) → (50,50) sur AB..BC vaut 50√2/… : le côté C→A n'existe pas, donc la distance
    // reste celle au sommet A, pas 0.
    const hit = closestPointOnPolyline({ x: 0, y: 60 }, polyline);
    expect(hit?.distance).toBeCloseTo(60, 12);
  });

  it("referme un contour et utilise le côté de fermeture", () => {
    const hit = closestPointOnPolygon({ x: -12, y: 50 }, polygon);
    expect(hit?.distance).toBeCloseTo(12, 12);
    expect(hit?.point.x).toBeCloseTo(0, 9);
  });

  it("mesure le contour, jamais la boîte englobante", () => {
    // Le centre du carré est à 50 de chaque côté : un test bbox aurait renvoyé 0.
    expect(closestPointOnPolygon({ x: 50, y: 50 }, polygon)?.distance).toBeCloseTo(50, 12);
  });

  it("tolère les cas dégénérés", () => {
    expect(closestPointOnPath({ x: 0, y: 0 }, [], false)).toBeNull();
    expect(closestPointOnPath({ x: 3, y: 4 }, [{ x: 0, y: 0 }], false)?.distance).toBeCloseTo(5, 12);
  });
});
