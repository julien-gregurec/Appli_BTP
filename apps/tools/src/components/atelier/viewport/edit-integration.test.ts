/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §12 — édition d'un sommet, de bout en bout.
 *
 * Chaîne complète, sans composant React, exactement celle que suit `AtelierViewportWorkspace` :
 *
 *   projet → résolveur → `TraceModel` → poignées → PIXEL → monde → accrochage → inversion
 *          → quantification → `modelParams` → projet revalidé → résolveur → géométrie
 *
 * Le geste est exprimé en pixels, comme un vrai geste, et la vérification porte sur la
 * géométrie RECONSTRUITE par Engine B — jamais sur le résultat de l'inversion comparé à
 * lui-même. Aucune fixture : toutes les scènes viennent du moteur.
 */

import { describe, expect, it } from "vitest";
import { resolveTracingProjectModel } from "../../../lib/tracing/model-resolver";
import { findTraceModelDescriptor } from "../../../lib/geometry/models/catalog";
import { buildEditableHandles, nearestEditableHandle } from "../../../lib/tracing/handle-map";
import { paramsForHandleTarget, type EditableHandle } from "../../../lib/tracing/editable-handle";
import {
  EMPTY_PARAM_HISTORY,
  overridesForProject,
  overridesOf,
  pushParamHistory,
  redoParamHistory,
  undoParamHistory,
  valuesOf,
} from "../../../lib/tracing/param-history";
import { touchTracingProject } from "../../../lib/tracing/atelier";
import { createTracingProject, validateTracingProject } from "../../../lib/tracing/project";
import { snap } from "../../../lib/geometry/snap";
import { chooseGridStep } from "../../../lib/viewport/grid";
import { handleGrabPx, snapTolerancePx, toleranceWorldFor } from "../../../lib/viewport/pointer-targeting";
import { fitToBounds, screenToWorld, worldToScreen, type ViewportSize } from "../../../lib/viewport/viewport-math";
import { resolvedPlanScene } from "./resolved-scene";
import type { PlanScene } from "./plan-scene";

const SIZE: ViewportSize = { width: 900, height: 600 };

function resolve(modelId: string, modelParams?: Record<string, number>) {
  const resolution = resolveTracingProjectModel({ modelId, modelParams } as never);
  if (resolution.status !== "resolved") throw new Error(`Modèle ${modelId} non résolu : ${resolution.status}.`);
  return resolution;
}

/** L'état que tient l'écran : projet, valeurs effectives, historique. */
function openAtelier(modelId: string) {
  const descriptor = findTraceModelDescriptor(modelId)!;
  let project = createTracingProject(
    { id: "trace-edition", name: "Plafond séjour", type: "ceiling", modelId },
    new Date("2026-09-05T10:00:00.000Z"),
  );
  let history = EMPTY_PARAM_HISTORY;

  const state = {
    get project() {
      return project;
    },
    get history() {
      return history;
    },
    get resolution() {
      return resolve(modelId, project.modelParams);
    },
    get values() {
      return resolve(modelId, project.modelParams).params;
    },
    get defaults() {
      return resolve(modelId, project.modelParams).defaults;
    },
    scene(): PlanScene {
      return resolvedPlanScene(state.resolution)!;
    },
    handles(): readonly EditableHandle[] {
      const resolution = state.resolution;
      return buildEditableHandles(descriptor, resolution.params, resolution.model);
    },
    /** Ce que fait `useModelEditing.commitValues` : historique, projet, puis autosave. */
    commit(values: Record<string, number>, label: string, source: string, coalesce = false) {
      const before = overridesOf(state.values, state.defaults);
      const after = overridesOf(values, state.defaults);
      history = pushParamHistory(history, { label, source, coalesce, before, after });
      project = touchTracingProject(project, { modelParams: overridesForProject(after) });
      return project;
    },
    undo() {
      const move = undoParamHistory(history);
      if (!move) return null;
      history = move.history;
      project = touchTracingProject(project, { modelParams: overridesForProject(move.overrides) });
      return move;
    },
    redo() {
      const move = redoParamHistory(history);
      if (!move) return null;
      history = move.history;
      project = touchTracingProject(project, { modelParams: overridesForProject(move.overrides) });
      return move;
    },
  };
  return state;
}

