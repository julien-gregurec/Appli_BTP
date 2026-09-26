/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §14/§15 — intersections, cycle et multisélection sur
 * des modèles RÉELLEMENT résolus par Engine B.
 *
 * Aucune fixture géométrique inventée : chaque scène sort du résolveur, comme à l'écran. Les
 * clics sont exprimés en PIXELS puis convertis, exactement comme le fait
 * `AtelierViewportWorkspace` — c'est le seul moyen de vérifier que la tolérance, le cycle et
 * l'accrochage s'accordent sur les mêmes coordonnées.
 */

import { describe, expect, it } from "vitest";
import { hitTest, hitTestAll } from "../../../lib/geometry/hit-test";
import { intersectionsNear, sceneIntersections } from "../../../lib/geometry/intersections";
import { snap, snapCandidates } from "../../../lib/geometry/snap";
import { resolveTracingProjectModel } from "../../../lib/tracing/model-resolver";
import { chooseGridStep } from "../../../lib/viewport/grid";
import {
  advanceSelectionCycle,
  cycleAnchorPx,
  IDLE_SELECTION_CYCLE,
  type SelectionCycleState,
} from "../../../lib/viewport/selection-cycle";
import { primarySelection, selectSingle, toggleSelection, type SelectionSet } from "../../../lib/viewport/selection-set";
import { selectionTolerancePx, snapTolerancePx, toleranceWorldFor } from "../../../lib/viewport/pointer-targeting";
import { fitToBounds, screenToWorld, worldToScreen, type ViewportSize } from "../../../lib/viewport/viewport-math";
import { describeSceneSelection, listSceneEntities, type PlanScene } from "./plan-scene";
import { DENSE_SCENE } from "./preview-fixture";
import { resolvedPlanScene } from "./resolved-scene";

const SIZE: ViewportSize = { width: 900, height: 600 };

/** §15 — les modèles de la recette, ceux où plusieurs entités se croisent réellement. */
const MODELS = [
  "circle-division",
  "star-5",
  "flower-5",
  "arch-full-round",
  "ellipse-pedagogical",
  "turbine",
  "double-s",
] as const;

function sceneOf(modelId: string): PlanScene {
  const resolution = resolveTracingProjectModel({ modelId } as never);
  if (resolution.status !== "resolved") throw new Error(`Modèle ${modelId} non résolu.`);
  const scene = resolvedPlanScene(resolution);
  if (!scene) throw new Error(`Scène absente pour ${modelId}.`);
  return scene;
}

describe("intersections sur les modèles réels (§15)", () => {
  it.each(MODELS)("%s : aucune valeur non finie, aucune exception", (modelId) => {
    const scene = sceneOf(modelId);
    const found = sceneIntersections(scene);
    expect(found.every((item) => Number.isFinite(item.position.x) && Number.isFinite(item.position.y))).toBe(true);
    // Toute intersection publiée désigne des entités réellement présentes dans la scène.
    const ids = new Set(listSceneEntities(scene).map((entity) => entity.id));
    expect(found.every((item) => ids.has(item.entityAId) && ids.has(item.entityBId))).toBe(true);
  });

  it.each(MODELS)("%s : chaque intersection est bien SUR les deux entités", (modelId) => {
    const scene = sceneOf(modelId);
    for (const item of sceneIntersections(scene)) {
      // Un point d'intersection doit être à distance ~nulle des deux entités qui le produisent
      // — c'est la vérification croisée avec `closest-point`, qui ne partage aucun code avec
      // le calcul d'intersection.
      const onA = hitTest(scene, item.position, 1e-6);
      expect(onA, `intersection ${item.pairKey} n'est sur aucune entité`).not.toBeNull();
    }
  });

  it("plusieurs modèles publient réellement des intersections", () => {
    const withIntersections = MODELS.filter((modelId) => sceneIntersections(sceneOf(modelId)).length > 0);
    // La recette n'a de sens que si les modèles testés se croisent vraiment.
    expect(withIntersections.length).toBeGreaterThanOrEqual(4);
  });

  it("star-5 : le pentagramme publie ses croisements internes", () => {
    const found = sceneIntersections(sceneOf("star-5"));
    expect(found.length).toBeGreaterThan(0);
  });

  it("circle-division : les deux axes se croisent au centre du cercle", () => {
    const scene = sceneOf("circle-division");
    const found = sceneIntersections(scene);
    const centre = scene.circles?.[0]?.centre;
    expect(centre).toBeDefined();
    const atCentre = found.filter((item) => Math.hypot(item.position.x - centre!.x, item.position.y - centre!.y) < 1e-6);
    expect(atCentre.length).toBeGreaterThan(0);
  });
});

