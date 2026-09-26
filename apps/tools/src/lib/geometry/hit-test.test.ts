/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §12 — tolérance, priorité, départage.
 */

import { describe, expect, it } from "vitest";
import { HIT_PRIORITY, hitTest, hitTestAll, hitTestCandidates, type HitTestScene } from "./hit-test";
import { point } from "./primitives";

const SCENE: HitTestScene = {
  points: [point("O", 0, 0, "O", "center"), point("A", 100, 0), point("B", 100, 100)],
  segments: [{ id: "AB", start: point("A", 100, 0), end: point("B", 100, 100), role: "shape" }],
  constructionLines: [{ id: "axe", start: point("g", -500, 0), end: point("d", 500, 0) }],
  arcs: [{ id: "arc", centre: point("O", 0, 0), radius: 200, startAngle: 0, endAngle: Math.PI / 2 }],
  circles: [{ id: "cercle", centre: point("O", 0, 0), radius: 300 }],
  ellipses: [{ id: "ell", centre: point("O", 0, 0), radiusX: 800, radiusY: 500 }],
  polylines: [{ id: "pl", points: [point("p1", -400, 400), point("p2", -200, 400)] }],
  polygons: [{ id: "contour", points: [point("q1", -400, -400), point("q2", -200, -400), point("q3", -200, -200)] }],
};

describe("inventaire des candidats", () => {
  it("couvre les sept natures d'entités", () => {
    const kinds = new Set(hitTestCandidates(SCENE, { x: 0, y: 0 }).map((c) => c.entityKind));
    expect([...kinds].sort()).toEqual(["arc", "circle", "ellipse", "point", "polygon", "polyline", "segment"]);
  });

  it("inclut les traits de construction comme segments, avec leur rôle restitué", () => {
    const axis = hitTestCandidates(SCENE, { x: 0, y: 5 }).find((c) => c.entityId === "axe");
    expect(axis?.entityKind).toBe("segment");
    expect(axis?.role).toBe("construction");
  });

  it("remonte le libellé et le rôle d'un point nommé", () => {
    const origin = hitTestCandidates(SCENE, { x: 0, y: 0 }).find((c) => c.entityId === "O");
    expect(origin?.label).toBe("O");
    expect(origin?.role).toBe("center");
  });

  it("expose une distance réelle, pas une distance de boîte", () => {
    // Au centre : le cercle de rayon 300 est bien à 300, pas à 0.
    expect(hitTestCandidates(SCENE, { x: 0, y: 0 }).find((c) => c.entityId === "cercle")?.distance).toBeCloseTo(300, 9);
  });
});

describe("tolérance", () => {
  it("ne retient rien hors tolérance", () => {
    // (60, 50) est à 40 du segment AB et à plus de 40 de tout le reste.
    expect(hitTest(SCENE, { x: 60, y: 50 }, 1)).toBeNull();
  });

  it("retient le segment dès que la tolérance l'atteint", () => {
    expect(hitTest(SCENE, { x: 60, y: 50 }, 39)).toBeNull();
    expect(hitTest(SCENE, { x: 60, y: 50 }, 41)?.entityId).toBe("AB");
  });

  it("traite une tolérance nulle ou absurde comme zéro, sans lever", () => {
    expect(hitTest(SCENE, { x: 105, y: 50 }, 0)).toBeNull();
    expect(hitTest(SCENE, { x: 105, y: 50 }, Number.NaN)).toBeNull();
    expect(hitTest(SCENE, { x: 105, y: 50 }, -3)).toBeNull();
  });

  it("désigne exactement l'entité sous le curseur à tolérance nulle près", () => {
    expect(hitTest(SCENE, { x: 100, y: 50 }, 1e-9)?.entityId).toBe("AB");
  });
});

