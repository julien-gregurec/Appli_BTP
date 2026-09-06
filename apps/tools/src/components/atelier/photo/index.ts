/**
 * Parcours photo de l'Atelier (WORKSHOP-UI-CANONICAL-V2 §6/§13).
 *
 * Surface d'interface du workflow image/vectorisation canonique. Cette couche n'implémente
 * aucun traitement d'image : elle appelle `lib/tracing/api.ts` et affiche ses résultats, y
 * compris ses refus et ses écarts mesurés.
 */

export { ReferenceImagePanel, type ReferenceImagePanelProps } from "./ReferenceImagePanel";
export {
  PICKING_TARGET,
  addPickedPoint,
  confirmBlockers,
  parseRealDistance,
  photoSteps,
  quadOf,
  type PhotoPicking,
  type PhotoPoint,
  type PhotoStep,
  type PhotoStepId,
  type PhotoStepStatus,
  type PhotoWorkflowInput,
} from "./photo-workflow";
