/**
 * Fondation UI interactive de l'Atelier (ATELIER-VIEWPORT-INTERACTION-FOUNDATION-V1).
 *
 * Viewport SVG (pan / zoom / pinch), grille visuelle adaptative, barre d'outils mobile,
 * shell du panneau propriétés et API de sélection préparatoire. Tout arrive par props : aucun
 * accès au moteur géométrique, aux modèles, aux adaptateurs, aux exports ni à la persistance.
 *
 * ATELIER-RESOLVED-MODEL-VIEWPORT-INTEGRATION-V1 : `resolved-scene` et `ResolvedModelViewport`
 * ajoutent le branchement sur un modèle DÉJÀ résolu par Engine B. La règle ci-dessus tient
 * toujours — ces deux modules lisent une `TracingModelResolution` reçue en argument, ils
 * n'appellent jamais le moteur eux-mêmes.
 *
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 : `HandleLayer` dessine les poignées, et `AtelierEditingApi`
 * les relaie. La règle tient encore — les poignées arrivent en props, calculées par
 * `lib/tracing/handle-map.ts` : le viewport ne construit aucune poignée et n'appelle jamais un
 * générateur de modèle.
 *
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 : le tracé libre ajoute `free-draw-model` (automate pur du
 * geste de création) et `FreeDrawPreviewLayer` (rendu du tracé en cours). La règle tient encore :
 * la géométrie libre arrive en props, sa validation et son historique vivent dans `lib/tracing/`,
 * et le viewport n'écrit jamais dans le document — il émet des intentions.
 *
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 : `intersections`, `selection-cycle` et `selection-set`
 * sont trois modules PURS de plus (géométrie et règles de sélection), réexportés ici pour que
 * l'Atelier n'ait qu'un point d'entrée. Aucun ne connaît React, l'écran ni la persistance.
 */