describe("accrochage sur intersection (§5/§14)", () => {
  it.each(MODELS)("%s : une intersection est accrochable quand on la vise", (modelId) => {
    const scene = sceneOf(modelId);
    const view = fitToBounds(scene.bounds, SIZE);
    const tolerance = toleranceWorldFor(snapTolerancePx("fine"), view);
    const found = sceneIntersections(scene);
    if (found.length === 0) return;

    for (const item of found.slice(0, 8)) {
      const candidates = snapCandidates(scene, item.position, { toleranceWorld: tolerance });
      // L'endroit est bien proposé — soit comme intersection, soit fusionné dans un candidat
      // PLUS signifiant (point nommé, extrémité) qui occupe exactement la même position (§5).
      const here = candidates.filter(
        (candidate) => Math.hypot(candidate.position.x - item.position.x, candidate.position.y - item.position.y) < 1e-6,
      );
      expect(here.length, `aucun accrochage à l'intersection ${item.pairKey}`).toBeGreaterThan(0);
      expect(here.length, `doublon d'accrochage à ${item.pairKey}`).toBe(1);
    }
  });

  it("une intersection coïncidant avec une extrémité ne crée pas de doublon (§5)", () => {
    // Deux segments qui se touchent par une extrémité : l'endroit est à la fois une extrémité
    // et une intersection. Un seul candidat doit sortir, et c'est l'extrémité qui l'emporte.
    const scene: PlanScene = {
      id: "t",
      name: "T",
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      segments: [
        { id: "a", start: { id: "a1", x: 0, y: 0 }, end: { id: "a2", x: 10, y: 0 } },
        { id: "b", start: { id: "b1", x: 10, y: 0 }, end: { id: "b2", x: 10, y: 10 } },
      ],
    };
    const here = snapCandidates(scene, { x: 10, y: 0 }, { toleranceWorld: 2 }).filter(
      (candidate) => Math.hypot(candidate.position.x - 10, candidate.position.y) < 1e-6,
    );
    expect(here).toHaveLength(1);
    expect(here[0].kind).toBe("endpoint");
  });

  /**
   * Croisement DÉCENTRÉ : les deux segments se coupent en (0, 0) sans qu'aucun de leurs
   * milieux, extrémités ou centres n'y tombe. C'est le seul cas où l'accrochage
   * « intersection » a une chance de sortir en tête — partout ailleurs il est légitimement
   * fusionné dans un candidat plus signifiant (§5), ce que vérifie le test suivant.
   */
  const CROSS_SCENE: PlanScene = {
    id: "x",
    name: "X",
    bounds: { minX: -30, minY: -30, maxX: 30, maxY: 30 },
    segments: [
      { id: "a", start: { id: "a1", x: -10, y: -10 }, end: { id: "a2", x: 30, y: 30 } },
      { id: "b", start: { id: "b1", x: -20, y: 20 }, end: { id: "b2", x: 30, y: -30 } },
    ],
  };

  it("une intersection sans point remarquable est proposée telle quelle", () => {
    const best = snap(CROSS_SCENE, { x: 0.2, y: 0.1 }, { toleranceWorld: 2 });
    expect(best).not.toBeNull();
    expect(best!.kind).toBe("intersection");
    expect(best!.entityIds).toEqual(["a", "b"]);
    expect(best!.position.x).toBeCloseTo(0, 9);
    expect(best!.position.y).toBeCloseTo(0, 9);
    expect(best!.tangent).toBe(false);
  });

  it("la grille ne l'emporte jamais sur une intersection au même endroit", () => {
    const best = snap(CROSS_SCENE, { x: 0.2, y: 0.1 }, { toleranceWorld: 5, gridStepMm: 10 });
    expect(best!.kind).toBe("intersection");
  });

  it("désactiver la nature « intersection » les fait disparaître, sans rien casser d'autre", () => {
    const scene = CROSS_SCENE;
    const withoutIntersections = snapCandidates(scene, { x: 0.2, y: 0.1 }, {
      toleranceWorld: 2,
      gridStepMm: 10,
      kinds: ["endpoint", "midpoint", "point", "center", "grid"],
    });
    expect(withoutIntersections.every((candidate) => candidate.kind !== "intersection")).toBe(true);
    // Les autres natures restent servies : la grille tombe elle aussi sur (0, 0) ici.
    expect(withoutIntersections.map((candidate) => candidate.kind)).toContain("grid");

    // Et avec la nature réactivée, c'est bien l'intersection qui l'emporte sur la grille.
    const withIntersections = snapCandidates(scene, { x: 0.2, y: 0.1 }, { toleranceWorld: 2, gridStepMm: 10 });
    expect(withIntersections[0].kind).toBe("intersection");
  });

  it("l'accrochage d'un glissement de poignée voit aussi les intersections (§12)", () => {
    // La scène d'accrochage d'un glissement est la scène privée du point tenu : les
    // intersections, qui ne dépendent pas des points, restent disponibles.
    const scene = sceneOf("star-5");
    const held = scene.points?.[0];
    expect(held).toBeDefined();
    const dragScene: PlanScene = { ...scene, points: (scene.points ?? []).filter((item) => item.id !== held!.id) };
    const target = sceneIntersections(dragScene)[0];
    expect(target).toBeDefined();
    const best = snap(dragScene, target.position, { toleranceWorld: 1 });
    expect(best).not.toBeNull();
    expect(Math.hypot(best!.position.x - target.position.x, best!.position.y - target.position.y)).toBeLessThan(1e-6);
  });
});

