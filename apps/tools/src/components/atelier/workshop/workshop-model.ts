/**
 * TRACING-WORKSHOP-UI-V1 §12/§13/§15/§16/§17/§20 — état de l'Atelier de traçage, isolé du rendu.
 *
 * Module PUR : aucun React, aucun DOM, aucun appel au moteur géométrique. Il reçoit un
 * `TraceModel` DÉJÀ résolu par Engine B (`resolveTracingProjectModel`) et en dérive ce que
 * l'écran doit montrer. Il ne calcule aucune géométrie, ne corrige aucune valeur, n'invente
 * aucune cote ni aucun point : filtrer une scène, c'est masquer des entités existantes,
 * jamais en fabriquer.
 *
 * Les quatre modes d'affichage (§12) sont des PRÉRÉGLAGES de calques, pas des états
 * séparés : chaque mode pose une combinaison de calques utile sur chantier, et l'artisan
 * reste libre de l'ajuster ensuite. Changer de mode repart du préréglage — c'est la seule
 * règle qui rende le comportement prévisible après une série d'ajustements manuels.
 */

import type { Dimension } from "../../../lib/geometry/primitives";
import type { SiteStep } from "../../../lib/geometry/shape-model";
import type { TraceModel } from "../../../lib/geometry/trace-model";
import type { PlanScene } from "../viewport/plan-scene";
import { planSceneForStep, stepAt } from "../viewport/resolved-scene";

/* ---- Modes d'affichage (§12) --------------------------------------------- */

export type WorkshopMode = "forme" | "construction" | "cotations" | "report";

export const WORKSHOP_MODES: readonly { id: WorkshopMode; label: string; hint: string }[] = [
  { id: "forme", label: "Forme", hint: "Le tracé fini, sans rien autour." },
  { id: "construction", label: "Construction", hint: "Axes, centres et traits de construction." },
  { id: "cotations", label: "Cotations", hint: "Les dimensions à relever." },
  { id: "report", label: "Report", hint: "Les points nommés et leurs coordonnées." },
];

/* ---- Calques (§17) -------------------------------------------------------- */

/**
 * Calques réellement portés par la géométrie du moteur. Aucun calque « Électricité » ni
 * « Annotations » n'est proposé : rien dans `ShapeGeometry` ne les alimente, un interrupteur
 * qui ne masque rien serait un bouton mort (§22).
 */
export type WorkshopLayerId = "shape" | "construction" | "axes" | "dimensions" | "points" | "labels";

export const WORKSHOP_LAYERS: readonly { id: WorkshopLayerId; label: string }[] = [
  { id: "shape", label: "Contour" },
  { id: "construction", label: "Construction" },
  { id: "axes", label: "Axes" },
  { id: "dimensions", label: "Cotations" },
  { id: "points", label: "Points" },
  { id: "labels", label: "Étiquettes" },
];

export type WorkshopLayers = Readonly<Record<WorkshopLayerId, boolean>>;

const MODE_LAYER_PRESETS: Readonly<Record<WorkshopMode, WorkshopLayers>> = {
  forme: { shape: true, construction: false, axes: false, dimensions: false, points: false, labels: false },
  construction: { shape: true, construction: true, axes: true, dimensions: false, points: true, labels: true },
  cotations: { shape: true, construction: false, axes: true, dimensions: true, points: false, labels: true },
  report: { shape: true, construction: false, axes: true, dimensions: false, points: true, labels: true },
};

export function layersForMode(mode: WorkshopMode): WorkshopLayers {
  return MODE_LAYER_PRESETS[mode];
}

/* ---- Cotations par catégorie (§15) --------------------------------------- */

/**
 * Catégories de cotes = les `kind` réellement publiés par `Dimension`. La consigne cite aussi
 * « entraxes » et « LED » : aucun `kind` ne les porte, ils ne sont donc pas proposés ici —
 * une case à cocher qui ne filtrerait rien serait pire qu'absente.
 */
export type DimensionKind = Dimension["kind"];

export const DIMENSION_KIND_LABELS: Readonly<Record<DimensionKind, string>> = {
  linear: "Dimensions générales",
  aligned: "Distances",
  radius: "Rayons",
  diameter: "Diamètres",
  angle: "Angles",
  annotation: "Annotations",
};