type Pixel = { x: number; y: number };

/** Reproduit `grab.onDown` : pixel → monde → poignée éditable la plus proche. */
function grabAt(
  handles: readonly EditableHandle[],
  pixel: Pixel,
  view: ReturnType<typeof fitToBounds>,
  precision: "fine" | "coarse" = "fine",
) {
  const world = screenToWorld(pixel, view, SIZE);
  return nearestEditableHandle(handles, world, toleranceWorldFor(handleGrabPx(precision), view));
}

/** Reproduit `grab.onMove` : accrochage sur la scène gelée privée du point tenu, puis inversion. */
function dragTo(
  handle: EditableHandle,
  scene: PlanScene,
  pixel: Pixel,
  view: ReturnType<typeof fitToBounds>,
  precision: "fine" | "coarse" = "fine",
) {
  const snapScene: PlanScene = {
    ...scene,
    points: (scene.points ?? []).filter((point) => point.id !== handle.entityId),
  };
  const world = screenToWorld(pixel, view, SIZE);
  const candidate = snap(snapScene, world, {
    toleranceWorld: toleranceWorldFor(snapTolerancePx(precision), view),
    gridStepMm: chooseGridStep(view.scale),
  });
  const target = candidate?.position ?? world;
  return { target, snapped: candidate, values: paramsForHandleTarget(handle, target) };
}

describe("saisie d'une poignée au pixel près", () => {
  it("prend le sommet visé, et rien d'autre", () => {
    const atelier = openAtelier("circle-division");
    const view = fitToBounds(atelier.scene().bounds, SIZE);
    const handles = atelier.handles();
    const P1 = handles.find((handle) => handle.entityId === "P1")!;

    const pixel = worldToScreen(P1.position, view, SIZE);
    expect(grabAt(handles, pixel, view)?.entityId).toBe("P1");
    // À quelques pixels : toujours pris.
    expect(grabAt(handles, { x: pixel.x + 6, y: pixel.y - 5 }, view)?.entityId).toBe("P1");
  });

  /** §4 — le pan ne doit jamais être volé : loin de toute poignée, rien n'est capté. */
  it("ne capte rien au milieu du vide : le plan garde le geste", () => {
    const atelier = openAtelier("circle-division");
    const view = fitToBounds(atelier.scene().bounds, SIZE);
    expect(grabAt(atelier.handles(), { x: 3, y: 3 }, view)).toBeNull();
  });

  it("ne capte jamais un point en lecture seule", () => {
    const atelier = openAtelier("ellipse-pedagogical");
    const view = fitToBounds(atelier.scene().bounds, SIZE);
    const handles = atelier.handles();
    const focus = handles.find((handle) => handle.entityId === "F1")!;
    expect(focus.editable).toBe(false);
    // On vise exactement le foyer : il ne doit pas être saisi, et aucun voisin ne doit
    // l'être à sa place par simple proximité.
    const grabbed = grabAt(handles, worldToScreen(focus.position, view, SIZE), view);
    expect(grabbed?.entityId).not.toBe("F1");
  });

  /** §11 — au doigt, la zone de prise est plus large : un sommet reste atteignable. */
  it("offre une zone de prise plus large au doigt qu'à la souris", () => {
    const atelier = openAtelier("circle-division");
    const view = fitToBounds(atelier.scene().bounds, SIZE);
    const handles = atelier.handles();
    const P1 = handles.find((handle) => handle.entityId === "P1")!;
    const pixel = worldToScreen(P1.position, view, SIZE);
    // 20 px : au-delà de la souris (14 px), en deçà du doigt (26 px).
    const off = { x: pixel.x + 20, y: pixel.y };
    expect(grabAt(handles, off, view, "fine")).toBeNull();
    expect(grabAt(handles, off, view, "coarse")?.entityId).toBe("P1");
  });
});

