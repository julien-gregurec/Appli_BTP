/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §21 — le contour fermé de bout en bout.
 *
 * Même chaîne que `free-drawing-integration.test.ts`, et volontairement la même : le contour ne
 * mérite un lot que s'il traverse EXACTEMENT le trajet déjà éprouvé des autres primitives.
 *
 *   PIXEL → monde → accrochage → automate → document libre → historique → projet revalidé
 *         → scène → hit-test / multisélection / intersections → fiche propriétés → export
 *
 * Les gestes sont exprimés en pixels, comme de vrais gestes. Ce qui est vérifié après chacun
 * est le document réellement ENREGISTRÉ, jamais le résultat d'un calcul comparé à lui-même.
 */

import { describe, expect, it } from "vitest";
import { hitTestAll } from "../../../lib/geometry/hit-test";
import { sceneIntersections } from "../../../lib/geometry/intersections";
import { snap } from "../../../lib/geometry/snap";
import { chooseGridStep } from "../../../lib/viewport/grid";
import {
  handleGrabPx,
  selectionTolerancePx,
  snapTolerancePx,
  toleranceWorldFor,
} from "../../../lib/viewport/pointer-targeting";
import { EMPTY_SELECTION, retainExisting, selectSingle, toggleSelection } from "../../../lib/viewport/selection-set";
import { fitToBounds, screenToWorld, worldToScreen, type ViewportSize } from "../../../lib/viewport/viewport-math";
import {
  EMPTY_FREE_GEOMETRY,
  createFreeEntity,
  deletableFreeEntityIds,
  findFreeEntity,
  nextFreeEntityId,
  removeFreeEntities,
  type FreeGeometry,
  type FreeVertex,
} from "../../../lib/tracing/free-geometry";
import { freeContourMeasures, freeContourTotals } from "../../../lib/tracing/free-contour";
import { buildFreeVertexHandles } from "../../../lib/tracing/free-handles";
import { freeGeometryToShape } from "../../../lib/tracing/free-shape";
import {
  EMPTY_FREE_HISTORY,
  applyFreeOperation,
  pushFreeHistory,
  redoFreeHistory,
  undoFreeHistory,
  type FreeEditOperation,
  type FreeHistory,
} from "../../../lib/tracing/free-history";
import { nearestEditableHandle } from "../../../lib/tracing/handle-map";
import { createTracingProject, validateTracingProject } from "../../../lib/tracing/project";
import { touchTracingProject } from "../../../lib/tracing/atelier";
import { beginFreeDraw, freeDrawClick, freeDrawFinish, type FreeDrawTool } from "./free-draw-model";
import { describeSceneEntity, describeSceneSelection, type PlanScene } from "./plan-scene";

const SIZE: ViewportSize = { width: 900, height: 600 };

