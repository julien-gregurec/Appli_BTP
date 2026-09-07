/**
 * Intégrations écosystème — §19 du brief noyau, §N de l'architecture.
 *
 * **Contrats uniquement. Aucune intégration réelle n'est ouverte par ce lot.**
 *
 * Trois règles y sont inscrites, et elles sont la raison d'être du mode standalone (§43) :
 *
 * 1. aucune clé étrangère entre applications — la liaison passe par `ExternalReference` ;
 * 2. le sens du flux est toujours Drone → application cible, jamais l'inverse ;
 * 3. chaque cible reçoit un sous-ensemble strict, et ce sous-ensemble est dans le type :
 *    Gestion Pro ne reçoit pas le modèle 3D, Tools ne reçoit pas les médias bruts, et
 *    Réserves reçoit un brouillon, pas une réserve validée.
 *
 * Une implémentation absente n'empêche rien : un déploiement Drone dont aucun de ces ports
 * n'est branché est un déploiement pleinement fonctionnel.
 */

import type { ExternalReference } from "../common";
import type { DroneProjectId } from "../ids";
import type {
  DroneInspectionExportV1,
  DroneMeasurementExportV1,
  DroneProjectSummaryV1,
  DroneRoofExportV1,
  DroneSolarExportV1,
  ReserveDraftV1,
} from "../exports";

/** Résultat d'une publication vers une application tierce. */
export type EcosystemPushResult = {
  readonly accepted: boolean;
  /** Référence opaque côté application distante, à stocker dans `ExternalReference`. */
  readonly external_reference: string | null;
  readonly message: string | null;
};

/** §119 — Gestion Pro reçoit le résumé, les métrés et le PV. Jamais le modèle 3D. */
export interface GestionProDronePort {
  publishProjectSummary(payload: DroneProjectSummaryV1): Promise<EcosystemPushResult>;
  publishSolarLayouts(payload: DroneSolarExportV1): Promise<EcosystemPushResult>;
}

/** §120 — Tools reçoit contours, plans et mesures. Jamais les médias bruts. */
export interface ToolsDronePort {
  publishRoofGeometry(payload: DroneRoofExportV1): Promise<EcosystemPushResult>;
  publishMeasurements(payload: DroneMeasurementExportV1): Promise<EcosystemPushResult>;
}

/** §118 — Réserves reçoit des **brouillons**. La validation reste chez Réserves. */
export interface ReservesDronePort {
  publishReserveDrafts(payload: DroneInspectionExportV1): Promise<EcosystemPushResult>;
  /** Publication unitaire, pour un constat isolé transformé à la main par l'opérateur. */
  publishReserveDraft(draft: ReserveDraftV1): Promise<EcosystemPushResult>;
}

/**
 * Applique le résultat d'une publication à la référence faible du projet. Fonction pure :
 * elle ne parle à personne, elle calcule le nouvel état de liaison.
 */
export function appliquerResultatPublication(input: {
  readonly project_id: DroneProjectId;
  readonly current: ExternalReference;
  readonly result: EcosystemPushResult;
  readonly source_app: NonNullable<ExternalReference["source_app"]>;
  readonly at: string;
}): ExternalReference {
  if (!input.result.accepted) {
    return input.current.sync_status === "linked"
      ? { ...input.current, sync_status: "desynchronized" }
      : input.current;
  }

  return {
    source_app: input.source_app,
    external_reference: input.result.external_reference,
    sync_status: "linked",
    synchronized_at: input.at,
  };
}
