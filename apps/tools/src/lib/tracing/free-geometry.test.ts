/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §13 — contrat et validation du tracé libre.
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_FREE_GEOMETRY,
  FREE_COORDINATE_LIMIT_MM,
  FREE_GEOMETRY_VERSION,
  FreeGeometryError,
  MAX_FREE_ENTITIES,
  MAX_FREE_POLYLINE_VERTICES,
  addFreeEntity,
  countFreeEntitiesByKind,
  countFreeVertices,
  createFreeEntity,
  deletableFreeEntityIds,
  findFreeEntity,
  freeEntityLength,
  freeGeometryBounds,
  freeGeometryIsEmpty,
  freeGeometryLength,
  insertFreeEntities,
  moveFreeVertex,
  nextFreeEntityId,
  removeFreeEntities,
  validateFreeGeometry,
  type FreeEntity,
  type FreeGeometry,
} from "./free-geometry";

function geometryOf(...entities: FreeEntity[]): FreeGeometry {
  return validateFreeGeometry({ version: FREE_GEOMETRY_VERSION, entities });
}

const POINT: FreeEntity = { id: "pt-1", kind: "point", points: [{ x: 100, y: 200 }] };
const SEGMENT: FreeEntity = {
  id: "sg-1",
  kind: "segment",
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 400 },
  ],
};
const POLYLINE: FreeEntity = {
  id: "pl-1",
  kind: "polyline",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ],
};

