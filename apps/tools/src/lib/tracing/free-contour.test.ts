import { describe, expect, it } from "vitest";
import {
  FREE_CONTOUR_MIN_AREA_MM2,
  freeContourMeasures,
  freeContourSelfIntersects,
  freeContourTotals,
  freeGeometryContourMeasures,
  isFreeContour,
} from "./free-contour";
import {
  createFreeEntity,
  FREE_GEOMETRY_VERSION,
  freeEntityEdges,
  freeEntityLength,
  MIN_FREE_CONTOUR_VERTICES,
  validateFreeGeometry,
  type FreeEntity,
  type FreeGeometry,
  type FreeVertex,
} from "./free-geometry";
import { hasSelfIntersection } from "./geometry-port";

const contour = (points: readonly FreeVertex[], id = "pg-1"): FreeEntity =>
  createFreeEntity("polygon", points, id);

/** Rectangle 1000 × 500 mm, parcouru en sens antihoraire (Y vers le haut). */
const RECTANGLE: readonly FreeVertex[] = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 500 },
  { x: 0, y: 500 },
];

/** Triangle rectangle 300 × 400 mm — aire 60 000 mm², hypoténuse 500 mm. */
const TRIANGLE: readonly FreeVertex[] = [
  { x: 0, y: 0 },
  { x: 300, y: 0 },
  { x: 0, y: 400 },
];