describe("glissement, prévisualisation et validation", () => {
  it("déplace réellement le sommet : la géométrie reconstruite le montre", () => {
    const atelier = openAtelier("circle-division");
    const scene = atelier.scene();
    const view = fitToBounds(scene.bounds, SIZE);
    const P1 = atelier.handles().find((handle) => handle.entityId === "P1")!;

    // Tirer vers l'extérieur, le long de +X, très loin de tout point accrochable.
    const targetWorld = { x: P1.position.x + 600, y: P1.position.y + 37 };
    const { values } = dragTo(P1, scene, worldToScreen(targetWorld, view, SIZE), view);
    expect(values).not.toBeNull();

    atelier.commit(values!, "Point de division P1", "handle:handle-P1");
    const moved = atelier.scene().points!.find((point) => point.id === "P1")!;
    expect(Math.hypot(moved.x, moved.y)).toBeGreaterThan(Math.hypot(P1.position.x, P1.position.y));
    expect(atelier.project.modelParams?.diameter).toBeGreaterThan(2000);
  });

  it("une prévisualisation ne touche ni au projet ni à l'historique", () => {
    const atelier = openAtelier("circle-division");
    const scene = atelier.scene();
    const view = fitToBounds(scene.bounds, SIZE);
    const P1 = atelier.handles().find((handle) => handle.entityId === "P1")!;

    // Le glissement calcule des valeurs, mais tant qu'on ne valide pas, rien ne bouge.
    const { values } = dragTo(P1, scene, worldToScreen({ x: 1600, y: 0 }, view, SIZE), view);
    expect(values).not.toBeNull();
    expect(atelier.project.modelParams).toBeUndefined();
    expect(atelier.history.past).toHaveLength(0);
  });

  it("un geste qui ne franchit pas un pas ne produit aucune modification", () => {
    const atelier = openAtelier("circle-division");
    const scene = atelier.scene();
    const view = fitToBounds(scene.bounds, SIZE);
    const P1 = atelier.handles().find((handle) => handle.entityId === "P1")!;
    // Un dixième de pixel : sous le pas du paramètre après conversion.
    const pixel = worldToScreen(P1.position, view, SIZE);
    expect(dragTo(P1, scene, { x: pixel.x + 0.1, y: pixel.y }, view).values).toBeNull();
  });

  it("borne le paramètre plutôt que de produire un projet que le résolveur refuserait", () => {
    const atelier = openAtelier("circle-division");
    const scene = atelier.scene();
    const view = fitToBounds(scene.bounds, SIZE);
    const P1 = atelier.handles().find((handle) => handle.entityId === "P1")!;

    const { values } = dragTo(P1, scene, worldToScreen({ x: 900000, y: 0 }, view, SIZE), view);
    atelier.commit(values!, "Point de division P1", "handle:handle-P1");
    expect(atelier.project.modelParams?.diameter).toBe(20000);
    // Le projet reste strictement valide, et le modèle se résout encore.
    expect(() => validateTracingProject(atelier.project)).not.toThrow();
    expect(atelier.resolution.status).toBe("resolved");
  });
});