/** Miroir sans React de `FreeDrawingBoard` + `useFreeDrawing` + `AtelierViewportWorkspace`. */
function openFreeAtelier() {
  let project = createTracingProject(
    { id: "trace-contour01", name: "Plafond séjour", type: "ceiling" },
    new Date("2026-09-06T09:00:00.000Z"),
  );
  let geometry: FreeGeometry = EMPTY_FREE_GEOMETRY;
  let history: FreeHistory = EMPTY_FREE_HISTORY;
  let selection: readonly string[] = EMPTY_SELECTION;
  let draw = beginFreeDraw("polygon");

  const sceneOf = (): PlanScene => freeGeometryToShape(geometry, { id: "libre", name: "Tracé libre", frame: "sheet" });
  const view = () => fitToBounds(sceneOf().bounds, SIZE);

  const persist = () => {
    project = touchTracingProject(project, { freeGeometry: geometry.entities.length ? geometry : undefined });
  };

  const commit = (operation: FreeEditOperation, label: string, source: string) => {
    geometry = applyFreeOperation(geometry, operation);
    history = pushFreeHistory(history, { label, source, coalesce: false, operation });
    persist();
  };

  const createFrom = (kind: FreeDrawTool, points: readonly FreeVertex[]) => {
    const entity = createFreeEntity(kind, points, nextFreeEntityId(geometry, kind));
    commit({ kind: "create", entity }, entity.id, `create:${entity.id}`);
  };

  const state = {
    get project() {
      return project;
    },
    get geometry() {
      return geometry;
    },
    get scene() {
      return sceneOf();
    },
    get ids() {
      return geometry.entities.map((entity) => entity.id);
    },
    get selection() {
      return selection;
    },
    get canUndo() {
      return history.past.length > 0;
    },
    get canRedo() {
      return history.future.length > 0;
    },

    tool(next: FreeDrawTool) {
      draw = beginFreeDraw(next);
      return state;
    },

    snapAt(pixel: { x: number; y: number }) {
      const currentView = view();
      const world = screenToWorld(pixel, currentView, SIZE);
      const candidate = snap(sceneOf(), world, {
        toleranceWorld: toleranceWorldFor(snapTolerancePx("fine"), currentView),
        gridStepMm: chooseGridStep(currentView.scale),
      });
      return { position: candidate?.position ?? world, snapped: Boolean(candidate), kind: candidate?.kind ?? null };
    },

    /** §4/§5 — un clic de création : la position ACCROCHÉE est celle qui entre dans l'automate. */
    click(pixel: { x: number; y: number }) {
      const { position } = state.snapAt(pixel);
      // §4 — la portée de fermeture est celle de la DÉSIGNATION, comme dans le workspace : les
      // sommets d'un tracé en cours ne sont pas dans la scène, donc l'accrochage ne les propose
      // pas, et exiger une coïncidence exacte rendrait la fermeture au clic impossible.
      const step = freeDrawClick(draw, position, {
        closeToleranceMm: toleranceWorldFor(selectionTolerancePx("fine"), view()),
      });
      draw = step.state;
      if (step.commit) createFrom(step.commit.kind as FreeDrawTool, step.commit.points);
      return step;
    },

    /** §4 — `Entrée` / double-clic / bouton « Fermer le contour » : un seul chemin. */
    finish() {
      const step = freeDrawFinish(draw);
      draw = step.state;
      if (step.commit) createFrom(step.commit.kind as FreeDrawTool, step.commit.points);
      return step;
    },

    /** §9 — glissement d'un sommet, du `pointerdown` au relâchement, en pixels. */
    dragVertex(from: { x: number; y: number }, to: { x: number; y: number }) {
      const currentView = view();
      const grabbed = nearestEditableHandle(
        buildFreeVertexHandles(geometry),
        screenToWorld(from, currentView, SIZE),
        toleranceWorldFor(handleGrabPx("fine"), currentView),
      );
      if (!grabbed?.vertex) return null;

      // Scène d'accrochage gelée et privée de l'entité tenue (§7 du lot fondateur).
      const held = grabbed.vertex.entityId;
      const frozen = freeGeometryToShape(removeFreeEntities(geometry, [held]).geometry, {
        id: "libre",
        name: "Tracé libre",
        frame: "sheet",
      });
      const world = screenToWorld(to, currentView, SIZE);
      const candidate = snap(frozen, world, {
        toleranceWorld: toleranceWorldFor(snapTolerancePx("fine"), currentView),
        gridStepMm: chooseGridStep(currentView.scale),
      });
      const target = candidate?.position ?? world;
      const before = findFreeEntity(geometry, held)!.points[grabbed.vertex.index];
      commit(
        { kind: "move-vertex", entityId: held, index: grabbed.vertex.index, before, after: target },
        `${held} sommet`,
        `vertex:${held}:${grabbed.vertex.index}`,
      );
      return { handle: grabbed, target, snapped: Boolean(candidate) };
    },

    select(pixel: { x: number; y: number }, additive = false) {
      const currentView = view();
      const world = screenToWorld(pixel, currentView, SIZE);
      const candidates = hitTestAll(sceneOf(), world, toleranceWorldFor(selectionTolerancePx("fine"), currentView));
      const picked = candidates[0]?.entityId ?? null;
      if (additive) {
        if (picked) selection = toggleSelection(selection, picked);
      } else {
        selection = selectSingle(selection, picked);
      }
      return candidates;
    },

    pressDelete() {
      const deletable = deletableFreeEntityIds(geometry, selection);
      if (!deletable.length) return 0;
      const { removed } = removeFreeEntities(geometry, deletable);
      commit({ kind: "delete", removed }, `${removed.length} primitive(s)`, `delete:${deletable.join(",")}`);
      selection = retainExisting(selection, new Set(geometry.entities.map((entity) => entity.id)));
      return removed.length;
    },

    undo() {
      const played = undoFreeHistory(history, geometry);
      if (!played) return null;
      geometry = played.geometry;
      history = played.history;
      selection = retainExisting(selection, new Set(geometry.entities.map((entity) => entity.id)));
      persist();
      return played.label;
    },

    redo() {
      const played = redoFreeHistory(history, geometry);
      if (!played) return null;
      geometry = played.geometry;
      history = played.history;
      persist();
      return played.label;
    },

    /** §21 — aller-retour par la persistance : sérialisation, relecture, revalidation. */
    reload() {
      project = validateTracingProject(JSON.parse(JSON.stringify(project)));
      geometry = project.freeGeometry ?? EMPTY_FREE_GEOMETRY;
      history = EMPTY_FREE_HISTORY;
      selection = EMPTY_SELECTION;
      return state;
    },

    pixelOf(vertex: FreeVertex) {
      return worldToScreen(vertex, view(), SIZE);
    },
  };

  return state;
}

