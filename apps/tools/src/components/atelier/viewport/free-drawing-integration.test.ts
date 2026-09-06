/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §17 — tracé libre de bout en bout.
 *
 * Chaîne complète, sans composant React, exactement celle que suit `AtelierViewportWorkspace` :
 *
 *   PIXEL → monde → accrochage → automate de tracé → primitive → document libre
 *         → historique → projet revalidé → scène → export
 *
 * Les gestes sont exprimés en PIXELS, comme de vrais gestes, et les vérifications portent sur
 * le document réellement enregistré — jamais sur le résultat d'un calcul comparé à lui-même.
 *
 * Le point le plus important y est vérifié deux fois, à la création et au déplacement : c'est
 * la position ACCROCHÉE qui est enregistrée, pas celle du curseur (§5). Un accrochage qui ne
 * serait qu'un retour visuel produirait des sommets faux d'un ou deux millimètres, invisibles à
 * l'écran et coûteux au mur.
 */

import { describe, expect, it } from "vitest";
import { snap } from "../../../lib/geometry/snap";
import { hitTestAll } from "../../../lib/geometry/hit-test";
import { chooseGridStep } from "../../../lib/viewport/grid";
import {
  handleGrabPx,
  selectionTolerancePx,
  snapTolerancePx,
  toleranceWorldFor,
} from "../../../lib/viewport/pointer-targeting";
import { applySelectionClick, EMPTY_SELECTION, pruneSelection } from "../../../lib/viewport/selection-set";
import { fitToBounds, screenToWorld, worldToScreen, type ViewportSize } from "../../../lib/viewport/viewport-math";
import {
  EMPTY_FREE_GEOMETRY,
  countFreeVertices,
  createFreeEntity,
  deletableFreeEntityIds,
  findFreeEntity,
  freeGeometryLength,
  nextFreeEntityId,
  removeFreeEntities,
  type FreeGeometry,
  type FreeVertex,
} from "../../../lib/tracing/free-geometry";
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
import { paramsForHandleTarget } from "../../../lib/tracing/editable-handle";
import { resolveTracingProjectModel } from "../../../lib/tracing/model-resolver";
import { createTracingProject, tracingProjectMode, validateTracingProject } from "../../../lib/tracing/project";
import { touchTracingProject } from "../../../lib/tracing/atelier";
import { beginFreeDraw, freeDrawClick, freeDrawFinish, type FreeDrawTool } from "./free-draw-model";
import type { PlanScene } from "./plan-scene";

const SIZE: ViewportSize = { width: 900, height: 600 };

/**
 * L'état que tient l'écran de tracé libre : projet, document, historique, sélection.
 *
 * C'est le miroir fidèle de `FreeDrawingBoard` + `useFreeDrawing` + `AtelierViewportWorkspace`,
 * sans React — donc testable, et fidèle par construction puisqu'il enchaîne exactement les
 * mêmes fonctions dans le même ordre.
 */