/** Nœud papillon : deux lobes opposés, aire algébrique nulle et forme parfaitement lisible. */
const BOWTIE: readonly FreeVertex[] = [
  { x: 0, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
  { x: 100, y: 0 },
];

function polygonOf(count: number, radius = 1000): FreeVertex[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

describe("contrat du contour libre (§2)", () => {
  it("stocke la fermeture de façon IMPLICITE : le premier sommet n'est jamais répété", () => {
    const entity = contour(RECTANGLE);
    expect(entity.points).toHaveLength(4);
    expect(entity.points[entity.points.length - 1]).not.toEqual(entity.points[0]);
    // Le côté de fermeture existe pourtant bel et bien — il est produit, pas stocké.
    expect(freeEntityEdges(entity)).toHaveLength(4);
    expect(freeEntityEdges(entity)[3]).toEqual([{ x: 0, y: 500 }, { x: 0, y: 0 }]);
  });

  it("refuse un contour de moins de trois sommets", () => {
    expect(() => contour([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toThrow(/au moins trois sommets/);
    expect(MIN_FREE_CONTOUR_VERTICES).toBe(3);
  });

  it("refuse un contour dont le dernier sommet retombe sur le premier", () => {
    expect(() => contour([...RECTANGLE, { x: 0, y: 0 }])).toThrow(/double emploi/);
  });

  it("refuse un côté de longueur nulle au milieu du contour", () => {
    expect(() => contour([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }])).toThrow(
      /côté de longueur nulle/,
    );
  });

  it("refuse une coordonnée hors des limites du projet", () => {
    expect(() => contour([{ x: 0, y: 0 }, { x: 2_000_000, y: 0 }, { x: 0, y: 100 }])).toThrow(/limites/);
  });

  it("refuse une coordonnée non finie", () => {
    expect(() => contour([{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 0, y: 100 }])).toThrow(/nombre fini/);
  });

  it("reconnaît un contour parmi les autres natures", () => {
    expect(isFreeContour(contour(RECTANGLE))).toBe(true);
    expect(isFreeContour(createFreeEntity("polyline", RECTANGLE, "pl-1"))).toBe(false);
  });
});

describe("surface (§6)", () => {
  it("mesure exactement un rectangle", () => {
    const measures = freeContourMeasures(contour(RECTANGLE));
    expect(measures.areaMm2).toBe(500_000);
    expect(measures.areaM2).toBeCloseTo(0.5, 12);
    expect(measures.status).toBe("valid");
  });

  it("mesure exactement un triangle", () => {
    expect(freeContourMeasures(contour(TRIANGLE)).areaMm2).toBe(60_000);
  });

  it("est invariante par translation", () => {
    const shifted = RECTANGLE.map((vertex) => ({ x: vertex.x - 731.5, y: vertex.y + 244.25 }));
    expect(freeContourMeasures(contour(shifted)).areaMm2).toBeCloseTo(500_000, 6);
    expect(freeContourMeasures(contour(shifted)).perimeterMm).toBeCloseTo(3000, 9);
  });

  it("suit le carré de l'échelle", () => {
    const scaled = RECTANGLE.map((vertex) => ({ x: vertex.x / 2, y: vertex.y / 2 }));
    expect(freeContourMeasures(contour(scaled)).areaMm2).toBeCloseTo(500_000 / 4, 9);
    expect(freeContourMeasures(contour(scaled)).perimeterMm).toBeCloseTo(1500, 9);
  });

  it("ne conserve AUCUN arrondi dans la source : l'aire brute traverse telle quelle", () => {
    const measures = freeContourMeasures(contour([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 3.7 }]));
    // 1 × 3,7 / 2 = 1,85 mm² — sous le seuil d'affichage, au-dessus du seuil d'exploitabilité.
    expect(measures.areaMm2).toBeCloseTo(1.85, 12);
    expect(measures.areaM2).toBeCloseTo(1.85e-6, 18);
  });
});

describe("périmètre (§7)", () => {
  it("compte le côté de fermeture", () => {
    expect(freeContourMeasures(contour(RECTANGLE)).perimeterMm).toBe(3000);
    // 300 + 400 + 500 : la fermeture est l'hypoténuse, et l'oublier donnerait 700.
    expect(freeContourMeasures(contour(TRIANGLE)).perimeterMm).toBe(1200);
  });

  it("coïncide avec le développé publié par la géométrie libre", () => {
    const entity = contour(RECTANGLE);
    expect(freeEntityLength(entity)).toBe(freeContourMeasures(entity).perimeterMm);
  });

  it("reste mesurable sur un contour dont la surface ne l'est pas", () => {
    const measures = freeContourMeasures(contour(BOWTIE));
    expect(measures.areaMm2).toBeNull();
    expect(measures.perimeterMm).toBeGreaterThan(0);
  });
});

describe("orientation (§8)", () => {
  it("lit le sens depuis le signe de l'aire, sans réordonner les sommets", () => {
    const trigonometric = contour(RECTANGLE);
    const reversed = contour([...RECTANGLE].reverse());
    expect(freeContourMeasures(trigonometric).orientation).toBe("counter-clockwise");
    expect(freeContourMeasures(reversed).orientation).toBe("clockwise");
    // Les sommets ne bougent pas : l'ordre est la donnée de l'utilisateur (§8).
    expect(reversed.points[0]).toEqual(RECTANGLE[RECTANGLE.length - 1]);
  });

  it("donne la même surface dans les deux sens", () => {
    expect(freeContourMeasures(contour([...RECTANGLE].reverse())).areaMm2).toBe(500_000);
  });

  it("répond « indéterminée » quand aucun sens ne peut être lu", () => {
    expect(freeContourMeasures(contour(BOWTIE)).orientation).toBe("indeterminate");
  });
});

describe("validité (§5)", () => {
  it("marque un contour auto-intersecté et refuse d'en publier la surface", () => {
    const measures = freeContourMeasures(contour(BOWTIE));
    expect(measures.status).toBe("self-intersecting");
    expect(measures.areaMm2).toBeNull();
    expect(measures.areaM2).toBeNull();
    expect(measures.reason).toMatch(/croise/);
  });

  it("ne rend JAMAIS 0 m² en guise de mesure impossible (§13)", () => {
    for (const points of [BOWTIE, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0.0001 }]]) {
      const measures = freeContourMeasures(contour(points));
      expect(measures.areaMm2).not.toBe(0);
      expect(measures.areaMm2).toBeNull();
    }
  });

  it("marque un contour aplati comme dégénéré, pas comme croisé", () => {
    const measures = freeContourMeasures(contour([{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 0.001 }]));
    expect(Math.abs(measures.signedAreaMm2)).toBeLessThan(FREE_CONTOUR_MIN_AREA_MM2);
    expect(measures.status).toBe("degenerate");
    expect(measures.reason).toMatch(/alignés|confondus/);
  });

  it("publie l'aire algébrique même quand la surface se tait — la donnée brute reste lisible", () => {
    expect(freeContourMeasures(contour(BOWTIE)).signedAreaMm2).toBeCloseTo(0, 9);
  });
});

describe("auto-intersection : accord avec le moteur (§5)", () => {
  const CASES: readonly { label: string; points: readonly FreeVertex[] }[] = [
    { label: "triangle", points: TRIANGLE },
    { label: "rectangle", points: RECTANGLE },
    { label: "nœud papillon", points: BOWTIE },
    { label: "hexagone régulier", points: polygonOf(6) },
    { label: "polygone à 60 côtés", points: polygonOf(60) },
    {
      label: "L rentrant (concave, non croisé)",
      points: [
        { x: 0, y: 0 },
        { x: 600, y: 0 },
        { x: 600, y: 200 },
        { x: 200, y: 200 },
        { x: 200, y: 600 },
        { x: 0, y: 600 },
      ],
    },
    {
      label: "étoile croisée",
      points: [
        { x: 0, y: 0 },
        { x: 400, y: 100 },
        { x: 0, y: 200 },
        { x: 300, y: 300 },
        { x: 100, y: -100 },
      ],
    },
  ];

  for (const { label, points } of CASES) {
    it(`répond comme hasSelfIntersection du moteur — ${label}`, () => {
      // Le filtre par boîtes englobantes doit accélérer la réponse, jamais la changer.
      expect(freeContourSelfIntersects(contour(points))).toBe(hasSelfIntersection(points, true));
    });
  }

  it("ne compte pas le côté de fermeture comme un croisement avec le premier côté", () => {
    expect(freeContourSelfIntersects(contour(polygonOf(5)))).toBe(false);
  });
});

describe("totaux du tracé (§14)", () => {
  const geometryOf = (...entities: readonly FreeEntity[]): FreeGeometry =>
    validateFreeGeometry({ version: FREE_GEOMETRY_VERSION, entities });

  it("n'additionne que les contours exploitables et dit combien manquent", () => {
    const totals = freeContourTotals(
      geometryOf(contour(RECTANGLE, "pg-1"), contour(TRIANGLE, "pg-2"), contour(BOWTIE, "pg-3")),
    );
    expect(totals.contourCount).toBe(3);
    expect(totals.exploitableCount).toBe(2);
    expect(totals.areaMm2).toBe(560_000);
    // Le périmètre du contour croisé compte : c'est l'aire qui se tait, pas la longueur.
    expect(totals.perimeterMm).toBeCloseTo(3000 + 1200 + freeContourMeasures(contour(BOWTIE)).perimeterMm, 9);
  });

  it("répond null plutôt que zéro quand aucun contour n'est exploitable", () => {
    const totals = freeContourTotals(geometryOf(contour(BOWTIE)));
    expect(totals.areaMm2).toBeNull();
    expect(totals.areaM2).toBeNull();
    expect(totals.exploitableCount).toBe(0);
  });

  it("ignore les primitives qui ne sont pas des contours", () => {
    const geometry = geometryOf(
      createFreeEntity("point", [{ x: 0, y: 0 }], "pt-1"),
      createFreeEntity("segment", [{ x: 0, y: 0 }, { x: 100, y: 0 }], "sg-1"),
      contour(RECTANGLE),
    );
    expect(freeGeometryContourMeasures(geometry)).toHaveLength(1);
    expect(freeContourTotals(geometry).areaMm2).toBe(500_000);
  });

  it("ne compte aucun contour sur un tracé qui n'en porte pas", () => {
    const totals = freeContourTotals(geometryOf(createFreeEntity("point", [{ x: 0, y: 0 }], "pt-1")));
    expect(totals).toEqual({ contourCount: 0, exploitableCount: 0, areaMm2: null, areaM2: null, perimeterMm: 0 });
  });
});

describe("charge (§20)", () => {
  const measure = (count: number) => {
    const entity = contour(polygonOf(count));
    const started = performance.now();
    const result = freeContourMeasures(entity);
    return { elapsed: performance.now() - started, result };
  };

  for (const count of [10, 100, 500]) {
    it(`mesure un contour de ${count} sommets sans temps mort`, () => {
      const { elapsed, result } = measure(count);
      expect(result.status).toBe("valid");
      expect(result.vertexCount).toBe(count);
      // Le repère est large à dessein : il n'atteste pas d'une performance, il attrape une
      // régression d'ORDRE DE GRANDEUR — un filtre par boîtes retiré, par exemple.
      expect(elapsed).toBeLessThan(150);
    });
  }

  it("mesure une aire de polygone régulier conforme à la formule", () => {
    const count = 100;
    const radius = 1000;
    const expected = (count / 2) * radius ** 2 * Math.sin((2 * Math.PI) / count);
    expect(freeContourMeasures(contour(polygonOf(count, radius))).areaMm2).toBeCloseTo(expected, 6);
  });
});
