/**
 * Atelier de traçage — interface professionnelle (TRACING-WORKSHOP-UI-V1).
 *
 * Cette couche ne calcule aucune géométrie : elle reçoit un `TraceModel` déjà résolu par
 * Engine B et décide de ce qui doit être MONTRÉ (modes, calques, cotes, étapes, grille,
 * mode expert). Elle n'appelle ni le moteur, ni les exports, ni la persistance.
 */

export { WorkshopPanel, type WorkshopPanelProps } from "./WorkshopPanel";
export { ModeSwitcher, type ModeSwitcherProps } from "./ModeSwitcher";
export { LayersPanel, type LayersPanelProps } from "./LayersPanel";
export { GridPanel, type GridPanelProps } from "./GridPanel";
export { DimensionsPanel, type DimensionsPanelProps } from "./DimensionsPanel";
export { StepNavigator, type StepNavigatorProps } from "./StepNavigator";
export { ReportPointsPanel } from "./ReportPointsPanel";
export { ExpertPanel } from "./ExpertPanel";
export {
  DEFAULT_WORKSHOP_STATE,
  DIMENSION_KIND_LABELS,
  DIMENSION_KIND_ORDER,
  FREE_LAYERS,
  PARAMETRIC_LAYERS,
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
  workshopFreeScene,
  workshopScene,
  workshopSource,
  type DimensionGroup,
  type DimensionKind,
  type WorkshopLayerId,
  type WorkshopLayers,
  type WorkshopMode,
  type WorkshopSource,
  type WorkshopState,
} from "./workshop-model";