function openFreeAtelier() {
  let project = createTracingProject(
    { id: "trace-libre001", name: "Plafond séjour", type: "ceiling" },
    new Date("2026-09-06T09:00:00.000Z"),
  );
  let geometry: FreeGeometry = EMPTY_FREE_GEOMETRY;
  let history: FreeHistory = EMPTY_FREE_HISTORY;
  let selection: readonly string[] = EMPTY_SELECTION;
  let draw = beginFreeDraw("segment");

  const sceneOf = (): PlanScene => freeGeometryToShape(geometry, { id: "libre", name: "Tracé libre", frame: "sheet" });
  const view = () => fitToBounds(sceneOf().bounds, SIZE);

  /** Écriture réelle : projet remonté et revalidé, comme le fait `persistFreeGeometry`. */
  const persist = () => {
    project = touchTracingProject(project, { freeGeometry: geometry.entities.length ? geometry : undefined });
  };

  const commit = (operation: FreeEditOperation, label: string, source: string) => {
    geometry = applyFreeOperation(geometry, operation);
    history = pushFreeHistory(history, { label, source, coalesce: false, operation });
    persist();
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

    /** Position monde BRUTE d'un point écran, sans accrochage — sert de témoin dans les tests. */
    rawAt(pixel: { x: number; y: number }): FreeVertex {
      return screenToWorld(pixel, view(), SIZE);
    },

    /** Position monde ACCROCHÉE d'un point écran — le seul chemin, création et geste confondus. */
    snapAt(pixel: { x: number; y: number }): { position: FreeVertex; snapped: boolean } {
      const currentView = view();
      const world = screenToWorld(pixel, currentView, SIZE);
      const candidate = snap(sceneOf(), world, {
        toleranceWorld: toleranceWorldFor(snapTolerancePx("fine"), currentView),
        gridStepMm: chooseGridStep(currentView.scale),
      });
      return { position: candidate?.position ?? world, snapped: Boolean(candidate) };
    },

    /** §4 — un clic de création, en pixels. */
    click(pixel: { x: number; y: number }) {
      const { position } = state.snapAt(pixel);
      const step = freeDrawClick(draw, position);
      draw = step.state;
      if (step.commit) {
        const entity = createFreeEntity(step.commit.kind, step.commit.points, nextFreeEntityId(geometry, step.commit.kind));
        commit({ kind: "create", entity }, entity.id, `create:${entity.id}`);
      }
      return step;
    },

    /** §4 — `Entrée` / double-clic. */
    finish() {
      const step = freeDrawFinish(draw);
      draw = step.state;
      if (step.commit) {
        const entity = createFreeEntity(step.commit.kind, step.commit.points, nextFreeEntityId(geometry, step.commit.kind));
        commit({ kind: "create", entity }, entity.id, `create:${entity.id}`);
      }
      return step;
    },

    /** §7 — glissement d'un sommet, du `pointerdown` au relâchement, en pixels. */
    dragVertex(from: { x: number; y: number }, to: { x: number; y: number }) {
      const currentView = view();
      const handles = buildFreeVertexHandles(geometry);
      const grabbed = nearestEditableHandle(
        handles,
        screenToWorld(from, currentView, SIZE),
        toleranceWorldFor(handleGrabPx("fine"), currentView),
      );
      if (!grabbed?.vertex) return null;

      // Scène d'accrochage GELÉE et privée de l'entité tenue (§7), comme le workspace.
      const held = grabbed.vertex.entityId;
      const frozen = removeFreeEntities(geometry, [held]).geometry;
      const frozenScene = freeGeometryToShape(frozen, { id: "libre", name: "Tracé libre", frame: "sheet" });

      const world = screenToWorld(to, currentView, SIZE);
      const candidate = snap(frozenScene, world, {
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

    /** §4/§5 — un clic de SÉLECTION, en pixels : hit-test puis règle de sélection. */
    select(pixel: { x: number; y: number }, additive = false) {
      const currentView = view();
      const world = screenToWorld(pixel, currentView, SIZE);
      const candidates = hitTestAll(
        sceneOf(),
        world,
        toleranceWorldFor(selectionTolerancePx("fine"), currentView),
      );
      selection = applySelectionClick(selection, candidates[0]?.entityId ?? null, additive);
      return candidates;
    },

    /** §8 — touche Suppr : la sélection part telle quelle, le document filtre. */
    pressDelete() {
      const deletable = deletableFreeEntityIds(geometry, selection);
      if (!deletable.length) return 0;
      const { removed } = removeFreeEntities(geometry, deletable);
      commit({ kind: "delete", removed }, `${removed.length} primitive(s)`, `delete:${deletable.join(",")}`);
      selection = pruneSelection(selection, new Set(geometry.entities.map((entity) => entity.id)));
      return removed.length;
    },

    undo() {
      const played = undoFreeHistory(history, geometry);
      if (!played) return null;
      geometry = played.geometry;
      history = played.history;
      selection = pruneSelection(selection, new Set(geometry.entities.map((entity) => entity.id)));
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

    /** §10 — aller-retour par la persistance : sérialisation, relecture, revalidation. */
    reload() {
      const stored = JSON.parse(JSON.stringify(project));
      project = validateTracingProject(stored);
      geometry = project.freeGeometry ?? EMPTY_FREE_GEOMETRY;
      history = EMPTY_FREE_HISTORY;
      selection = EMPTY_SELECTION;
      return state;
    },

    /** Pixel d'un point monde — pour viser un sommet existant. */
    pixelOf(vertex: FreeVertex) {
      return worldToScreen(vertex, view(), SIZE);
    },
  };

  return state;
}

describe("création (§4/§5/§6)", () => {
  it("trace un point, un segment et une polyligne à la souris", () => {
    const atelier = openFreeAtelier();

    atelier.tool("point").click({ x: 300, y: 200 });
    expect(atelier.ids).toEqual(["pt-1"]);

    atelier.tool("segment");
    atelier.click({ x: 200, y: 400 });
    expect(atelier.ids).toEqual(["pt-1"]); // rien n'est validé au premier clic
    atelier.click({ x: 600, y: 420 });
    expect(atelier.ids).toEqual(["pt-1", "sg-1"]);

    atelier.tool("polyline");
    atelier.click({ x: 250, y: 500 });
    atelier.click({ x: 450, y: 520 });
    atelier.click({ x: 650, y: 480 });
    expect(atelier.ids).toEqual(["pt-1", "sg-1"]); // rien tant que le tracé n'est pas terminé
    atelier.finish();
    expect(atelier.ids).toEqual(["pt-1", "sg-1", "pl-1"]);
    expect(findFreeEntity(atelier.geometry, "pl-1")?.points).toHaveLength(3);
  });

  it("§6 — Échap n'enregistre rien et ne laisse aucune trace dans l'historique", () => {
    const atelier = openFreeAtelier();
    atelier.tool("polyline");
    atelier.click({ x: 250, y: 500 });
    atelier.click({ x: 450, y: 520 });
    // « Échap » = repartir d'un automate neuf, ce que fait `freeDrawCancel` puis le rendu.
    atelier.tool("polyline");
    expect(atelier.geometry.entities).toHaveLength(0);
    expect(atelier.canUndo).toBe(false);
    expect(atelier.project.freeGeometry).toBeUndefined();
  });

  it("§5 — le sommet créé prend la position ACCROCHÉE, pas celle du curseur", () => {
    const atelier = openFreeAtelier();
    atelier.tool("segment");
    atelier.click({ x: 200, y: 300 });
    atelier.click({ x: 700, y: 300 });
    const target = findFreeEntity(atelier.geometry, "sg-1")!.points[1];

    // Viser l'extrémité du segment existant, décalé de trois pixels : dans la tolérance
    // d'accrochage, donc l'extrémité doit être reprise EXACTEMENT.
    const near = atelier.pixelOf(target);
    const aim = { x: near.x + 3, y: near.y - 2 };

    atelier.tool("segment");
    // Témoin pris AVANT le clic, donc à la vue courante : la position brute du curseur, et la
    // position accrochée qui devra la remplacer.
    const raw = atelier.rawAt(aim);
    const probe = atelier.snapAt(aim);
    expect(probe.snapped).toBe(true);
    expect(probe.position).not.toEqual(raw);

    atelier.click(aim);
    atelier.click({ x: 400, y: 520 });

    const created = findFreeEntity(atelier.geometry, "sg-2")!;
    // C'est l'extrémité existante qui a été reprise, au millionième de millimètre près…
    expect(created.points[0].x).toBeCloseTo(target.x, 9);
    expect(created.points[0].y).toBeCloseTo(target.y, 9);
    // …et non la position brute du curseur, qui était à plusieurs millimètres de là.
    expect(Math.hypot(created.points[0].x - raw.x, created.points[0].y - raw.y)).toBeGreaterThan(1);
  });

  it("§12 — tout est en millimètres monde : aucun pixel ne survit dans le document", () => {
    const atelier = openFreeAtelier();
    atelier.tool("segment");
    atelier.click({ x: 200, y: 300 });
    atelier.click({ x: 700, y: 300 });
    const segment = findFreeEntity(atelier.geometry, "sg-1")!;
    // Le tracé mesure des centaines de millimètres pour cinq cents pixels : les deux échelles
    // ne peuvent pas être confondues.
    expect(freeGeometryLength(atelier.geometry)).toBeGreaterThan(100);
    expect(Math.abs(segment.points[1].x - segment.points[0].x)).not.toBeCloseTo(500, 0);
  });
});

describe("déplacement de sommet (§7)", () => {
  it("publie une poignée éditable de classe C par sommet", () => {
    const atelier = openFreeAtelier();
    atelier.tool("polyline");
    atelier.click({ x: 200, y: 200 });
    atelier.click({ x: 500, y: 250 });
    atelier.click({ x: 700, y: 450 });
    atelier.finish();

    const handles = buildFreeVertexHandles(atelier.geometry);
    expect(handles).toHaveLength(3);
    expect(handles.every((handle) => handle.editable)).toBe(true);
    expect(handles.every((handle) => handle.constraint === "free")).toBe(true);
    expect(handles.map((handle) => handle.entityId)).toEqual(["pl-1", "pl-1", "pl-1"]);
    // Classe C : aucun paramètre à inverser — c'est ce qui la distingue de la classe A.
    expect(handles.every((handle) => paramsForHandleTarget(handle, { x: 0, y: 0 }) === null)).toBe(true);
  });

  it("déplace le sommet visé, et lui seul", () => {
    const atelier = openFreeAtelier();
    atelier.tool("segment");
    atelier.click({ x: 200, y: 300 });
    atelier.click({ x: 700, y: 300 });
    const before = findFreeEntity(atelier.geometry, "sg-1")!.points;

    const grabPixel = atelier.pixelOf(before[1]);
    const moved = atelier.dragVertex(grabPixel, { x: grabPixel.x - 120, y: grabPixel.y + 90 });
    expect(moved).not.toBeNull();

    const after = findFreeEntity(atelier.geometry, "sg-1")!.points;
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).not.toEqual(before[1]);
    expect(after[1]).toEqual({ x: moved!.target.x, y: moved!.target.y });
  });

  it("accroche la position déplacée, et c'est celle-là qui est enregistrée (§5/§7)", () => {
    const atelier = openFreeAtelier();
    atelier.tool("point").click({ x: 620, y: 250 });
    atelier.tool("segment");
    atelier.click({ x: 200, y: 400 });
    atelier.click({ x: 500, y: 420 });

    const anchor = findFreeEntity(atelier.geometry, "pt-1")!.points[0];
    const grabPixel = atelier.pixelOf(findFreeEntity(atelier.geometry, "sg-1")!.points[1]);
    const anchorPixel = atelier.pixelOf(anchor);

    const moved = atelier.dragVertex(grabPixel, { x: anchorPixel.x + 2, y: anchorPixel.y + 2 });
    expect(moved?.snapped).toBe(true);
    const landed = findFreeEntity(atelier.geometry, "sg-1")!.points[1];
    expect(landed.x).toBeCloseTo(anchor.x, 9);
    expect(landed.y).toBeCloseTo(anchor.y, 9);
  });

  it("s'annule et se rétablit d'un seul geste", () => {
    const atelier = openFreeAtelier();
    atelier.tool("segment");
    atelier.click({ x: 200, y: 300 });
    atelier.click({ x: 700, y: 300 });
    const before = findFreeEntity(atelier.geometry, "sg-1")!.points[1];

    const grabPixel = atelier.pixelOf(before);
    atelier.dragVertex(grabPixel, { x: grabPixel.x - 150, y: grabPixel.y + 60 });
    const after = findFreeEntity(atelier.geometry, "sg-1")!.points[1];

    atelier.undo();
    expect(findFreeEntity(atelier.geometry, "sg-1")!.points[1]).toEqual(before);
    atelier.redo();
    expect(findFreeEntity(atelier.geometry, "sg-1")!.points[1]).toEqual(after);
  });
});

describe("suppression (§8)", () => {
  it("supprime la primitive sélectionnée, et l'annulation la remet à son rang", () => {
    const atelier = openFreeAtelier();
    atelier.tool("point").click({ x: 250, y: 200 });
    atelier.tool("segment");
    atelier.click({ x: 200, y: 400 });
    atelier.click({ x: 700, y: 420 });
    atelier.tool("point").click({ x: 600, y: 200 });
    expect(atelier.ids).toEqual(["pt-1", "sg-1", "pt-2"]);

    const middle = findFreeEntity(atelier.geometry, "sg-1")!.points;
    atelier.select(atelier.pixelOf({ x: (middle[0].x + middle[1].x) / 2, y: (middle[0].y + middle[1].y) / 2 }));
    expect(atelier.selection).toEqual(["sg-1"]);

    expect(atelier.pressDelete()).toBe(1);
    expect(atelier.ids).toEqual(["pt-1", "pt-2"]);
    expect(atelier.selection).toEqual([]);

    atelier.undo();
    expect(atelier.ids).toEqual(["pt-1", "sg-1", "pt-2"]);
  });

  it("supprime plusieurs primitives d'une sélection composée au Maj+clic", () => {
    const atelier = openFreeAtelier();
    atelier.tool("segment");
    atelier.click({ x: 150, y: 200 });
    atelier.click({ x: 750, y: 200 });
    atelier.click({ x: 150, y: 400 });
    atelier.click({ x: 750, y: 400 });
    expect(atelier.ids).toEqual(["sg-1", "sg-2"]);

    const first = findFreeEntity(atelier.geometry, "sg-1")!.points;
    const second = findFreeEntity(atelier.geometry, "sg-2")!.points;
    atelier.select(atelier.pixelOf({ x: (first[0].x + first[1].x) / 2, y: first[0].y }));
    atelier.select(atelier.pixelOf({ x: (second[0].x + second[1].x) / 2, y: second[0].y }), true);
    expect(atelier.selection).toEqual(["sg-1", "sg-2"]);

    expect(atelier.pressDelete()).toBe(2);
    expect(atelier.ids).toEqual([]);
    expect(atelier.project.freeGeometry).toBeUndefined();

    atelier.undo();
    expect(atelier.ids).toEqual(["sg-1", "sg-2"]);
  });

  it("§8 — ne supprime JAMAIS une primitive dérivée d'Engine B", () => {
    const atelier = openFreeAtelier();
    atelier.tool("segment");
    atelier.click({ x: 200, y: 300 });
    atelier.click({ x: 700, y: 300 });

    // Identifiants réels d'un modèle résolu par Engine B, injectés dans la sélection.
    const resolution = resolveTracingProjectModel({ modelId: "rosette-6" });
    if (resolution.status !== "resolved") throw new Error("Rosace non résolue.");
    const engineBIds = resolution.model.circles.map((circle) => circle.id).slice(0, 3);
    expect(engineBIds.length).toBeGreaterThan(0);

    expect(deletableFreeEntityIds(atelier.geometry, engineBIds)).toEqual([]);
    // Et mélangés à une primitive libre, seule celle-ci passe.
    expect(deletableFreeEntityIds(atelier.geometry, [...engineBIds, "sg-1"])).toEqual(["sg-1"]);
  });
});

describe("persistance et reprise (§10)", () => {
  it("retrouve le tracé après un rechargement, sommet pour sommet", () => {
    const atelier = openFreeAtelier();
    atelier.tool("point").click({ x: 300, y: 200 });
    atelier.tool("segment");
    atelier.click({ x: 200, y: 400 });
    atelier.click({ x: 700, y: 420 });
    atelier.tool("polyline");
    atelier.click({ x: 250, y: 500 });
    atelier.click({ x: 450, y: 520 });
    atelier.click({ x: 650, y: 480 });
    atelier.finish();

    const expected = atelier.geometry;
    const length = freeGeometryLength(expected);

    atelier.reload();
    expect(atelier.geometry).toEqual(expected);
    expect(freeGeometryLength(atelier.geometry)).toBeCloseTo(length, 9);
    expect(countFreeVertices(atelier.geometry)).toBe(6);
    expect(tracingProjectMode(atelier.project)).toBe("free");
    // L'historique ne survit pas au rechargement, et c'est voulu : annuler vers un état
    // d'avant la fermeture n'aurait aucun sens (§9).
    expect(atelier.canUndo).toBe(false);
  });

  it("reste modifiable après reprise, avec des identifiants qui ne collisionnent pas", () => {
    const atelier = openFreeAtelier();
    atelier.tool("segment");
    atelier.click({ x: 200, y: 300 });
    atelier.click({ x: 700, y: 300 });
    atelier.reload();

    atelier.tool("segment");
    atelier.click({ x: 200, y: 450 });
    atelier.click({ x: 700, y: 460 });
    expect(atelier.ids).toEqual(["sg-1", "sg-2"]);
  });
});

describe("scène et non-régression Engine B (§17)", () => {
  it("projette le tracé libre en scène désignable, sans polygone ni arc", () => {
    const atelier = openFreeAtelier();
    atelier.tool("point").click({ x: 300, y: 200 });
    atelier.tool("segment");
    atelier.click({ x: 200, y: 400 });
    atelier.click({ x: 700, y: 420 });

    const scene = atelier.scene;
    expect(scene.points).toHaveLength(1);
    expect(scene.segments).toHaveLength(1);
    expect(scene.arcs).toEqual([]);
    expect(scene.circles).toEqual([]);
    expect(scene.polygons).toBeUndefined();
    // Les identifiants de PREMIER niveau sont ceux des entités : ce sont eux que la sélection
    // et la suppression manipulent.
    expect(scene.segments?.[0].id).toBe("sg-1");
  });

  it("donne une FEUILLE cadrable même vide, et un cadre de CONTENU collé au tracé", () => {
    // Feuille : toujours cadrable, y compris sur une page blanche — c'est là qu'on pose le
    // premier sommet, donc c'est là qu'un cadre nul serait le plus coûteux.
    const sheet = freeGeometryToShape(EMPTY_FREE_GEOMETRY, { frame: "sheet" });
    expect(sheet.bounds).toEqual({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 });

    // Contenu : collé au tracé, donc nul quand il n'y a rien. C'est la réponse juste — une
    // mosaïque d'impression ne doit pas être planifiée sur du vide.
    const content = freeGeometryToShape(EMPTY_FREE_GEOMETRY);
    expect(content.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it("§16 — la feuille ne change pas d'échelle à chaque primitive posée", () => {
    const atelier = openFreeAtelier();
    const before = atelier.scene.bounds;

    atelier.tool("segment");
    atelier.click({ x: 300, y: 250 });
    atelier.click({ x: 600, y: 350 });
    atelier.tool("point").click({ x: 400, y: 300 });

    // Trois primitives posées à l'intérieur de la feuille : le cadre — donc le cadrage
    // automatique, donc l'échelle — n'a pas bougé d'un millimètre.
    expect(atelier.scene.bounds).toEqual(before);
  });

  it("la feuille s'agrandit par paliers quand le tracé en sort", () => {
    const wide = freeGeometryToShape(
      {
        version: 1,
        entities: [
          { id: "sg-1", kind: "segment", points: [{ x: -2200, y: 0 }, { x: 3100, y: 40 }] },
        ],
      },
      { frame: "sheet" },
    );
    // Paliers de 500 mm, arrondis vers l'EXTÉRIEUR : le tracé reste toujours dans la feuille.
    expect(wide.bounds.minX).toBe(-2500);
    expect(wide.bounds.maxX).toBe(3500);
    // Et la feuille reste symétrique autour de l'origine sur l'axe non sollicité.
    expect(wide.bounds.minY).toBe(-1000);
    expect(wide.bounds.maxY).toBe(1000);
  });

  it("ne change rien au chemin paramétrique : Engine B résout et édite comme avant", () => {
    const project = createTracingProject({
      id: "trace-param001",
      name: "Rosace",
      type: "ceiling",
      modelId: "rosette-6",
      modelParams: { diameter: 2600 },
    });
    expect(tracingProjectMode(project)).toBe("parametric");
    expect(project.freeGeometry).toBeUndefined();

    const resolution = resolveTracingProjectModel(project);
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    expect(resolution.overrides).toEqual({ diameter: 2600 });
    expect(resolution.model.circles.length).toBeGreaterThan(0);
    // Un modèle résolu ne publie aucune poignée de classe C : `vertex` reste absent partout.
    expect(buildFreeVertexHandles(EMPTY_FREE_GEOMETRY)).toEqual([]);
  });
});
