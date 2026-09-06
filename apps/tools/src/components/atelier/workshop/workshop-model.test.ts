/**
 * TRACING-WORKSHOP-UI-V1 §24 — l'état de l'Atelier éprouvé sur des modèles RÉELS.
 *
 * Aucune fixture de géométrie : chaque scène vient de `resolveTracingProjectModel`, donc
 * d'Engine B. Un modèle qui cesserait de publier ses cotes ou ses étapes ferait tomber ces
 * tests, et pas seulement ceux du moteur.
 */

import { describe, expect, it } from "vitest";
import { resolveTracingProjectModel } from "../../../lib/tracing/model-resolver";
import type { TraceModel } from "../../../lib/geometry/trace-model";
import { countSceneEntities } from "../viewport/plan-scene";
import {
  DIMENSION_KIND_LABELS,
  WORKSHOP_LAYERS,
  WORKSHOP_MODES,
  activeStep,
  canGoNext,
  canGoPrevious,
  createWorkshopState,
  dimensionGroups,
  exitStepByStep,
  goToStep,
  isDimensionKindVisible,
  layersForMode,
  nextStep,
  previousStep,
  setWorkshopGridStep,
  setWorkshopMode,
  startStepByStep,
  stepCount,
  stepProgressLabel,
  toggleDimensionKind,
  toggleExpertMode,
  toggleWorkshopGrid,
  toggleWorkshopLayer,
  workshopScene,
} from "./workshop-model";

function modelOf(modelId: string, modelParams?: Record<string, number>): TraceModel {
  const resolution = resolveTracingProjectModel({ modelId, modelParams } as Parameters<typeof resolveTracingProjectModel>[0]);
  if (resolution.status !== "resolved") throw new Error(`Modèle ${modelId} non résolu (${resolution.status}).`);
  return resolution.model;
}

const MODELS = ["ellipse-pedagogical", "flower-5", "arch-full-round", "star-5"] as const;

describe("modes d'affichage (§12)", () => {
  it("propose exactement les quatre modes de la consigne", () => {
    expect(WORKSHOP_MODES.map((mode) => mode.id)).toEqual(["forme", "construction", "cotations", "report"]);
  });

  it("montre le contour dans tous les modes : c'est le sujet du tracé", () => {
    for (const mode of WORKSHOP_MODES) expect(layersForMode(mode.id).shape).toBe(true);
  });

  it("le mode Forme ne montre QUE le résultat fini", () => {
    const layers = layersForMode("forme");
    expect(layers).toEqual({
      shape: true,
      construction: false,
      axes: false,
      dimensions: false,
      points: false,
      labels: false,
    });
  });

  it("changer de mode repart du préréglage, même après un réglage manuel", () => {
    const manual = toggleWorkshopLayer(createWorkshopState("construction"), "construction");
    expect(manual.layers.construction).toBe(false);
    const back = setWorkshopMode(setWorkshopMode(manual, "forme"), "construction");
    expect(back.layers).toEqual(layersForMode("construction"));
  });

  it("le mode Cotations allume les cotes, le mode Forme les éteint", () => {
    expect(layersForMode("cotations").dimensions).toBe(true);
    expect(layersForMode("forme").dimensions).toBe(false);
  });
});

describe("scène affichée (§12/§17)", () => {
  it.each(MODELS)("le mode Forme masque la construction de %s sans toucher au cadrage", (modelId) => {
    const model = modelOf(modelId);
    const forme = workshopScene(model, createWorkshopState("forme"));
    const construction = workshopScene(model, createWorkshopState("construction"));

    expect(forme.bounds).toEqual(model.bounds);
    expect(construction.bounds).toEqual(model.bounds);
    expect(forme.constructionLines).toHaveLength(0);
    expect(countSceneEntities(forme)).toBeLessThanOrEqual(countSceneEntities(construction));
  });

  it.each(MODELS)("aucun calque éteint ne fait apparaître d'entité dans %s", (modelId) => {
    const model = modelOf(modelId);
    let state = createWorkshopState("construction");
    const full = countSceneEntities(workshopScene(model, state));
    for (const layer of WORKSHOP_LAYERS) {
      state = toggleWorkshopLayer(state, layer.id);
      expect(countSceneEntities(workshopScene(model, state))).toBeLessThanOrEqual(full);
    }
  });

  it("tout éteindre laisse une scène vide mais valide — jamais une exception", () => {
    const model = modelOf("star-5");
    let state = createWorkshopState("construction");
    for (const layer of WORKSHOP_LAYERS) if (state.layers[layer.id]) state = toggleWorkshopLayer(state, layer.id);
    const scene = workshopScene(model, state);
    expect(countSceneEntities(scene)).toBe(0);
    expect(scene.bounds).toEqual(model.bounds);
  });

  it("la scène ne contient jamais d'entité absente du modèle résolu", () => {
    const model = modelOf("flower-5");
    const known = new Set(
      [
        ...model.points,
        ...model.segments,
        ...model.constructionLines,
        ...model.arcs,
        ...model.circles,
        ...model.ellipses,
        ...(model.polylines ?? []),
        ...(model.polygons ?? []),
      ].map((item) => item.id),
    );
    const scene = workshopScene(model, createWorkshopState("construction"));
    for (const item of [
      ...(scene.points ?? []),
      ...(scene.segments ?? []),
      ...(scene.constructionLines ?? []),
      ...(scene.arcs ?? []),
      ...(scene.circles ?? []),
      ...(scene.ellipses ?? []),
      ...(scene.polylines ?? []),
      ...(scene.polygons ?? []),
    ]) {
      expect(known.has(item.id)).toBe(true);
    }
  });
});

