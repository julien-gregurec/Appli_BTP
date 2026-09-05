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
  type AtelierViewportWorkspaceProps,
} from "./AtelierViewportWorkspace";
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
  SNAP_PRIORITY,
  geometrySnapCandidates,
  snap,
  snapCandidates,
  snapToGrid,
  type SnapCandidate,
  type SnapKind,
  type SnapOptions,
} from "@/lib/geometry/snap";
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
  entityKindLabel,
  entityLabel,
  listSceneEntities,
  type PlanScene,
  type PropertyRow,
  type SceneEntityDetails,
  type SceneEntityKind,
  type SceneEntitySummary,
} from "./plan-scene";
export { DENSE_SCENE, MEDIUM_SCENE, PREVIEW_SCENES, SIMPLE_SCENE, createDenseScene } from "./preview-fixture";
