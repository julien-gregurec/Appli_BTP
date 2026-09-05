/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8 — intersections bornées.
 *
 * Les cas nominaux sont vérifiés sur des configurations dont le résultat est connu à la main
 * (croix, cercle unité, tangentes construites), jamais sur une valeur relevée dans une sortie :
 * un test qui recopie ce que le code produit ne prouve rien.
 *
 * L'essentiel du fichier porte sur les cas LIMITES — tangence, parallélisme, colinéarité,
 * dégénérescence, bornes — parce que c'est là que se joue la différence avec les helpers
 * infinis d'Engine A, et c'est là qu'un accrochage faux enverrait le curseur dans le vide.
 */

import { describe, expect, it } from "vitest";
import {
  arcArcIntersections,
  arcCircleIntersections,
  circleCircleIntersections,
  intersectionsBetween,
  lineSegmentIntersections,
  segmentArcIntersections,
  segmentCircleIntersections,
  segmentSegmentIntersections,
} from "./intersections";
import type { Arc, Circle, Segment } from "./primitives";

function node(id: string, x: number, y: number) {
  return { id, x, y };
}

function seg(id: string, ax: number, ay: number, bx: number, by: number): Segment {
  return { id, start: node(`${id}a`, ax, ay), end: node(`${id}b`, bx, by) };
}

function circle(id: string, x: number, y: number, radius: number): Circle {
  return { id, centre: node(`${id}c`, x, y), radius };
}

function arc(id: string, x: number, y: number, radius: number, startAngle: number, endAngle: number): Arc {
  return { id, centre: node(`${id}c`, x, y), radius, startAngle, endAngle };
}

/** Compare un ensemble de points sans dépendre de leur ordre de production. */
function sortedPoints(points: readonly { x: number; y: number }[]) {
  return [...points]
    .map((point) => ({ x: Math.round(point.x * 1e6) / 1e6, y: Math.round(point.y * 1e6) / 1e6 }))
    .sort((first, second) => first.x - second.x || first.y - second.y);
}

describe("segment / segment", () => {
  it("croise deux segments sécants en leur point commun", () => {
    const found = segmentSegmentIntersections(seg("h", -10, 0, 10, 0), seg("v", 0, -10, 0, 10));
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(0, 9);
    expect(found[0].y).toBeCloseTo(0, 9);
  });

  it("croise deux segments obliques au point attendu", () => {
    // y = x et y = 2 - x se coupent en (1, 1).
    const found = segmentSegmentIntersections(seg("a", 0, 0, 4, 4), seg("b", 0, 2, 4, -2));
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(1, 9);
    expect(found[0].y).toBeCloseTo(1, 9);
  });

  it("ne croise pas deux segments parallèles distincts", () => {
    expect(segmentSegmentIntersections(seg("a", 0, 0, 10, 0), seg("b", 0, 5, 10, 5))).toHaveLength(0);
  });

  it("ne croise pas deux segments colinéaires superposés — l'intersection y est continue", () => {
    expect(segmentSegmentIntersections(seg("a", 0, 0, 10, 0), seg("b", 5, 0, 15, 0))).toHaveLength(0);
  });

  it("ne croise pas deux segments colinéaires disjoints", () => {
    expect(segmentSegmentIntersections(seg("a", 0, 0, 10, 0), seg("b", 20, 0, 30, 0))).toHaveLength(0);
  });

  it("BORNE les segments : le croisement des SUPPORTS ne compte pas s'il tombe au-delà", () => {
    // Les droites porteuses se coupent en (0, 0), mais aucun des deux segments n'y arrive.
    const found = segmentSegmentIntersections(seg("a", 5, 0, 15, 0), seg("b", 0, 5, 0, 15));
    expect(found).toHaveLength(0);
  });

  it("retient un croisement situé exactement sur une extrémité", () => {
    const found = segmentSegmentIntersections(seg("a", 0, 0, 10, 0), seg("b", 10, 0, 10, 10));
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(10, 9);
    expect(found[0].y).toBeCloseTo(0, 9);
  });

  it("renvoie un tableau vide pour un segment dégénéré", () => {
    expect(segmentSegmentIntersections(seg("nul", 3, 3, 3, 3), seg("v", 0, -10, 0, 10))).toHaveLength(0);
  });

  it("renvoie un tableau vide sur des coordonnées non finies plutôt que de lever", () => {
    expect(() => segmentSegmentIntersections(seg("a", Number.NaN, 0, 10, 0), seg("b", 0, -1, 0, 1))).not.toThrow();
    expect(segmentSegmentIntersections(seg("a", Number.NaN, 0, 10, 0), seg("b", 0, -1, 0, 1))).toHaveLength(0);
  });

  it("juge le parallélisme sur l'ANGLE, pas sur la taille du dessin", () => {
    // Même angle, deux échelles : le verdict ne doit pas changer avec la longueur des segments.
    const petit = segmentSegmentIntersections(seg("a", 0, 0, 10, 0), seg("b", 5, -10, 5, 10));
    const grand = segmentSegmentIntersections(seg("a", 0, 0, 10000, 0), seg("b", 5000, -10000, 5000, 10000));
    expect(petit).toHaveLength(1);
    expect(grand).toHaveLength(1);
  });
});