/** Ordre d'affichage stable, du plus structurant au plus accessoire. */
export const DIMENSION_KIND_ORDER: readonly DimensionKind[] = [
  "linear",
  "aligned",
  "radius",
  "diameter",
  "angle",
  "annotation",
];

export type DimensionGroup = { kind: DimensionKind; label: string; count: number };

/** Catégories PRÉSENTES dans le modèle, avec leur effectif. Les absentes ne sont pas listées. */
export function dimensionGroups(model: TraceModel): readonly DimensionGroup[] {
  const counts = new Map<DimensionKind, number>();
  for (const dimension of model.dimensions) {
    counts.set(dimension.kind, (counts.get(dimension.kind) ?? 0) + 1);
  }
  return DIMENSION_KIND_ORDER.filter((kind) => counts.has(kind)).map((kind) => ({
    kind,
    label: DIMENSION_KIND_LABELS[kind],
    count: counts.get(kind) ?? 0,
  }));
}

/* ---- État ---------------------------------------------------------------- */

export type WorkshopState = {
  mode: WorkshopMode;
  layers: WorkshopLayers;
  gridVisible: boolean;
  /** `null` = pas automatique, calé sur le zoom (§16). */
  gridStepMm: number | null;
  /** Catégories de cotes masquées (§15). Vide = toutes visibles. */
  hiddenDimensionKinds: readonly DimensionKind[];
  /** §20 — coordonnées, rayons et angles détaillés. Désactivé par défaut. */
  expert: boolean;
  /** §13 — index de l'étape de construction affichée ; `null` = vue d'ensemble. */
  stepIndex: number | null;
};

export const DEFAULT_WORKSHOP_STATE: WorkshopState = {
  mode: "forme",
  layers: MODE_LAYER_PRESETS.forme,
  gridVisible: true,
  gridStepMm: null,
  hiddenDimensionKinds: [],
  expert: false,
  stepIndex: null,
};

export function createWorkshopState(mode: WorkshopMode = "forme"): WorkshopState {
  return { ...DEFAULT_WORKSHOP_STATE, mode, layers: MODE_LAYER_PRESETS[mode] };
}

/**
 * Changer de mode REPART du préréglage de calques. Conserver les réglages manuels du mode
 * précédent donnerait un « mode Cotations sans cotes » selon ce qu'on a touché avant : le
 * mode ne voudrait alors plus rien dire.
 */
export function setWorkshopMode(state: WorkshopState, mode: WorkshopMode): WorkshopState {
  if (state.mode === mode) return state;
  return { ...state, mode, layers: MODE_LAYER_PRESETS[mode] };
}

export function toggleWorkshopLayer(state: WorkshopState, layer: WorkshopLayerId): WorkshopState {
  return { ...state, layers: { ...state.layers, [layer]: !state.layers[layer] } };
}

export function toggleWorkshopGrid(state: WorkshopState): WorkshopState {
  return { ...state, gridVisible: !state.gridVisible };
}

/** Pas imposé, ou `null` pour revenir au pas automatique. Un pas non exploitable est ignoré. */
export function setWorkshopGridStep(state: WorkshopState, stepMm: number | null): WorkshopState {
  if (stepMm !== null && (!Number.isFinite(stepMm) || stepMm <= 0)) return state;
  return { ...state, gridStepMm: stepMm };
}

export function toggleExpertMode(state: WorkshopState): WorkshopState {
  return { ...state, expert: !state.expert };
}

export function toggleDimensionKind(state: WorkshopState, kind: DimensionKind): WorkshopState {
  const hidden = state.hiddenDimensionKinds.includes(kind)
    ? state.hiddenDimensionKinds.filter((item) => item !== kind)
    : [...state.hiddenDimensionKinds, kind];
  return { ...state, hiddenDimensionKinds: hidden };
}

export function isDimensionKindVisible(state: WorkshopState, kind: DimensionKind): boolean {
  return !state.hiddenDimensionKinds.includes(kind);
}

/* ---- Construction pas à pas (§13) ---------------------------------------- */

export function stepCount(model: TraceModel | null): number {
  return model?.steps.length ?? 0;
}

/**
 * Entrer dans le pas-à-pas. Le mode Construction est imposé en même temps : suivre une étape
 * sans voir les traits de construction qu'elle décrit n'aurait aucun sens sur chantier.
 * Sans étape publiée par le modèle, l'état est inchangé — pas de mode vide.
 */