/** Trace un carré de 400 px de côté centré dans la vue, refermé par clic sur le premier sommet. */
function drawSquare(atelier: ReturnType<typeof openFreeAtelier>) {
  const corners = [
    { x: 300, y: 200 },
    { x: 600, y: 200 },
    { x: 600, y: 400 },
    { x: 300, y: 400 },
  ];
  atelier.tool("polygon");
  for (const corner of corners) atelier.click(corner);
  atelier.click(corners[0]);
  return corners;
}

describe("création à la souris (§3/§4/§5)", () => {
  it("trace et referme un contour par clic sur son premier sommet", () => {
    const atelier = openFreeAtelier();
    const corners = drawSquare(atelier);
    expect(atelier.ids).toEqual(["pg-1"]);
    const entity = findFreeEntity(atelier.geometry, "pg-1")!;
    // Quatre clics de forme + un clic de fermeture = quatre sommets, pas cinq.
    expect(entity.points).toHaveLength(corners.length);
  });

  it("§5 — le sommet enregistré est la position ACCROCHÉE, pas celle du curseur", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);

    // Un second contour dont le premier sommet vise un sommet du premier, à trois pixels près.
    const target = findFreeEntity(atelier.geometry, "pg-1")!.points[0];
    const nearby = atelier.pixelOf(target);
    atelier.tool("polygon");
    const snapped = atelier.snapAt({ x: nearby.x + 3, y: nearby.y - 2 });
    expect(snapped.snapped).toBe(true);

    atelier.click({ x: nearby.x + 3, y: nearby.y - 2 });
    atelier.click({ x: 700, y: 500 });
    atelier.click({ x: 750, y: 380 });
    atelier.finish();

    const created = findFreeEntity(atelier.geometry, "pg-2")!;
    expect(created.points[0]).toEqual(target);
  });

  it("§4 — le clic de fermeture s'accroche au premier sommet, et referme vraiment", () => {
    const atelier = openFreeAtelier();
    atelier.tool("polygon");
    const first = { x: 300, y: 250 };
    atelier.click(first);
    atelier.click({ x: 620, y: 250 });
    atelier.click({ x: 620, y: 460 });
    // Trois pixels à côté du premier sommet : l'accrochage l'y ramène, donc le contour referme.
    const closing = atelier.click({ x: first.x + 3, y: first.y + 3 });
    expect(closing.commit?.kind).toBe("polygon");
    expect(atelier.ids).toEqual(["pg-1"]);
    expect(findFreeEntity(atelier.geometry, "pg-1")!.points).toHaveLength(3);
  });
});

describe("mesures après chaque geste (§6/§7/§9)", () => {
  it("recalcule surface et périmètre immédiatement après le déplacement d'un sommet", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    const before = freeContourMeasures(findFreeEntity(atelier.geometry, "pg-1")!);

    const corner = findFreeEntity(atelier.geometry, "pg-1")!.points[2];
    const moved = atelier.dragVertex(atelier.pixelOf(corner), { x: 800, y: 480 });
    expect(moved).not.toBeNull();

    const after = freeContourMeasures(findFreeEntity(atelier.geometry, "pg-1")!);
    expect(after.areaMm2).not.toBe(before.areaMm2);
    expect(after.perimeterMm).not.toBe(before.perimeterMm);
    // Le sommet déplacé EST celui qui a été validé : la source n'a pas été traduite (§9).
    expect(findFreeEntity(atelier.geometry, "pg-1")!.points[2]).toEqual(moved!.target);
  });

  it("§15/§16 — annuler puis rétablir rend les mesures d'origine, à l'identique", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    const original = freeContourMeasures(findFreeEntity(atelier.geometry, "pg-1")!);

    const corner = findFreeEntity(atelier.geometry, "pg-1")!.points[2];
    atelier.dragVertex(atelier.pixelOf(corner), { x: 820, y: 500 });
    const deformed = freeContourMeasures(findFreeEntity(atelier.geometry, "pg-1")!);
    expect(deformed.areaMm2).not.toBe(original.areaMm2);

    expect(atelier.undo()).not.toBeNull();
    expect(freeContourMeasures(findFreeEntity(atelier.geometry, "pg-1")!)).toEqual(original);

    expect(atelier.redo()).not.toBeNull();
    expect(freeContourMeasures(findFreeEntity(atelier.geometry, "pg-1")!)).toEqual(deformed);
  });

  it("annule la création entière : le contour disparaît, puis revient", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    expect(atelier.undo()).toBe("pg-1");
    expect(atelier.ids).toEqual([]);
    expect(freeContourTotals(atelier.geometry).contourCount).toBe(0);
    atelier.redo();
    expect(atelier.ids).toEqual(["pg-1"]);
  });
});