describe("accrochage réellement appliqué (§6)", () => {
  /**
   * Le point du lot : le commit doit utiliser la position ACCROCHÉE, pas la position brute du
   * curseur. On vise volontairement à côté d'un nœud de grille et on vérifie que la valeur
   * enregistrée est celle du nœud.
   */
  it("valide la position accrochée, pas celle du curseur", () => {
    const atelier = openAtelier("circle-division");
    const scene = atelier.scene();
    const view = fitToBounds(scene.bounds, SIZE);
    const P1 = atelier.handles().find((handle) => handle.entityId === "P1")!;
    const step = chooseGridStep(view.scale);

    // Une cible à quelques millimètres d'un nœud de grille, sur l'axe X.
    const node = { x: Math.round(2600 / step) * step, y: 0 };
    const nearMiss = { x: node.x + step * 0.08, y: 0 };

    const dragged = dragTo(P1, scene, worldToScreen(nearMiss, view, SIZE), view);
    expect(dragged.snapped?.kind).toBe("grid");
    expect(dragged.target.x).toBeCloseTo(node.x, 6);

    atelier.commit(dragged.values!, "Point de division P1", "handle:handle-P1");
    // Le diamètre enregistré est le double du rayon ACCROCHÉ, pas celui du curseur.
    expect(atelier.project.modelParams?.diameter).toBeCloseTo(node.x * 2, 1);
  });

  it("n'accroche jamais la poignée sur elle-même", () => {
    const atelier = openAtelier("circle-division");
    const scene = atelier.scene();
    const view = fitToBounds(scene.bounds, SIZE);
    const P1 = atelier.handles().find((handle) => handle.entityId === "P1")!;

    // Cible très proche de la position de départ de P1 : si P1 restait accrochable, elle
    // capterait le geste et le sommet ne bougerait plus jamais.
    const dragged = dragTo(P1, scene, worldToScreen({ x: P1.position.x + 1, y: 0 }, view, SIZE), view);
    expect(dragged.snapped?.entityId).not.toBe("P1");
  });

  it("accroche sur un point nommé du modèle et enregistre cette position", () => {
    const atelier = openAtelier("ellipse-pedagogical");
    const scene = atelier.scene();
    const view = fitToBounds(scene.bounds, SIZE);
    const vertex = atelier.handles().find((handle) => handle.entityId === "Vx+")!;
    const focus = scene.points!.find((point) => point.id === "F2")!;

    // Viser à côté du foyer F2 : l'accrochage doit y amener le sommet.
    const dragged = dragTo(vertex, scene, worldToScreen({ x: focus.x + 3, y: focus.y + 2 }, view, SIZE), view);
    expect(dragged.snapped?.entityId).toBe("F2");
    atelier.commit(dragged.values!, "Sommet Vx+", "handle:handle-Vx+");
    // Largeur = 2 × demi-grand axe, et le demi-grand axe vaut désormais l'abscisse du foyer.
    expect(atelier.project.modelParams?.width).toBeCloseTo(focus.x * 2, 1);
  });
});

describe("historique sur un tracé réel", () => {
  it("annule et rétablit un glissement, géométrie comprise", () => {
    const atelier = openAtelier("circle-division");
    const scene = atelier.scene();
    const view = fitToBounds(scene.bounds, SIZE);
    const P1 = atelier.handles().find((handle) => handle.entityId === "P1")!;
    const before = atelier.scene().points!.find((point) => point.id === "P1")!;

    const { values } = dragTo(P1, scene, worldToScreen({ x: 1500, y: 0 }, view, SIZE), view);
    atelier.commit(values!, "Point de division P1", "handle:handle-P1");
    const after = atelier.scene().points!.find((point) => point.id === "P1")!;
    expect(after.x).not.toBeCloseTo(before.x, 3);

    expect(atelier.undo()?.label).toBe("Point de division P1");
    expect(atelier.scene().points!.find((point) => point.id === "P1")!.x).toBeCloseTo(before.x, 6);
    expect(atelier.project.modelParams).toBeUndefined();

    expect(atelier.redo()?.label).toBe("Point de division P1");
    expect(atelier.scene().points!.find((point) => point.id === "P1")!.x).toBeCloseTo(after.x, 6);
  });

  it("un nouveau glissement après une annulation invalide le rétablissement", () => {
    const atelier = openAtelier("circle-division");
    const view = fitToBounds(atelier.scene().bounds, SIZE);

    const first = dragTo(atelier.handles().find((h) => h.entityId === "P1")!, atelier.scene(), worldToScreen({ x: 1500, y: 0 }, view, SIZE), view);
    atelier.commit(first.values!, "P1", "handle:handle-P1");
    atelier.undo();
    expect(atelier.history.future).toHaveLength(1);

    const second = dragTo(atelier.handles().find((h) => h.entityId === "P2")!, atelier.scene(), worldToScreen({ x: 400, y: 900 }, view, SIZE), view);
    atelier.commit(second.values!, "P2", "handle:handle-P2");
    expect(atelier.history.future).toHaveLength(0);
    expect(atelier.undo()).not.toBeNull();
    expect(atelier.undo()).toBeNull();
  });
});