export function startStepByStep(state: WorkshopState, model: TraceModel | null): WorkshopState {
  if (stepCount(model) === 0) return state;
  return { ...setWorkshopMode(state, "construction"), stepIndex: 0 };
}

export function exitStepByStep(state: WorkshopState): WorkshopState {
  return state.stepIndex === null ? state : { ...state, stepIndex: null };
}

/** Index borné à la liste réelle : jamais d'étape hors plage, jamais d'écran vide. */
export function goToStep(state: WorkshopState, model: TraceModel | null, index: number): WorkshopState {
  const total = stepCount(model);
  if (total === 0) return exitStepByStep(state);
  const bounded = Math.min(Math.max(index, 0), total - 1);
  return bounded === state.stepIndex ? state : { ...state, stepIndex: bounded };
}

export function nextStep(state: WorkshopState, model: TraceModel | null): WorkshopState {
  return goToStep(state, model, (state.stepIndex ?? -1) + 1);
}

export function previousStep(state: WorkshopState, model: TraceModel | null): WorkshopState {
  return goToStep(state, model, (state.stepIndex ?? 0) - 1);
}

export function activeStep(model: TraceModel | null, state: WorkshopState): SiteStep | null {
  return model ? stepAt(model, state.stepIndex) : null;
}

export function canGoNext(state: WorkshopState, model: TraceModel | null): boolean {
  return state.stepIndex !== null && state.stepIndex < stepCount(model) - 1;
}

export function canGoPrevious(state: WorkshopState): boolean {
  return state.stepIndex !== null && state.stepIndex > 0;
}

/** « Étape 3 / 7 » — `null` hors pas-à-pas, pour ne rien afficher plutôt qu'un compteur vide. */
export function stepProgressLabel(state: WorkshopState, model: TraceModel | null): string | null {
  const total = stepCount(model);
  if (state.stepIndex === null || total === 0) return null;
  return `Étape ${state.stepIndex + 1} / ${total}`;
}

/* ---- Scène affichée ------------------------------------------------------ */

function isConstructionRole(role: string | undefined): boolean {
  return role === "construction";
}

function isAxisRole(role: string | undefined): boolean {
  return role === "axis";
}

/** Garde une liste, ou la remplace par un tableau vide — jamais `undefined`, pour que la
 *  scène dise explicitement « rien à montrer » plutôt que « champ non renseigné ». */
function keepIf<T>(visible: boolean, items: readonly T[] | undefined): readonly T[] {
  return visible ? (items ?? []) : [];
}

/**
 * Scène remise au viewport : le modèle résolu, restreint à l'étape active puis aux calques
 * visibles et aux catégories de cotes retenues.
 *
 * Les BORNES ne sont jamais recalculées (comme `planSceneForStep`) : masquer un calque ne doit
 * pas recadrer le plan, sinon le tracé sauterait à chaque bascule d'interrupteur.
 */
export function workshopScene(model: TraceModel, state: WorkshopState): PlanScene {
  const stepped = planSceneForStep(model, activeStep(model, state));
  const { layers } = state;

  const segments = (stepped.segments ?? []).filter((item) =>
    isAxisRole(item.role) ? layers.axes : isConstructionRole(item.role) ? layers.construction : layers.shape,
  );
  const constructionLines = (stepped.constructionLines ?? []).filter((item) =>
    isAxisRole(item.role) ? layers.axes : layers.construction,
  );
  const shapeOrConstruction = <T extends { role?: string }>(items: readonly T[] | undefined): readonly T[] =>
    (items ?? []).filter((item) => (isConstructionRole(item.role) ? layers.construction : layers.shape));

  const dimensions = layers.dimensions
    ? (stepped.dimensions ?? []).filter((item) => isDimensionKindVisible(state, item.kind))
    : [];

  return {
    id: stepped.id,
    name: stepped.name,
    bounds: stepped.bounds,
    points: keepIf(layers.points, stepped.points),
    segments,
    constructionLines,
    arcs: shapeOrConstruction(stepped.arcs),
    circles: shapeOrConstruction(stepped.circles),
    ellipses: shapeOrConstruction(stepped.ellipses),
    polylines: shapeOrConstruction(stepped.polylines),
    polygons: shapeOrConstruction(stepped.polygons),
    dimensions,
  };
}