describe("cotations par catégorie (§15)", () => {
  it("ne propose que des catégories réellement présentes dans le modèle", () => {
    const model = modelOf("ellipse-pedagogical");
    const groups = dimensionGroups(model);
    const kinds = new Set(model.dimensions.map((dimension) => dimension.kind));
    expect(groups.map((group) => group.kind).sort()).toEqual([...kinds].sort());
    for (const group of groups) {
      expect(group.count).toBeGreaterThan(0);
      expect(group.label).toBe(DIMENSION_KIND_LABELS[group.kind]);
    }
  });

  it("masquer une catégorie retire ses cotes et laisse les autres", () => {
    const model = modelOf("ellipse-pedagogical");
    const groups = dimensionGroups(model);
    if (groups.length === 0) return;
    const target = groups[0].kind;
    const state = toggleDimensionKind(createWorkshopState("cotations"), target);

    expect(isDimensionKindVisible(state, target)).toBe(false);
    const scene = workshopScene(model, state);
    expect((scene.dimensions ?? []).some((dimension) => dimension.kind === target)).toBe(false);
    expect(scene.dimensions).toHaveLength(model.dimensions.length - groups[0].count);
  });

  it("le calque Cotations éteint l'emporte sur les catégories retenues", () => {
    const model = modelOf("ellipse-pedagogical");
    const state = toggleWorkshopLayer(createWorkshopState("cotations"), "dimensions");
    expect(workshopScene(model, state).dimensions).toHaveLength(0);
  });
});

describe("construction pas à pas (§13)", () => {
  it.each(MODELS)("%s publie des étapes exploitables", (modelId) => {
    const model = modelOf(modelId);
    expect(stepCount(model)).toBeGreaterThan(0);
    for (const step of model.steps) {
      expect(step.title.trim()).not.toBe("");
      expect(step.instruction.trim()).not.toBe("");
    }
  });

  it("entrer dans le pas-à-pas impose le mode Construction et la première étape", () => {
    const model = modelOf("arch-full-round");
    const state = startStepByStep(createWorkshopState("forme"), model);
    expect(state.mode).toBe("construction");
    expect(state.stepIndex).toBe(0);
    expect(activeStep(model, state)).toEqual(model.steps[0]);
  });

  it("un modèle sans étape ne fait pas entrer dans un mode vide", () => {
    const model = { ...modelOf("star-5"), steps: [] } as TraceModel;
    const state = startStepByStep(createWorkshopState("forme"), model);
    expect(state.stepIndex).toBeNull();
    expect(stepProgressLabel(state, model)).toBeNull();
  });

  it("la navigation reste bornée à la liste réelle", () => {
    const model = modelOf("arch-full-round");
    const total = stepCount(model);
    let state = startStepByStep(createWorkshopState("forme"), model);

    expect(canGoPrevious(state)).toBe(false);
    state = previousStep(state, model);
    expect(state.stepIndex).toBe(0);

    for (let index = 0; index < total + 3; index += 1) state = nextStep(state, model);
    expect(state.stepIndex).toBe(total - 1);
    expect(canGoNext(state, model)).toBe(false);
    expect(stepProgressLabel(state, model)).toBe(`Étape ${total} / ${total}`);

    expect(goToStep(state, model, -10).stepIndex).toBe(0);
    expect(goToStep(state, model, 999).stepIndex).toBe(total - 1);
    expect(exitStepByStep(state).stepIndex).toBeNull();
  });

  it("une étape qui déclare des entités visibles restreint la scène", () => {
    const model = modelOf("arch-full-round");
    const stepped = model.steps.find((step) => (step.visibleEntityIds?.length ?? 0) > 0);
    if (!stepped) return;
    const index = model.steps.indexOf(stepped);
    const state = goToStep(startStepByStep(createWorkshopState("forme"), model), model, index);
    const scene = workshopScene(model, state);
    expect(countSceneEntities(scene)).toBeLessThanOrEqual(
      countSceneEntities(workshopScene(model, exitStepByStep(state))),
    );
  });
});

describe("grille et mode expert (§16/§20)", () => {
  it("la grille est visible par défaut, au pas automatique", () => {
    const state = createWorkshopState();
    expect(state.gridVisible).toBe(true);
    expect(state.gridStepMm).toBeNull();
    expect(toggleWorkshopGrid(state).gridVisible).toBe(false);
  });

  it("un pas imposé est retenu, un pas absurde est ignoré", () => {
    const state = createWorkshopState();
    expect(setWorkshopGridStep(state, 250).gridStepMm).toBe(250);
    expect(setWorkshopGridStep(state, 0)).toBe(state);
    expect(setWorkshopGridStep(state, -100)).toBe(state);
    expect(setWorkshopGridStep(state, Number.NaN)).toBe(state);
    expect(setWorkshopGridStep(setWorkshopGridStep(state, 250), null).gridStepMm).toBeNull();
  });

  it("le mode expert est désactivé par défaut (§20)", () => {
    expect(createWorkshopState().expert).toBe(false);
    expect(toggleExpertMode(createWorkshopState()).expert).toBe(true);
  });
});