describe("formulaire et poignée : une seule source (§10)", () => {
  it("écrivent le même `modelParams` pour le même résultat", () => {
    const byHandle = openAtelier("circle-division");
    const view = fitToBounds(byHandle.scene().bounds, SIZE);
    const P1 = byHandle.handles().find((handle) => handle.entityId === "P1")!;
    const { values } = dragTo(P1, byHandle.scene(), worldToScreen({ x: 1500, y: 0 }, view, SIZE), view);
    byHandle.commit(values!, "P1", "handle:handle-P1");

    const byForm = openAtelier("circle-division");
    byForm.commit({ ...byForm.values, diameter: values!.diameter }, "Diamètre", "form:diameter", true);

    expect(byForm.project.modelParams).toEqual(byHandle.project.modelParams);
    expect(byForm.scene().points).toEqual(byHandle.scene().points);
  });

  it("une poignée déplacée met à jour la valeur que le formulaire affiche", () => {
    const atelier = openAtelier("rosette-6");
    const view = fitToBounds(atelier.scene().bounds, SIZE);
    const C1 = atelier.handles().find((handle) => handle.entityId === "C1")!;
    const { values } = dragTo(C1, atelier.scene(), worldToScreen({ x: 1500, y: 0 }, view, SIZE), view);
    atelier.commit(values!, "C1", "handle:handle-C1");

    // `values` est exactement ce que le formulaire lit : défauts du modèle + surcharges.
    expect(atelier.values).toEqual(valuesOf(atelier.defaults, atelier.project.modelParams));
    expect(atelier.values.diameter).toBe(values!.diameter);
  });
});

describe("rechargement du tracé", () => {
  /** §9 — ce qui est enregistré doit se relire à l'identique après un aller-retour complet. */
  it("retrouve la même géométrie après relecture du projet enregistré", () => {
    const atelier = openAtelier("turbine");
    const view = fitToBounds(atelier.scene().bounds, SIZE);
    const T1 = atelier.handles().find((handle) => handle.entityId === "T1")!;
    const V1 = atelier.handles().find((handle) => handle.entityId === "V1")!;

    atelier.commit(dragTo(T1, atelier.scene(), worldToScreen({ x: 1400, y: 120 }, view, SIZE), view).values!, "T1", "handle:handle-T1");
    atelier.commit(dragTo(V1, atelier.scene(), worldToScreen({ x: 200, y: 420 }, view, SIZE), view).values!, "V1", "handle:handle-V1");

    const saved = atelier.project;
    const expected = atelier.scene().points;

    // Relecture : sérialisation JSON (ce que fait IndexedDB), revalidation, re-résolution.
    const reloaded = validateTracingProject(JSON.parse(JSON.stringify(saved)));
    expect(reloaded.modelParams).toEqual(saved.modelParams);
    const resolution = resolve("turbine", reloaded.modelParams);
    expect(resolvedPlanScene(resolution)!.points).toEqual(expected);
  });

  it("n'enregistre que les écarts aux valeurs du modèle", () => {
    const atelier = openAtelier("turbine");
    const view = fitToBounds(atelier.scene().bounds, SIZE);
    const V1 = atelier.handles().find((handle) => handle.entityId === "V1")!;
    atelier.commit(dragTo(V1, atelier.scene(), worldToScreen({ x: 200, y: 420 }, view, SIZE), view).values!, "V1", "handle:handle-V1");

    // Seul `twist` bouge : le diamètre, les branches et l'orientation restent au modèle.
    expect(Object.keys(atelier.project.modelParams ?? {})).toEqual(["twist"]);
  });
});
