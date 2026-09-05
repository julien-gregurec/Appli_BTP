/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §13 — tests géométriques des intersections.
 *
 * Le contrat vérifié ici n'est pas « la formule est juste » (Engine B a ses propres tests)
 * mais « ce module ne ment jamais » : pas de NaN, pas d'exception, pas de point inventé sur un
 * couple à infinité de solutions, et un ordre qui ne dépend pas de l'ordre du tableau source.
 */

import { describe, expect, it } from "vitest";
import {
  arcBounds,
  buildIntersectionIndex,
  intersectionsNear,
  MIN_INTERSECTABLE_SIZE,
  sceneIntersections,
  type GeometryIntersection,
} from "./intersections";
import { point } from "./primitives";
import type { Arc, Circle, Segment } from "./primitives";
import type { HitTestScene } from "./hit-test";

function segment(id: string, x1: number, y1: number, x2: number, y2: number): Segment {
  return { id, start: point(`${id}-a`, x1, y1), end: point(`${id}-b`, x2, y2) };
}

function circle(id: string, x: number, y: number, radius: number): Circle {
  return { id, centre: point(`${id}-c`, x, y), radius };
}

function arc(id: string, x: number, y: number, radius: number, startAngle: number, endAngle: number, counterClockwise?: boolean): Arc {
  return { id, centre: point(`${id}-c`, x, y), radius, startAngle, endAngle, counterClockwise };
}

/** Toutes les intersections d'une scène, sans filtre de voisinage. */
function all(scene: HitTestScene): readonly GeometryIntersection[] {
  return sceneIntersections(scene);
}

function positions(found: readonly GeometryIntersection[]): { x: number; y: number }[] {
  return found.map((item) => ({ x: Math.round(item.position.x * 1e6) / 1e6, y: Math.round(item.position.y * 1e6) / 1e6 }));
}

function everyValueFinite(found: readonly GeometryIntersection[]): boolean {
  return found.every((item) => Number.isFinite(item.position.x) && Number.isFinite(item.position.y));
}

describe("intersections — segment / segment (§13)", () => {
  it("croisement en X : un point, au centre", () => {
    const found = all({ segments: [segment("a", -10, 0, 10, 0), segment("b", 0, -10, 0, 10)] });
    expect(positions(found)).toEqual([{ x: 0, y: 0 }]);
    expect(found[0].type).toBe("crossing");
    expect(found[0].tangent).toBe(false);
  });

  it("segments parallèles distincts : aucune intersection", () => {
    expect(all({ segments: [segment("a", 0, 0, 10, 0), segment("b", 0, 5, 10, 5)] })).toEqual([]);
  });

  it("extrémité commune : l'intersection est ce sommet partagé", () => {
    const found = all({ segments: [segment("a", 0, 0, 10, 0), segment("b", 10, 0, 10, 10)] });
    expect(positions(found)).toEqual([{ x: 10, y: 0 }]);
  });

  it("segments colinéaires superposés : zéro candidat, jamais un point arbitraire", () => {
    expect(all({ segments: [segment("a", 0, 0, 10, 0), segment("b", 5, 0, 15, 0)] })).toEqual([]);
  });

  it("segments colinéaires disjoints : zéro candidat", () => {
    expect(all({ segments: [segment("a", 0, 0, 10, 0), segment("b", 20, 0, 30, 0)] })).toEqual([]);
  });

  it("segment nul : écarté de l'index, donc jamais évalué", () => {
    const scene: HitTestScene = { segments: [segment("nul", 5, 5, 5, 5), segment("b", 0, 5, 10, 5)] };
    expect(buildIntersectionIndex(scene).entities.map((entity) => entity.key)).toEqual(["b"]);
    expect(all(scene)).toEqual([]);
  });

  it("segment plus court que le seuil : écarté sans lever", () => {
    const tiny = segment("court", 0, 0, MIN_INTERSECTABLE_SIZE / 10, 0);
    const scene: HitTestScene = { segments: [tiny], circles: [circle("c", 0, 0, 5)] };
    expect(() => all(scene)).not.toThrow();
    expect(all(scene)).toEqual([]);
  });

  it("croisement hors des bornes des segments : rien (l'intersection est mathématique, pas dessinée)", () => {
    expect(all({ segments: [segment("a", 0, 0, 1, 0), segment("b", 10, -5, 10, 5)] })).toEqual([]);
  });
});

