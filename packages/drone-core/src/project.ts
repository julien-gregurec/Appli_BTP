/**
 * [DroneProject] — projet de relevé, unité de travail et unité de facturation.
 */

import type { ExternalReference, IsoDate, IsoDateTime, TenantScoped, Timestamped } from "./common";
import type { DroneProjectId, UtilisateurId } from "./ids";
import type { Wgs84Position } from "./units";

export type SurveyType =
  | "roof"
  | "facade"
  | "photovoltaic"
  | "inspection"
  | "thermal"
  | "model_3d"
  | "other";

export const SURVEY_TYPES: readonly SurveyType[] = [
  "roof",
  "facade",
  "photovoltaic",
  "inspection",
  "thermal",
  "model_3d",
  "other",
];

/**
 * Cycle de vie (§5 du modèle de données).
 *
 * `validated` signifie « un humain a validé la géométrie », pas « le calcul a réussi ».
 */
export type DroneProjectStatus =
  | "draft"
  | "mission_prepared"
  | "acquisition_in_progress"
  | "media_imported"
  | "quality_check"
  | "reconstruction"
  | "to_validate"
  | "validated"
  | "report_generated"
  | "archived";

export const DRONE_PROJECT_STATUSES: readonly DroneProjectStatus[] = [
  "draft",
  "mission_prepared",
  "acquisition_in_progress",
  "media_imported",
  "quality_check",
  "reconstruction",
  "to_validate",
  "validated",
  "report_generated",
  "archived",
];

/**
 * Transitions autorisées.
 *
 * Le point structurant est `draft → media_imported` : l'import après vol est le mode nominal
 * (§61), et le schéma ne doit jamais forcer un utilisateur à traverser un état de mission.
 * `reconstruction → media_imported` est la reprise après échec.
 */
const TRANSITIONS: Record<DroneProjectStatus, readonly DroneProjectStatus[]> = {
  draft: ["mission_prepared", "media_imported", "archived"],
  mission_prepared: ["acquisition_in_progress", "media_imported", "archived"],
  acquisition_in_progress: ["media_imported", "archived"],
  media_imported: ["quality_check", "reconstruction", "archived"],
  quality_check: ["media_imported", "reconstruction", "archived"],
  reconstruction: ["to_validate", "media_imported", "archived"],
  to_validate: ["validated", "reconstruction", "archived"],
  validated: ["report_generated", "to_validate", "archived"],
  report_generated: ["validated", "archived"],
  archived: [],
};

export function transitionsProjetAutorisees(
  status: DroneProjectStatus,
): readonly DroneProjectStatus[] {
  return TRANSITIONS[status];
}

export function peutTransitionnerProjet(
  from: DroneProjectStatus,
  to: DroneProjectStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * §47, §49 — conservation et consentement. La conservation est un paramètre du projet, pas
 * une constante du produit ; le consentement est tracé, jamais supposé.
 */
export type ProcessingConsent = {
  readonly granted: boolean;
  readonly granted_at: IsoDateTime | null;
  readonly granted_by: UtilisateurId | null;
  readonly scope: string | null;
};

export const CONSENTEMENT_NON_RECUEILLI: ProcessingConsent = {
  granted: false,
  granted_at: null,
  granted_by: null,
  scope: null,
};

export type DroneProject = TenantScoped &
  Timestamped & {
    readonly id: DroneProjectId;
    readonly name: string;
    readonly survey_type: SurveyType;
    readonly status: DroneProjectStatus;
    /** §12 — facultatifs : un projet standalone n'a pas nécessairement de client identifié. */
    readonly client_name: string | null;
    readonly address: string | null;
    readonly position: Wgs84Position | null;
    readonly survey_date: IsoDate | null;
    readonly operator_id: UtilisateurId | null;
    /** §47 — durée de conservation configurable, en jours. `null` = politique par défaut. */
    readonly retention_days: number | null;
    readonly processing_consent: ProcessingConsent;
    /** §117 — lien faible, tout nul en mode standalone. */
    readonly external_reference: ExternalReference;
  };