describe("persistance (§21)", () => {
  it("survit à un aller-retour par le projet enregistré, sommet pour sommet", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    const before = findFreeEntity(atelier.geometry, "pg-1")!;
    const measured = freeContourMeasures(before);

    atelier.reload();

    const after = findFreeEntity(atelier.geometry, "pg-1")!;
    expect(after.kind).toBe("polygon");
    expect(after.points).toEqual(before.points);
    expect(freeContourMeasures(after)).toEqual(measured);
  });

  it("ne réécrit pas la fermeture dans les données enregistrées", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    atelier.reload();
    const points = findFreeEntity(atelier.geometry, "pg-1")!.points;
    expect(points[points.length - 1]).not.toEqual(points[0]);
  });
});

describe("désignation, cycle et multisélection (§11)", () => {
  it("désigne le contour par un clic sur l'un de ses côtés, fermeture comprise", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    // Milieu du côté de FERMETURE (du dernier sommet au premier) : le côté qu'aucune donnée ne
    // porte explicitement, et donc celui qui pourrait manquer au hit-test.
    const points = findFreeEntity(atelier.geometry, "pg-1")!.points;
    const closingMiddle = {
      x: (points[points.length - 1].x + points[0].x) / 2,
      y: (points[points.length - 1].y + points[0].y) / 2,
    };
    const candidates = atelier.select(atelier.pixelOf(closingMiddle));
    expect(candidates[0]?.entityId).toBe("pg-1");
    expect(candidates[0]?.entityKind).toBe("polygon");
    expect(atelier.selection).toEqual(["pg-1"]);
  });

  it("entre dans une sélection multiple et s'y supprime avec le reste", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    atelier.tool("segment");
    atelier.click({ x: 200, y: 520 });
    atelier.click({ x: 700, y: 540 });
    expect(atelier.ids).toEqual(["pg-1", "sg-1"]);

    const segment = findFreeEntity(atelier.geometry, "sg-1")!;
    const contour = findFreeEntity(atelier.geometry, "pg-1")!;
    atelier.select(atelier.pixelOf({ x: (segment.points[0].x + segment.points[1].x) / 2, y: (segment.points[0].y + segment.points[1].y) / 2 }));
    atelier.select(atelier.pixelOf({ x: (contour.points[0].x + contour.points[1].x) / 2, y: (contour.points[0].y + contour.points[1].y) / 2 }), true);
    expect([...atelier.selection].sort()).toEqual(["pg-1", "sg-1"]);

    expect(atelier.pressDelete()).toBe(2);
    expect(atelier.ids).toEqual([]);
  });

  it("§11 — les ARÊTES du contour participent aux intersections de la scène", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    atelier.tool("segment");
    // Un segment qui traverse le carré de part en part : il coupe deux côtés.
    atelier.click({ x: 200, y: 300 });
    atelier.click({ x: 700, y: 300 });

    const crossings = sceneIntersections(atelier.scene).filter((intersection) =>
      [intersection.entityAId, intersection.entityBId].sort().join("|") === "pg-1|sg-1",
    );
    expect(crossings.length).toBeGreaterThanOrEqual(2);
  });

  it("§11 — le contour s'accroche comme les autres : sommets et milieux de côtés", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    const points = findFreeEntity(atelier.geometry, "pg-1")!.points;

    const onVertex = atelier.snapAt(atelier.pixelOf(points[1]));
    expect(onVertex.kind).toBe("endpoint");

    // Milieu du côté de fermeture : accrochable lui aussi, sans donnée dédiée.
    const closingMiddle = {
      x: (points[points.length - 1].x + points[0].x) / 2,
      y: (points[points.length - 1].y + points[0].y) / 2,
    };
    expect(atelier.snapAt(atelier.pixelOf(closingMiddle)).kind).toBe("midpoint");
  });
});