describe("priorité", () => {
  it("classe du plus précis au plus étendu", () => {
    expect(HIT_PRIORITY.point).toBeLessThan(HIT_PRIORITY.segment);
    expect(HIT_PRIORITY.segment).toBeLessThan(HIT_PRIORITY.circle);
    expect(HIT_PRIORITY.circle).toBeLessThan(HIT_PRIORITY.polygon);
    expect(HIT_PRIORITY.arc).toBe(HIT_PRIORITY.segment);
    expect(HIT_PRIORITY.ellipse).toBe(HIT_PRIORITY.circle);
  });

  it("préfère le point au segment qui le porte", () => {
    // A est une extrémité de AB : les deux sont à distance ~0, le point doit gagner.
    expect(hitTest(SCENE, { x: 100, y: 1 }, 20)?.entityId).toBe("A");
  });

  it("ne laisse PAS un point prioritaire mais lointain voler un segment proche", () => {
    // À (100,50) : le segment AB est à 0, les points A et B à 50. Tolérance 20 : seul AB entre.
    expect(hitTest(SCENE, { x: 100, y: 50 }, 20)?.entityId).toBe("AB");
  });

  it("préfère le segment au contour quand les deux sont dans la tolérance", () => {
    const scene: HitTestScene = {
      segments: [{ id: "seg", start: point("s", -100, 0), end: point("e", 100, 0) }],
      polygons: [{ id: "poly", points: [point("a", -100, 0), point("b", 100, 0), point("c", 0, 200)] }],
    };
    expect(hitTest(scene, { x: 0, y: 1 }, 10)?.entityId).toBe("seg");
  });

  it("départage deux entités de même rang par la distance", () => {
    const scene: HitTestScene = {
      segments: [
        { id: "proche", start: point("a", 0, 10), end: point("b", 100, 10) },
        { id: "loin", start: point("c", 0, 40), end: point("d", 100, 40) },
      ],
    };
    expect(hitTest(scene, { x: 50, y: 0 }, 100)?.entityId).toBe("proche");
  });
});

describe("déterminisme — indépendance à l'ordre du tableau (§3)", () => {
  it("désigne la même entité quel que soit l'ordre de publication", () => {
    const first = { id: "beta", start: point("a", -50, 0), end: point("b", 50, 0) };
    const second = { id: "alpha", start: point("c", 0, -50), end: point("d", 0, 50) };
    // Les deux diagonales se croisent en (0,0) : égalité parfaite de rang ET de distance.
    const direct = hitTest({ segments: [first, second] }, { x: 0, y: 0 }, 10);
    const reversed = hitTest({ segments: [second, first] }, { x: 0, y: 0 }, 10);
    expect(direct?.entityId).toBe(reversed?.entityId);
    expect(direct?.entityId).toBe("alpha");
  });

  it("reste stable d'un appel à l'autre", () => {
    const target = { x: 103, y: 47 };
    expect(hitTest(SCENE, target, 25)).toEqual(hitTest(SCENE, target, 25));
  });
});

describe("closestPoint", () => {
  it("renvoie le point projeté sur l'entité retenue", () => {
    const hit = hitTest(SCENE, { x: 108, y: 50 }, 20);
    expect(hit?.entityId).toBe("AB");
    expect(hit?.closestPoint).toEqual({ x: 100, y: 50 });
  });

  it("projette sur l'arc, pas sur son cercle porteur complet", () => {
    // À (150,150) l'arc est à ~12 ; le point B, prioritaire, est à ~71 : une tolérance de 20
    // laisse donc l'arc seul candidat.
    const hit = hitTest(SCENE, { x: 150, y: 150 }, 20);
    expect(hit?.entityId).toBe("arc");
    expect(Math.hypot(hit!.closestPoint.x, hit!.closestPoint.y)).toBeCloseTo(200, 6);
  });

  it("laisse le point prioritaire l'emporter quand la tolérance les englobe tous deux", () => {
    // Même clic, tolérance large : B (rang 1, ~71) passe devant l'arc (rang 2, ~12). C'est la
    // règle de §3 — dans le disque de tolérance, la cible la plus petite gagne.
    expect(hitTest(SCENE, { x: 150, y: 150 }, 100)?.entityId).toBe("B");
  });
});

describe("hitTestAll", () => {
  it("ordonne les candidats du plus pertinent au moins pertinent", () => {
    const all = hitTestAll(SCENE, { x: 100, y: 2 }, 40);
    expect(all[0].entityId).toBe("A");
    for (let index = 1; index < all.length; index += 1) {
      const previous = all[index - 1];
      const current = all[index];
      expect(previous.priority <= current.priority).toBe(true);
    }
  });

  it("ne renvoie rien quand la scène est vide", () => {
    expect(hitTestAll({}, { x: 0, y: 0 }, 100)).toEqual([]);
    expect(hitTest({}, { x: 0, y: 0 }, 100)).toBeNull();
  });
});