describe("intersections — segment / cercle (§13)", () => {
  const disc = circle("cercle", 0, 0, 10);

  it("sécante : deux points", () => {
    const found = all({ segments: [segment("a", -20, 0, 20, 0)], circles: [disc] });
    expect(positions(found)).toEqual([{ x: -10, y: 0 }, { x: 10, y: 0 }]);
    expect(found.every((item) => item.type === "crossing")).toBe(true);
  });

  it("tangente : un point, marqué tangent", () => {
    const found = all({ segments: [segment("a", -20, 10, 20, 10)], circles: [disc] });
    expect(positions(found)).toEqual([{ x: 0, y: 10 }]);
    expect(found[0].tangent).toBe(true);
    expect(found[0].type).toBe("tangent");
  });

  it("extérieure : aucune intersection", () => {
    expect(all({ segments: [segment("a", -20, 30, 20, 30)], circles: [disc] })).toEqual([]);
  });

  it("corde bornée : seul le point réellement sur le segment est retenu", () => {
    const found = all({ segments: [segment("a", 0, 0, 20, 0)], circles: [disc] });
    expect(positions(found)).toEqual([{ x: 10, y: 0 }]);
  });
});

describe("intersections — cercle / cercle (§13)", () => {
  it("séparés : aucune intersection", () => {
    expect(all({ circles: [circle("a", 0, 0, 5), circle("b", 100, 0, 5)] })).toEqual([]);
  });

  it("sécants : deux points symétriques", () => {
    const found = all({ circles: [circle("a", 0, 0, 10), circle("b", 10, 0, 10)] });
    expect(found).toHaveLength(2);
    expect(found.map((item) => Math.round(item.position.x * 1e6) / 1e6)).toEqual([5, 5]);
    expect(found.map((item) => Math.round(item.position.y))).toContain(9);
    expect(found.map((item) => Math.round(item.position.y))).toContain(-9);
  });

  it("tangents extérieurement : un point, marqué tangent", () => {
    const found = all({ circles: [circle("a", 0, 0, 10), circle("b", 20, 0, 10)] });
    expect(positions(found)).toEqual([{ x: 10, y: 0 }]);
    expect(found[0].tangent).toBe(true);
  });

  it("tangents intérieurement : un point, marqué tangent", () => {
    const found = all({ circles: [circle("a", 0, 0, 10), circle("b", 5, 0, 5)] });
    expect(positions(found)).toEqual([{ x: 10, y: 0 }]);
    expect(found[0].tangent).toBe(true);
  });

  it("concentriques de rayons différents : zéro candidat", () => {
    expect(all({ circles: [circle("a", 0, 0, 10), circle("b", 0, 0, 4)] })).toEqual([]);
  });

  it("identiques (infinité d'intersections) : zéro candidat, jamais un point inventé", () => {
    expect(all({ circles: [circle("a", 0, 0, 10), circle("b", 0, 0, 10)] })).toEqual([]);
  });

  it("rayon nul ou invalide : écarté de l'index", () => {
    const scene: HitTestScene = {
      circles: [circle("nul", 0, 0, 0), circle("nan", 0, 0, Number.NaN), circle("ok", 0, 0, 10)],
    };
    expect(buildIntersectionIndex(scene).entities.map((entity) => entity.key)).toEqual(["ok"]);
    expect(all(scene)).toEqual([]);
  });
});