describe("droite / segment", () => {
  it("croise une droite infinie et un segment borné", () => {
    const found = lineSegmentIntersections({ point: node("o", 0, 0), direction: { x: 1, y: 0 } }, seg("v", 4, -3, 4, 3));
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(4, 9);
    expect(found[0].y).toBeCloseTo(0, 9);
  });

  it("ne borne PAS la droite : un croisement loin de son point de définition compte", () => {
    const found = lineSegmentIntersections({ point: node("o", 0, 0), direction: { x: 1, y: 0 } }, seg("v", 9999, -3, 9999, 3));
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(9999, 6);
  });

  it("borne le SEGMENT : la droite qui passe à côté ne croise rien", () => {
    expect(lineSegmentIntersections({ point: node("o", 0, 0), direction: { x: 1, y: 0 } }, seg("v", 4, 3, 4, 9))).toHaveLength(0);
  });

  it("renvoie un tableau vide pour une direction nulle", () => {
    expect(lineSegmentIntersections({ point: node("o", 0, 0), direction: { x: 0, y: 0 } }, seg("v", 4, -3, 4, 3))).toHaveLength(0);
  });
});

describe("segment / cercle", () => {
  it("renvoie les DEUX points d'une sécante traversant le cercle", () => {
    const found = segmentCircleIntersections(seg("h", -10, 0, 10, 0), circle("c", 0, 0, 5));
    expect(sortedPoints(found)).toEqual([
      { x: -5, y: 0 },
      { x: 5, y: 0 },
    ]);
  });

  it("renvoie UN point pour une tangente — pas deux points confondus", () => {
    // Droite y = 5 tangente au cercle de rayon 5 centré à l'origine, contact en (0, 5).
    const found = segmentCircleIntersections(seg("t", -10, 5, 10, 5), circle("c", 0, 0, 5));
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(0, 9);
    expect(found[0].y).toBeCloseTo(5, 9);
  });

  it("reconnaît la tangence quelle que soit l'échelle du dessin", () => {
    const found = segmentCircleIntersections(seg("t", -20000, 5000, 20000, 5000), circle("c", 0, 0, 5000));
    expect(found).toHaveLength(1);
    expect(found[0].y).toBeCloseTo(5000, 6);
  });

  it("ne croise pas un cercle qu'aucune portion de la droite n'atteint", () => {
    expect(segmentCircleIntersections(seg("h", -10, 9, 10, 9), circle("c", 0, 0, 5))).toHaveLength(0);
  });

  it("BORNE le segment : une corde dont un seul bout est atteint ne donne qu'un point", () => {
    // Le segment part du centre et sort du cercle : une seule des deux solutions lui appartient.
    const found = segmentCircleIntersections(seg("r", 0, 0, 10, 0), circle("c", 0, 0, 5));
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(5, 9);
  });

  it("ne retient rien quand le segment reste entièrement à l'intérieur du cercle", () => {
    expect(segmentCircleIntersections(seg("in", -1, 0, 1, 0), circle("c", 0, 0, 5))).toHaveLength(0);
  });

  it("renvoie un tableau vide pour un rayon nul ou négatif", () => {
    expect(segmentCircleIntersections(seg("h", -10, 0, 10, 0), circle("c", 0, 0, 0))).toHaveLength(0);
    expect(segmentCircleIntersections(seg("h", -10, 0, 10, 0), circle("c", 0, 0, -5))).toHaveLength(0);
  });
});

describe("cercle / cercle", () => {
  it("renvoie les deux points de deux cercles sécants", () => {
    // Rayons 5, centres distants de 6 → points à x = 3, y = ±4.
    expect(sortedPoints(circleCircleIntersections(circle("a", 0, 0, 5), circle("b", 6, 0, 5)))).toEqual([
      { x: 3, y: -4 },
      { x: 3, y: 4 },
    ]);
  });

  it("renvoie UN point pour une tangence EXTERNE", () => {
    const found = circleCircleIntersections(circle("a", 0, 0, 5), circle("b", 8, 0, 3));
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(5, 9);
    expect(found[0].y).toBeCloseTo(0, 9);
  });

  it("renvoie UN point pour une tangence INTERNE", () => {
    // Petit cercle de rayon 2 centré en (3, 0), inscrit dans le grand de rayon 5 : contact en (5, 0).
    const found = circleCircleIntersections(circle("a", 0, 0, 5), circle("b", 3, 0, 2));
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(5, 9);
    expect(found[0].y).toBeCloseTo(0, 9);
  });

  it("ne croise pas deux cercles disjoints", () => {
    expect(circleCircleIntersections(circle("a", 0, 0, 5), circle("b", 100, 0, 5))).toHaveLength(0);
  });

  it("ne croise pas un cercle strictement contenu dans l'autre", () => {
    expect(circleCircleIntersections(circle("a", 0, 0, 10), circle("b", 1, 0, 2))).toHaveLength(0);
  });

  it("ne renvoie AUCUN point pour deux cercles confondus — l'intersection y est continue", () => {
    expect(circleCircleIntersections(circle("a", 4, 4, 5), circle("b", 4, 4, 5))).toHaveLength(0);
  });

  it("ne croise pas deux cercles concentriques de rayons différents", () => {
    expect(circleCircleIntersections(circle("a", 0, 0, 5), circle("b", 0, 0, 9))).toHaveLength(0);
  });

  it("est symétrique : l'ordre des arguments ne change pas le résultat", () => {
    const direct = circleCircleIntersections(circle("a", 0, 0, 5), circle("b", 6, 0, 5));
    const inverse = circleCircleIntersections(circle("b", 6, 0, 5), circle("a", 0, 0, 5));
    expect(sortedPoints(direct)).toEqual(sortedPoints(inverse));
  });
});