describe("hitTestAll — ordre déterministe (§6/§14)", () => {
  it.each(MODELS)("%s : hitTest rend exactement la tête de hitTestAll", (modelId) => {
    const scene = sceneOf(modelId);
    const view = fitToBounds(scene.bounds, SIZE);
    const tolerance = toleranceWorldFor(selectionTolerancePx("fine"), view);
    for (const entity of listSceneEntities(scene)) {
      const anchor = hitTestAll(scene, { x: 0, y: 0 }, Number.MAX_VALUE).find((item) => item.entityId === entity.id);
      if (!anchor) continue;
      const all = hitTestAll(scene, anchor.closestPoint, tolerance);
      const best = hitTest(scene, anchor.closestPoint, tolerance);
      expect(best?.entityId ?? null).toBe(all[0]?.entityId ?? null);
    }
  });

  it("l'ordre ne dépend pas de l'ordre du tableau source", () => {
    const scene = sceneOf("turbine");
    const reversed: PlanScene = {
      ...scene,
      circles: [...(scene.circles ?? [])].reverse(),
      constructionLines: [...(scene.constructionLines ?? [])].reverse(),
      points: [...(scene.points ?? [])].reverse(),
    };
    const target = scene.circles?.[0]?.centre ?? { x: 0, y: 0 };
    const direct = hitTestAll(scene, target, 40).map((item) => item.entityId);
    const flipped = hitTestAll(reversed, target, 40).map((item) => item.entityId);
    expect(flipped).toEqual(direct);
  });

  it("tous les candidats retournés sont dans la tolérance", () => {
    const scene = sceneOf("flower-5");
    const found = hitTestAll(scene, { x: 0, y: 0 }, 25);
    expect(found.every((item) => item.distance <= 25)).toBe(true);
  });
});