describe("intersections — arcs (§13)", () => {
  it("arc / segment dans le balayage : le point est retenu", () => {
    const found = all({ arcs: [arc("demi", 0, 0, 10, 0, Math.PI)], segments: [segment("a", -20, 5, 20, 5)] });
    expect(found).toHaveLength(2);
    expect(found.every((item) => Math.round(item.position.y) === 5)).toBe(true);
  });

  it("arc / segment hors du balayage : intersection mathématique ignorée", () => {
    // Le demi-cercle supérieur ne descend jamais à y = -5, alors que son cercle porteur si.
    expect(all({ arcs: [arc("demi", 0, 0, 10, 0, Math.PI)], segments: [segment("a", -20, -5, 20, -5)] })).toEqual([]);
  });

  it("arc / cercle : seuls les points du secteur balayé sortent", () => {
    const quarter = arc("quart", 0, 0, 10, 0, Math.PI / 2);
    const found = all({ arcs: [quarter], circles: [circle("c", 10, 10, 10)] });
    expect(found.every((item) => item.position.x >= -1e-9 && item.position.y >= -1e-9)).toBe(true);
    expect(everyValueFinite(found)).toBe(true);
  });

  it("arc / arc : croisement réel de deux demi-cercles", () => {
    const found = all({ arcs: [arc("a", 0, 0, 10, 0, Math.PI), arc("b", 10, 0, 10, 0, Math.PI)] });
    expect(found).toHaveLength(1);
    expect(Math.round(found[0].position.x * 1e6) / 1e6).toBe(5);
    expect(Math.round(found[0].position.y)).toBe(9);
  });

  it("arc / arc portés par le même cercle : zéro candidat (infinité de solutions)", () => {
    expect(all({ arcs: [arc("a", 0, 0, 10, 0, Math.PI), arc("b", 0, 0, 10, Math.PI / 4, Math.PI / 2)] })).toEqual([]);
  });

  it("arc / arc tangents : un point, marqué tangent", () => {
    const found = all({ arcs: [arc("a", 0, 0, 10, -Math.PI / 2, Math.PI / 2), arc("b", 20, 0, 10, Math.PI / 2, (3 * Math.PI) / 2)] });
    expect(positions(found)).toEqual([{ x: 10, y: 0 }]);
    expect(found[0].tangent).toBe(true);
  });

  it("arc / segment tangent : le drapeau tangent survit au filtrage du secteur", () => {
    // Engine B ramène ce résultat à « un point » une fois le secteur filtré ; la tangence est
    // reconstituée ici à partir des cercles porteurs, sans modifier Engine B.
    const found = all({ arcs: [arc("demi", 0, 0, 10, 0, Math.PI)], segments: [segment("t", -20, 10, 20, 10)] });
    expect(positions(found)).toEqual([{ x: 0, y: 10 }]);
    expect(found[0].tangent).toBe(true);
  });

  it("arc / cercle tangents : un point, marqué tangent", () => {
    const found = all({ arcs: [arc("a", 0, 0, 10, -Math.PI / 4, Math.PI / 4)], circles: [circle("c", 20, 0, 10)] });
    expect(positions(found)).toEqual([{ x: 10, y: 0 }]);
    expect(found[0].tangent).toBe(true);
  });

  it("un croisement franc n'est jamais annoncé tangent", () => {
    const found = all({ arcs: [arc("demi", 0, 0, 10, 0, Math.PI)], segments: [segment("s", -20, 5, 20, 5)] });
    expect(found.every((item) => item.tangent === false && item.type === "crossing")).toBe(true);
  });

  it("arc horaire : le balayage est lu dans son sens de parcours", () => {
    // Même géométrie que le demi-cercle supérieur, décrite dans l'autre sens : le point
    // retenu doit être celui du secteur INFÉRIEUR.
    const found = all({ arcs: [arc("bas", 0, 0, 10, 0, Math.PI, false)], segments: [segment("a", -20, -5, 20, -5)] });
    expect(found).toHaveLength(2);
    expect(found.every((item) => Math.round(item.position.y) === -5)).toBe(true);
  });

  it("angles non finis : arc écarté de l'index", () => {
    const scene: HitTestScene = { arcs: [arc("nan", 0, 0, 10, Number.NaN, Math.PI)], circles: [circle("c", 0, 0, 10)] };
    expect(buildIntersectionIndex(scene).entities.map((entity) => entity.key)).toEqual(["c"]);
  });

  it("boîte englobante d'un arc : bornée au secteur réel, pas au cercle porteur", () => {
    const bounds = arcBounds(arc("quart", 0, 0, 10, 0, Math.PI / 2));
    expect(Math.round(bounds.minX)).toBe(0);
    expect(Math.round(bounds.minY)).toBe(0);
    expect(Math.round(bounds.maxX)).toBe(10);
    expect(Math.round(bounds.maxY)).toBe(10);
  });
});