describe("validateFreeGeometry (§13)", () => {
  it("accepte les quatre primitives libres", () => {
    const geometry = geometryOf(POINT, SEGMENT, POLYLINE);
    expect(geometry.entities).toHaveLength(3);
    expect(countFreeVertices(geometry)).toBe(6);
    expect(countFreeEntitiesByKind(geometry)).toEqual({ point: 1, segment: 1, polyline: 1, polygon: 0 });
  });

  it("refuse NaN et Infinity", () => {
    expect(() => geometryOf({ id: "pt-1", kind: "point", points: [{ x: Number.NaN, y: 0 }] })).toThrow(FreeGeometryError);
    expect(() => geometryOf({ id: "pt-1", kind: "point", points: [{ x: 0, y: Number.POSITIVE_INFINITY }] })).toThrow(
      FreeGeometryError,
    );
  });

  it("refuse une coordonnée hors des limites du tracé", () => {
    expect(() =>
      geometryOf({ id: "pt-1", kind: "point", points: [{ x: FREE_COORDINATE_LIMIT_MM + 1, y: 0 }] }),
    ).toThrow(/limites/);
  });

  it("refuse des identifiants dupliqués", () => {
    expect(() => geometryOf(POINT, { ...POINT })).toThrow(/deux entités/);
  });

  it("refuse une polyligne de moins de deux sommets", () => {
    expect(() => geometryOf({ id: "pl-1", kind: "polyline", points: [{ x: 0, y: 0 }] })).toThrow(/au moins deux/);
  });

  it("refuse un segment qui n'a pas exactement deux sommets", () => {
    expect(() => geometryOf({ id: "sg-1", kind: "segment", points: [{ x: 0, y: 0 }] })).toThrow(/exactement deux/);
    expect(() =>
      geometryOf({
        id: "sg-1",
        kind: "segment",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      }),
    ).toThrow(/exactement deux/);
  });

  it("refuse un segment de longueur nulle", () => {
    expect(() =>
      geometryOf({
        id: "sg-1",
        kind: "segment",
        points: [
          { x: 10, y: 10 },
          { x: 10, y: 10 },
        ],
      }),
    ).toThrow(/longueur nulle/);
  });

  it("refuse une nature de primitive hors du lot (cercle, arc, texte)", () => {
    expect(() => geometryOf({ id: "c-1", kind: "circle" as never, points: [{ x: 0, y: 0 }] })).toThrow(/n'existe pas/);
  });

  it("refuse un document dont la version est plus récente", () => {
    expect(() => validateFreeGeometry({ version: FREE_GEOMETRY_VERSION + 1, entities: [] })).toThrow(/plus récente/);
  });

  it("borne le nombre de sommets d'une polyligne", () => {
    const points = Array.from({ length: MAX_FREE_POLYLINE_VERTICES + 1 }, (_, index) => ({ x: index, y: 0 }));
    expect(() => geometryOf({ id: "pl-1", kind: "polyline", points })).toThrow(/dépasse/);
  });

  it("borne le nombre d'entités", () => {
    const entities = Array.from({ length: MAX_FREE_ENTITIES + 1 }, (_, index) => ({
      id: `pt-${index + 1}`,
      kind: "point" as const,
      points: [{ x: index, y: 0 }],
    }));
    expect(() => validateFreeGeometry({ version: FREE_GEOMETRY_VERSION, entities })).toThrow(/dépasse/);
  });

  it("laisse passer le repère de charge du lot (§16)", () => {
    const entities: FreeEntity[] = [];
    for (let index = 0; index < 100; index += 1) {
      entities.push({ id: `pt-${index + 1}`, kind: "point", points: [{ x: index * 10, y: 0 }] });
      entities.push({
        id: `sg-${index + 1}`,
        kind: "segment",
        points: [
          { x: index * 10, y: 100 },
          { x: index * 10 + 50, y: 200 },
        ],
      });
    }
    entities.push({
      id: "pl-1",
      kind: "polyline",
      points: Array.from({ length: 100 }, (_, index) => ({ x: index * 5, y: 300 })),
    });
    const geometry = validateFreeGeometry({ version: FREE_GEOMETRY_VERSION, entities });
    expect(geometry.entities).toHaveLength(201);
    expect(countFreeVertices(geometry)).toBe(400);
  });
});

describe("identifiants (§13)", () => {
  it("attribue des identifiants déterministes par nature", () => {
    expect(nextFreeEntityId(EMPTY_FREE_GEOMETRY, "point")).toBe("pt-1");
    expect(nextFreeEntityId(EMPTY_FREE_GEOMETRY, "segment")).toBe("sg-1");
    expect(nextFreeEntityId(EMPTY_FREE_GEOMETRY, "polyline")).toBe("pl-1");
    expect(nextFreeEntityId(geometryOf(POINT, SEGMENT), "point")).toBe("pt-2");
  });

  it("réattribue un identifiant libéré, sans jamais permettre de doublon", () => {
    const geometry = geometryOf(
      { id: "sg-1", kind: "segment", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
      { id: "sg-2", kind: "segment", points: [{ x: 0, y: 0 }, { x: 20, y: 20 }] },
    );
    const { geometry: after, removed } = removeFreeEntities(geometry, ["sg-2"]);
    // Le numéro libéré est repris : c'est sans danger parce que l'historique se dépile en
    // LIFO (cf. le commentaire de `nextFreeEntityId`).
    expect(nextFreeEntityId(after, "segment")).toBe("sg-2");
    // Et si les deux devaient malgré tout coexister, la restauration REFUSE plutôt que de
    // produire un document à identifiants dupliqués.
    const reused = addFreeEntity(after, {
      id: "sg-2",
      kind: "segment",
      points: [{ x: 5, y: 5 }, { x: 30, y: 30 }],
    });
    expect(() => insertFreeEntities(reused, removed)).toThrow(/deux entités/);
  });
});

describe("mutations (§7/§8/§9)", () => {
  it("ajoute une entité en fin de liste", () => {
    const geometry = addFreeEntity(geometryOf(POINT), SEGMENT);
    expect(geometry.entities.map((entity) => entity.id)).toEqual(["pt-1", "sg-1"]);
  });

  it("refuse un identifiant déjà pris", () => {
    expect(() => addFreeEntity(geometryOf(POINT), { ...POINT })).toThrow(/existe déjà/);
  });

  it("déplace un sommet en écrivant la position telle quelle", () => {
    const moved = moveFreeVertex(geometryOf(SEGMENT), "sg-1", 1, { x: 42.5, y: -17 });
    expect(findFreeEntity(moved, "sg-1")?.points[1]).toEqual({ x: 42.5, y: -17 });
    // Le premier sommet n'a pas bougé : le déplacement est local, jamais une reconstruction.
    expect(findFreeEntity(moved, "sg-1")?.points[0]).toEqual({ x: 0, y: 0 });
  });

  it("refuse de déplacer un sommet qui n'existe pas", () => {
    expect(() => moveFreeVertex(geometryOf(SEGMENT), "sg-1", 5, { x: 0, y: 0 })).toThrow(/n'existe pas/);
    expect(() => moveFreeVertex(geometryOf(SEGMENT), "sg-9", 0, { x: 0, y: 0 })).toThrow(/ne contient pas/);
  });

  it("refuse un déplacement qui rendrait un segment nul", () => {
    expect(() => moveFreeVertex(geometryOf(SEGMENT), "sg-1", 1, { x: 0, y: 0 })).toThrow(/longueur nulle/);
  });

  it("supprime et restaure les entités à leur rang d'origine", () => {
    const geometry = geometryOf(POINT, SEGMENT, POLYLINE);
    const { geometry: after, removed } = removeFreeEntities(geometry, ["sg-1"]);
    expect(after.entities.map((entity) => entity.id)).toEqual(["pt-1", "pl-1"]);
    expect(removed).toEqual([{ index: 1, entity: SEGMENT }]);
    expect(insertFreeEntities(after, removed).entities.map((entity) => entity.id)).toEqual(["pt-1", "sg-1", "pl-1"]);
  });

  it("restaure plusieurs entités dans le bon ordre", () => {
    const geometry = geometryOf(POINT, SEGMENT, POLYLINE);
    const { geometry: after, removed } = removeFreeEntities(geometry, ["pt-1", "pl-1"]);
    expect(after.entities.map((entity) => entity.id)).toEqual(["sg-1"]);
    expect(insertFreeEntities(after, removed).entities.map((entity) => entity.id)).toEqual(["pt-1", "sg-1", "pl-1"]);
  });

  it("ignore les identifiants inconnus à la suppression", () => {
    const geometry = geometryOf(POINT);
    const { geometry: after, removed } = removeFreeEntities(geometry, ["inconnu"]);
    expect(removed).toHaveLength(0);
    expect(after).toBe(geometry);
  });
});

describe("garde-fou de suppression (§8)", () => {
  it("ne retient d'une sélection que ce qui appartient au tracé libre", () => {
    const geometry = geometryOf(POINT, SEGMENT);
    // « rosette-6-petal-2 » est une primitive DÉRIVÉE d'Engine B : elle ne peut pas être
    // supprimée, et ce filtre est la seule porte par laquelle une suppression passe.
    expect(deletableFreeEntityIds(geometry, ["sg-1", "rosette-6-petal-2", "pt-1"])).toEqual(["sg-1", "pt-1"]);
    expect(deletableFreeEntityIds(geometry, ["rosette-6-petal-2"])).toEqual([]);
  });
});

describe("mesures (§11)", () => {
  it("mesure un développé, et donne zéro pour un point", () => {
    expect(freeEntityLength(SEGMENT)).toBeCloseTo(500, 6);
    expect(freeEntityLength(POLYLINE)).toBeCloseTo(200, 6);
    expect(freeEntityLength(POINT)).toBe(0);
    expect(freeGeometryLength(geometryOf(POINT, SEGMENT, POLYLINE))).toBeCloseTo(700, 6);
  });

  it("calcule des bornes réelles, et rien quand le tracé est vide", () => {
    expect(freeGeometryBounds(geometryOf(SEGMENT, POINT))).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 400 });
    expect(freeGeometryBounds(EMPTY_FREE_GEOMETRY)).toBeNull();
    expect(freeGeometryIsEmpty(EMPTY_FREE_GEOMETRY)).toBe(true);
    expect(freeGeometryIsEmpty(geometryOf(POINT))).toBe(false);
  });
});

describe("createFreeEntity", () => {
  it("valide à la création plutôt qu'à l'insertion", () => {
    expect(() => createFreeEntity("segment", [{ x: 0, y: 0 }], "sg-1")).toThrow(/exactement deux/);
    expect(createFreeEntity("point", [{ x: 1, y: 2 }], "pt-1")).toEqual({
      id: "pt-1",
      kind: "point",
      points: [{ x: 1, y: 2 }],
    });
  });
});