export { PlanViewport, type PlanViewportProps, type PlanViewportRenderArgs } from "./PlanViewport";
export { PlanSceneLayer, type PlanSceneLayerProps } from "./PlanSceneLayer";
export { GridOverlay } from "./GridOverlay";
export { AtelierToolbar, type AtelierToolbarProps } from "./AtelierToolbar";
export { HandleLayer, type HandleLayerProps } from "./HandleLayer";
export { PropertiesSheet, type PropertiesSheetProps } from "./PropertiesSheet";
export {
  AtelierViewportWorkspace,
  type AtelierEditingApi,
  type AtelierFreeDrawingApi,
  type AtelierViewportWorkspaceProps,
  type FreeVertexMove,
} from "./AtelierViewportWorkspace";
export { FreeDrawPreviewLayer, type FreeDrawPreviewLayerProps } from "./FreeDrawPreviewLayer";
export {
  FREE_DRAW_EPSILON_MM,
  FREE_DRAW_TOOLS,
  beginFreeDraw,
  canFinishFreeDraw,
  freeDrawCancel,
  freeDrawClick,
  freeDrawFinish,
  freeDrawGhostSegments,
  freeDrawHint,
  isFreeDrawInProgress,
  type FreeDrawCommit,
  type FreeDrawState,
  type FreeDrawStep,
  type FreeDrawTool,
} from "./free-draw-model";
export {
  buildFreeVertexHandles,
  countFreeVertexHandles,
  freeHandleId,
} from "@/lib/tracing/free-handles";
export {
  EMPTY_FREE_GEOMETRY,
  FREE_GEOMETRY_VERSION,
  MAX_FREE_ENTITIES,
  MAX_FREE_POLYLINE_VERTICES,
  MAX_FREE_VERTICES,
  addFreeEntity,
  countFreeEntitiesByKind,
  createFreeEntity,
  deletableFreeEntityIds,
  findFreeEntity,
  freeEntityKindLabel,
  freeEntityLabel,
  freeEntityLength,
  freeGeometryBounds,
  freeGeometryIsEmpty,
  freeGeometryLength,
  moveFreeVertex,
  nextFreeEntityId,
  removeFreeEntities,
  validateFreeGeometry,
  type FreeEntity,
  type FreeEntityKind,
  type FreeGeometry,
  type FreeVertex,
} from "@/lib/tracing/free-geometry";
export { freeGeometryToShape, freeSceneBounds } from "@/lib/tracing/free-shape";
export { ResolvedModelViewport, type ResolvedModelViewportProps } from "./ResolvedModelViewport";
export { atelierViewKey, planSceneForStep, resolvedPlanScene, stepAt } from "./resolved-scene";
export { usePlanViewport, type PlanViewportController } from "./use-plan-viewport";
export {
  HIT_PRIORITY,
  hitTest,
  hitTestAll,
  hitTestCandidates,
  type HitEntityKind,
  type HitTestResult,
  type HitTestScene,
} from "@/lib/geometry/hit-test";
export {
  MAX_INTERSECTION_ENTITIES,
  SNAP_PRIORITY,
  geometrySnapCandidates,
  intersectionSnapCandidates,
  snap,
  snapCandidates,
  snapToGrid,
  type SnapCandidate,
  type SnapKind,
  type SnapOptions,
} from "@/lib/geometry/snap";
export {
  INTERSECTION_TOLERANCE_MM,
  arcArcIntersections,
  arcCircleIntersections,
  circleCircleIntersections,
  intersectionsBetween,
  lineSegmentIntersections,
  segmentArcIntersections,
  segmentCircleIntersections,
  segmentSegmentIntersections,
  type Intersectable,
} from "@/lib/geometry/intersections";
export {
  SELECTION_CYCLE_ANCHOR_PX,
  SELECTION_CYCLE_SCALE_RATIO,
  advanceSelectionCycle,
  type SelectionCycleRequest,
  type SelectionCycleState,
  type SelectionCycleStep,
} from "@/lib/viewport/selection-cycle";
export {
  EMPTY_SELECTION,
  applySelectionClick,
  primarySelection,
  pruneSelection,
  selectionFromId,
  toggleSelection,
} from "@/lib/viewport/selection-set";
export {
  POINTER_TOLERANCE_PX,
  SNAP_TOLERANCE_PX,
  TOUCH_SNAP_TOLERANCE_PX,
  TOUCH_TOLERANCE_PX,
  pointerPrecisionOf,
  selectionTolerancePx,
  snapTolerancePx,
  toleranceWorldFor,
  type PointerPrecision,
} from "@/lib/viewport/pointer-targeting";
export { useViewportGestures, DRAG_THRESHOLD_PX, type ViewportGestureHandlers } from "./use-viewport-gestures";
export {
  HANDLE_GRAB_PX,
  TOUCH_HANDLE_GRAB_PX,
  handleGrabPx,
} from "@/lib/viewport/pointer-targeting";
export {
  buildEditableHandles,
  findHandle,
  nearestEditableHandle,
  HANDLE_RULES,
} from "@/lib/tracing/handle-map";
export {
  describeHandleDrives,
  describeHandleValues,
  measureAt,
  paramsForHandleTarget,
  quantiseParam,
  type EditableHandle,
  type HandleConstraint,
  type HandleDrive,
  type HandleMeasure,
} from "@/lib/tracing/editable-handle";
export {
  buildToolbarModel,
  canEditHandles,
  canSelectEntities,
  DEFAULT_TOOLBAR_STATE,
  freeDrawToolOf,
  showsSnapFeedback,
  selectTool,
  shouldPanOnBackgroundDrag,
  toggleGrid,
  toggleProperties,
  type AtelierTool,
  type ToolbarActionId,
  type ToolbarCapabilities,
  type ToolbarButtonModel,
  type ToolbarState,
} from "./toolbar-model";
export {
  countSceneEntities,
  describeSceneEntity,
  describeSceneSelection,
  entityKindLabel,
  formatMillimetres,
  formatWorldPoint,
  entityLabel,
  listSceneEntities,
  type PlanScene,
  type PropertyRow,
  type SceneEntityDetails,
  type SceneEntityKind,
  type SceneEntitySummary,
  type SceneSelectionSummary,
} from "./plan-scene";
export { DENSE_SCENE, MEDIUM_SCENE, PREVIEW_SCENES, SIMPLE_SCENE, createDenseScene } from "./preview-fixture";