describe("intersections — contours et polylignes", () => {
  it("un pentagramme publie les croisements de ses propres arêtes", () => {
    const outer = Array.from({ length: 5 }, (_, index) => {
      const angle = Math.PI / 2 + (index * 4 * Math.PI) / 5;
      return point(`s${index}`, 100 * Math.cos(angle), 100 * Math.sin(angle));
    });
    const found = all({ polygons: [{ id: "etoile", points: outer }] });
    // Dix points : les cinq croisements internes du pentagramme, plus les cinq sommets
    // partagés par deux arêtes consécutives. Ces derniers coïncident avec des extrémités
    // existantes ; c'est l'accrochage qui les fusionnera (§5), pas ce module.
    expect(found).toHaveLength(10);
    expect(found.every((item) => item.entityAId === "etoile" && item.entityBId === "etoile")).toBe(true);
    expect(found.every((item) => item.entityAKey !== item.entityBKey)).toBe(true);
    expect(everyValueFinite(found)).toBe(true);

    // Les cinq croisements internes sont strictement à l'intérieur du cercle circonscrit.
    const inner = found.filter((item) => Math.hypot(item.position.x, item.position.y) < 99);
    expect(inner).toHaveLength(5);
  });

  it("une arête n'est jamais croisée avec elle-même", () => {
    const found = all({ polygons: [{ id: "carre", points: [point("a", 0, 0), point("b", 10, 0), point("c", 10, 10), point("d", 0, 10)] }] });
    // Les arêtes adjacentes partagent un sommet : ce sont de vraies intersections, mais aucune
    // arête ne se croise elle-même.
    expect(found.every((item) => item.entityAKey !== item.entityBKey)).toBe(true);
  });

  it("polyligne ouverte : la dernière arête ne se referme pas sur la première", () => {
    const index = buildIntersectionIndex({ polylines: [{ id: "pl", points: [point("a", 0, 0), point("b", 10, 0), point("c", 10, 10)] }] });
    expect(index.entities.map((entity) => entity.key)).toEqual(["pl#0", "pl#1"]);
  });
});

describe("intersections — déterminisme et voisinage (§4/§6)", () => {
  const base: HitTestScene = {
    segments: [segment("h", -50, 0, 50, 0), segment("v", 0, -50, 0, 50), segment("d", -50, -50, 50, 50)],
    circles: [circle("c", 0, 0, 20)],
  };

  it("l'ordre du résultat ne dépend pas de l'ordre du tableau source", () => {
    const reversed: HitTestScene = {
      segments: [...(base.segments ?? [])].reverse(),
      circles: base.circles,
    };
    expect(all(base)).toEqual(all(reversed));
  });

  it("aucune valeur non finie sur une scène chargée", () => {
    expect(everyValueFinite(all(base))).toBe(true);
  });

  it("intersectionsNear ne rend que ce qui est dans le rayon", () => {
    const near = intersectionsNear(base, { x: 20, y: 0 }, 1);
    expect(near).toHaveLength(1);
    expect(Math.round(near[0].position.x)).toBe(20);
  });

  it("intersectionsNear est un sous-ensemble exact du balayage complet", () => {
    const near = intersectionsNear(base, { x: 0, y: 0 }, 0.5);
    const exhaustive = all(base).filter((item) => Math.hypot(item.position.x, item.position.y) <= 0.5);
    expect(near).toEqual(exhaustive);
  });

  it("rayon nul, négatif ou non fini : aucun candidat, aucun calcul", () => {
    expect(intersectionsNear(base, { x: 0, y: 0 }, 0)).toEqual([]);
    expect(intersectionsNear(base, { x: 0, y: 0 }, -5)).toEqual([]);
    expect(intersectionsNear(base, { x: 0, y: 0 }, Number.NaN)).toEqual([]);
  });

  it("cible non finie : aucun candidat", () => {
    expect(intersectionsNear(base, { x: Number.NaN, y: 0 }, 10)).toEqual([]);
  });

  it("scène vide ou à une seule entité : aucun candidat", () => {
    expect(all({})).toEqual([]);
    expect(all({ circles: [circle("seul", 0, 0, 10)] })).toEqual([]);
    expect(intersectionsNear({ circles: [circle("seul", 0, 0, 10)] }, { x: 10, y: 0 }, 5)).toEqual([]);
  });
});