describe("segment / arc et arc / arc", () => {
  const demiHaut = arc("haut", 0, 0, 5, 0, Math.PI);

  it("retient le croisement situé DANS le secteur balayé", () => {
    // La verticale coupe le cercle en (0, 5) et (0, -5) ; seul (0, 5) est sur le demi-arc haut.
    const found = segmentArcIntersections(seg("v", 0, -10, 0, 10), demiHaut);
    expect(found).toHaveLength(1);
    expect(found[0].y).toBeCloseTo(5, 9);
  });

  it("écarte le croisement du cercle PORTEUR situé hors du secteur", () => {
    const bas = arc("bas", 0, 0, 5, Math.PI, Math.PI * 2);
    const found = segmentArcIntersections(seg("v", 0, -10, 0, 10), bas);
    expect(found).toHaveLength(1);
    expect(found[0].y).toBeCloseTo(-5, 9);
  });

  it("ne retient rien quand la sécante ne rencontre que la portion non balayée", () => {
    // Quart d'arc dans le premier quadrant : la sécante horizontale y = -3 n'y touche pas.
    const quart = arc("q", 0, 0, 5, 0, Math.PI / 2);
    expect(segmentArcIntersections(seg("h", -10, -3, 10, -3), quart)).toHaveLength(0);
  });

  it("croise deux arcs seulement là où les DEUX secteurs se recouvrent", () => {
    // Cercles sécants en (3, 4) et (3, -4) ; les deux arcs ne couvrent que le demi-plan haut.
    const first = arc("a", 0, 0, 5, 0, Math.PI);
    const second = arc("b", 6, 0, 5, 0, Math.PI);
    const found = arcArcIntersections(first, second);
    expect(found).toHaveLength(1);
    expect(found[0].x).toBeCloseTo(3, 9);
    expect(found[0].y).toBeCloseTo(4, 9);
  });

  it("ne croise pas deux arcs dont les secteurs sont disjoints malgré des cercles sécants", () => {
    const haut = arc("a", 0, 0, 5, 0, Math.PI);
    const bas = arc("b", 6, 0, 5, Math.PI, Math.PI * 2);
    expect(arcArcIntersections(haut, bas)).toHaveLength(0);
  });

  it("restreint aussi les croisements arc / cercle entier au secteur de l'arc", () => {
    const found = arcCircleIntersections(demiHaut, circle("c", 6, 0, 5));
    expect(found).toHaveLength(1);
    expect(found[0].y).toBeCloseTo(4, 9);
  });

  it("gère la tangence d'un arc sans dupliquer le point de contact", () => {
    const found = segmentArcIntersections(seg("t", -10, 5, 10, 5), demiHaut);
    expect(found).toHaveLength(1);
    expect(found[0].y).toBeCloseTo(5, 9);
  });
});

describe("aiguillage générique", () => {
  const segment = { kind: "segment", id: "s1", entity: seg("s1", -10, 0, 10, 0) } as const;
  const disc = { kind: "circle", id: "c1", entity: circle("c1", 0, 0, 5) } as const;
  const bow = { kind: "arc", id: "a1", entity: arc("a1", 0, 0, 5, 0, Math.PI) } as const;

  it("donne le même résultat quel que soit l'ordre des deux entités", () => {
    for (const [first, second] of [
      [segment, disc],
      [segment, bow],
      [disc, bow],
    ] as const) {
      expect(sortedPoints(intersectionsBetween(first, second))).toEqual(sortedPoints(intersectionsBetween(second, first)));
    }
  });

  it("ne croise jamais une entité avec elle-même", () => {
    expect(intersectionsBetween(segment, segment)).toHaveLength(0);
    expect(intersectionsBetween(disc, disc)).toHaveLength(0);
  });

  it("couvre les six combinaisons sans lever", () => {
    for (const first of [segment, disc, bow]) {
      for (const second of [segment, disc, bow]) {
        expect(() => intersectionsBetween(first, second)).not.toThrow();
      }
    }
  });
});