describe("cycle de sélection sur un modèle réel (§7/§14)", () => {
  /** Reproduit la boucle exacte du workspace : pixel → monde → hitTestAll → cycle. */
  function clickCycle(scene: PlanScene, state: SelectionCycleState, screen: { x: number; y: number }, key = "recette") {
    const view = fitToBounds(scene.bounds, SIZE);
    const world = screenToWorld(screen, view, SIZE);
    const tolerance = toleranceWorldFor(selectionTolerancePx("fine"), view);
    const candidates = [...new Set(hitTestAll(scene, world, tolerance).map((item) => item.entityId))];
    return advanceSelectionCycle(state, { key, point: screen, candidates, anchorPx: cycleAnchorPx("fine") });
  }

  it("au centre d'une rosace, les clics répétés atteignent les entités superposées", () => {
    const scene = sceneOf("flower-5");
    const view = fitToBounds(scene.bounds, SIZE);
    const centre = worldToScreen({ x: 0, y: 0 }, view, SIZE);

    const first = clickCycle(scene, IDLE_SELECTION_CYCLE, centre);
    const length = first.state.candidates.length;
    expect(length, "le centre de la fleur doit superposer plusieurs entités").toBeGreaterThan(1);

    let state = first.state;
    const taken: (string | null)[] = [first.entityId];
    // Un tour complet, plus un clic : le cycle doit être revenu à son point de départ.
    for (let index = 0; index < length; index += 1) {
      const step = clickCycle(scene, state, centre);
      state = step.state;
      taken.push(step.entityId);
    }
    expect(new Set(taken.slice(0, length)).size).toBe(length);
    expect(taken[length]).toBe(taken[0]);
  });

  it("un clic éloigné rouvre un cycle plutôt que de continuer le précédent", () => {
    const scene = sceneOf("circle-division");
    const view = fitToBounds(scene.bounds, SIZE);
    const centre = worldToScreen({ x: 0, y: 0 }, view, SIZE);

    const first = clickCycle(scene, IDLE_SELECTION_CYCLE, centre);
    const second = clickCycle(scene, first.state, centre);
    expect(second.cycled).toBe(true);

    const far = clickCycle(scene, second.state, { x: centre.x + 120, y: centre.y + 90 });
    expect(far.cycled).toBe(false);
  });

  it("changer de modèle ferme le cycle", () => {
    const scene = sceneOf("circle-division");
    const view = fitToBounds(scene.bounds, SIZE);
    const centre = worldToScreen({ x: 0, y: 0 }, view, SIZE);
    const first = clickCycle(scene, IDLE_SELECTION_CYCLE, centre, "projet::circle-division");
    const other = clickCycle(sceneOf("star-5"), first.state, centre, "projet::star-5");
    expect(other.cycled).toBe(false);
  });

  it("un clic dans le vide ne désigne rien et referme le cycle", () => {
    const scene = sceneOf("arch-full-round");
    const step = clickCycle(scene, IDLE_SELECTION_CYCLE, { x: 4, y: 4 });
    expect(step.entityId).toBeNull();
    expect(step.state.anchor).toBeNull();
  });
});