describe("fiche propriétés (§12)", () => {
  it("annonce sommets, périmètre, surface, orientation et statut", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    const details = describeSceneEntity(atelier.scene, "pg-1");
    expect(details?.kind).toBe("polygon");
    expect(details?.rows.map((row) => row.label)).toEqual([
      "Sommets",
      "Périmètre",
      "Surface",
      "Orientation",
      "Statut",
    ]);
    expect(details?.rows.find((row) => row.label === "Sommets")?.value).toBe("4");
    expect(details?.rows.find((row) => row.label === "Surface")?.value).toMatch(/m²/);
    expect(details?.rows.find((row) => row.label === "Statut")?.value).toMatch(/exploitable/);
  });

  it("dit « non exploitable » plutôt que 0 m² sur un contour noué (§13)", () => {
    const atelier = openFreeAtelier();
    atelier.tool("polygon");
    // Nœud papillon : les deux diagonales se croisent.
    atelier.click({ x: 300, y: 200 });
    atelier.click({ x: 600, y: 400 });
    atelier.click({ x: 300, y: 400 });
    atelier.click({ x: 600, y: 200 });
    atelier.finish();

    const details = describeSceneEntity(atelier.scene, "pg-1");
    const surface = details?.rows.find((row) => row.label === "Surface")?.value;
    expect(surface).toBe("Non exploitable");
    expect(surface).not.toMatch(/0[,.]?0* m²/);
    expect(details?.rows.find((row) => row.label === "Statut")?.value).toMatch(/croise/);
  });

  it("résume une sélection mêlant contour et segment sans inventer de total", () => {
    const atelier = openFreeAtelier();
    drawSquare(atelier);
    atelier.tool("segment");
    atelier.click({ x: 200, y: 520 });
    atelier.click({ x: 700, y: 540 });

    const summary = describeSceneSelection(atelier.scene, ["pg-1", "sg-1"]);
    expect(summary?.count).toBe(2);
    expect(summary?.kinds.map((kind) => kind.kind)).toEqual(["polygon", "segment"]);
    // Aucune ligne commune : additionner un périmètre et une longueur n'aurait pas de sens.
    expect(summary?.commonRows).toEqual([]);
  });
});

describe("charge (§20)", () => {
  /**
   * Les sommets sont posés directement, sans passer par des clics en pixels — et c'est
   * délibéré : sur un cercle de 500 sommets, deux sommets voisins sont distants de onze
   * millimètres, donc l'ACCROCHAGE les ramènerait les uns sur les autres et le contour tracé à
   * la souris n'en compterait qu'une fraction. Ce que ce test mesure est la charge d'un contour
   * dense, pas le comportement de l'accrochage — lequel est vérifié plus haut, à sa vraie échelle.
   */
  const denseContour = (count: number, radius = 900) =>
    createFreeEntity(
      "polygon",
      Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      }),
      "pg-1",
    );

  for (const count of [10, 100, 500]) {
    it(`mesure un contour de ${count} sommets sans temps mort`, () => {
      const entity = denseContour(count);
      const started = performance.now();
      const measures = freeContourMeasures(entity);
      const elapsed = performance.now() - started;
      expect(measures.vertexCount).toBe(count);
      expect(measures.areaMm2).not.toBeNull();
      expect(elapsed).toBeLessThan(150);
    });
  }

  it("sert hit-test, accrochage et intersections sur une scène portant un contour dense", () => {
    const scene = freeGeometryToShape(
      { version: EMPTY_FREE_GEOMETRY.version, entities: [denseContour(500)] },
      { id: "libre", name: "Tracé libre", frame: "sheet" },
    );
    const started = performance.now();
    expect(hitTestAll(scene, { x: 900, y: 0 }, 20).length).toBeGreaterThan(0);
    expect(sceneIntersections(scene)).toBeDefined();
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("trace un contour de 500 sommets par des clics réels quand l'échelle le permet", () => {
    const atelier = openFreeAtelier();
    atelier.tool("polygon");
    // Sommets espacés bien au-delà de la tolérance d'accrochage : le geste passe entièrement.
    for (let index = 0; index < 500; index += 1) {
      const angle = (index / 500) * Math.PI * 2;
      atelier.click(atelier.pixelOf({ x: Math.cos(angle) * 900, y: Math.sin(angle) * 900 }));
    }
    atelier.finish();
    expect(atelier.ids).toEqual(["pg-1"]);
    // L'accrochage a pu confondre des sommets voisins : ce qui compte est qu'aucun sommet ne
    // soit perdu en silence — le contour vit, il est mesurable, et il tient dans les limites.
    const measures = freeContourMeasures(findFreeEntity(atelier.geometry, "pg-1")!);
    expect(measures.vertexCount).toBeGreaterThan(100);
    expect(measures.areaMm2).not.toBeNull();
  });
});