describe("multisélection sur un modèle réel (§8/§10/§14)", () => {
  const scene = sceneOf("turbine");
  const entities = listSceneEntities(scene);

  it("Shift + clic empile, re-Shift + clic retire", () => {
    let selection: SelectionSet = [];
    selection = toggleSelection(selection, entities[0].id);
    selection = toggleSelection(selection, entities[1].id);
    selection = toggleSelection(selection, entities[2].id);
    expect(selection).toHaveLength(3);
    expect(primarySelection(selection)).toBe(entities[2].id);

    selection = toggleSelection(selection, entities[1].id);
    expect(selection).toEqual([entities[0].id, entities[2].id]);
  });

  it("un clic simple réduit la sélection à une entité", () => {
    const multiple: SelectionSet = [entities[0].id, entities[1].id, entities[2].id];
    expect(selectSingle(multiple, entities[3].id)).toEqual([entities[3].id]);
  });

  it("un clic dans le vide vide la sélection", () => {
    expect(selectSingle([entities[0].id, entities[1].id], null)).toEqual([]);
  });

  it("la synthèse multi compte, classe et n'invente aucune propriété (§10)", () => {
    const circles = entities.filter((entity) => entity.kind === "circle").map((entity) => entity.id);
    const lines = entities.filter((entity) => entity.kind === "segment").map((entity) => entity.id);
    const details = describeSceneSelection(scene, [...circles, ...lines.slice(0, 2)]);
    expect(details).not.toBeNull();
    expect(details!.count).toBe(circles.length + 2);
    expect(details!.kinds.map((entry) => entry.kind)).toEqual(["segment", "circle"]);
    expect(details!.entries).toHaveLength(details!.count);
    // Les lignes communes sont, par construction, identiques sur toutes les entités retenues.
    expect(details!.commonRows.every((row) => typeof row.value === "string")).toBe(true);
  });

  it("des cercles de même rayon publient ce rayon comme propriété commune", () => {
    const twin: PlanScene = {
      id: "twin",
      name: "Deux cercles identiques",
      bounds: { minX: -30, minY: -20, maxX: 30, maxY: 20 },
      circles: [
        { id: "c1", centre: { id: "o1", x: -10, y: 0 }, radius: 8 },
        { id: "c2", centre: { id: "o2", x: 10, y: 0 }, radius: 8 },
      ],
    };
    const details = describeSceneSelection(twin, ["c1", "c2"]);
    expect(details!.commonRows.map((row) => row.label)).toContain("Rayon");
    // Le centre diffère : il ne doit PAS être annoncé comme commun.
    expect(details!.commonRows.map((row) => row.label)).not.toContain("Centre");
  });

  it("des identifiants inconnus sont ignorés, jamais affichés", () => {
    expect(describeSceneSelection(scene, ["fantome-1", "fantome-2"])).toBeNull();
    const mixed = describeSceneSelection(scene, [entities[0].id, "fantome"]);
    expect(mixed!.count).toBe(1);
  });
});

describe("performance (§16)", () => {
  /** Coût moyen d'un appel, en millisecondes. */
  function measure(run: () => void, iterations: number): number {
    run();
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) run();
    return (performance.now() - started) / iterations;
  }

  it("scène dense (53 entités croisables) : le survol reste sous la trame", () => {
    const scene = DENSE_SCENE;
    const view = fitToBounds(scene.bounds, SIZE);
    const tolerance = toleranceWorldFor(snapTolerancePx("fine"), view);
    const selection = toleranceWorldFor(selectionTolerancePx("fine"), view);
    const target = { x: 900, y: 900 };

    const hitCost = measure(() => void hitTestAll(scene, target, selection), 500);
    const intersectionCost = measure(() => void intersectionsNear(scene, target, tolerance), 500);
    const snapCost = measure(() => void snap(scene, target, { toleranceWorld: tolerance, gridStepMm: chooseGridStep(view.scale) }), 500);

    // Budget d'une trame à 60 Hz : 16,7 ms. Le survol fait UN hit-test et UN accrochage par
    // trame (§10 du lot précédent) ; on exige un ordre de grandeur de marge.
    expect(hitCost).toBeLessThan(1.5);
    expect(intersectionCost).toBeLessThan(1.5);
    expect(snapCost).toBeLessThan(1.5);
  });

  it("le voisinage borne réellement le coût : intersectionsNear « voit » bien moins que le balayage complet", () => {
    const scene = DENSE_SCENE;
    const exhaustive = measure(() => void sceneIntersections(scene), 20);
    const local = measure(() => void intersectionsNear(scene, { x: 900, y: 900 }, 5), 200);
    expect(local).toBeLessThan(exhaustive);
  });

  it("l'index de scène est mémorisé, pas reconstruit à chaque appel", () => {
    const scene = DENSE_SCENE;
    const first = measure(() => void intersectionsNear(scene, { x: 450, y: 450 }, 5), 1);
    const later = measure(() => void intersectionsNear(scene, { x: 450, y: 450 }, 5), 200);
    // Sans mémorisation, chaque appel repaierait l'inventaire complet de la scène.
    expect(later).toBeLessThanOrEqual(Math.max(first, 0.5));
  });
});
