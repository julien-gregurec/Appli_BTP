/**
 * [DroneMission] — paramètres d'acquisition, planifiés ou constatés.
 *
 * Un projet peut n'avoir **aucune** mission : c'est le cas nominal de l'import après vol
 * (§61). Rien dans ces contrats ne doit rendre la mission obligatoire.
 */

import type { IsoDateTime, TenantScoped, Timestamped } from "./common";
import type { DroneDeviceId, DroneMissionId, DroneProjectId } from "./ids";
import type { Altitude, GroundSamplingDistance, Wgs84Position } from "./units";

export type MissionStatus = "planned" | "in_progress" | "completed" | "aborted" | "observed";

export const MISSION_STATUSES: readonly MissionStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "aborted",
  "observed",
];

/**
 * `observed` est le statut d'une mission **reconstituée après coup** à partir des EXIF d'un
 * import : elle décrit ce qui a été volé, pas ce qui avait été planifié.
 */
export type FlightPattern = "grid" | "double_grid" | "orbit" | "facade_sweep" | "free_flight";

export const FLIGHT_PATTERNS: readonly FlightPattern[] = [
  "grid",
  "double_grid",
  "orbit",
  "facade_sweep",
  "free_flight",
];

export type MissionWaypoint = {
  readonly index: number;
  readonly position: Wgs84Position;
  readonly gimbal_pitch_deg: number | null;
  readonly heading_deg: number | null;
};

export type DroneMission = TenantScoped &
  Timestamped & {
    readonly id: DroneMissionId;
    readonly project_id: DroneProjectId;
    readonly device_id: DroneDeviceId | null;
    readonly status: MissionStatus;
    readonly pattern: FlightPattern | null;
    readonly altitude: Altitude | null;
    readonly front_overlap_percent: number | null;
    readonly side_overlap_percent: number | null;
    readonly target_gsd: GroundSamplingDistance | null;
    readonly gimbal_pitch_deg: number | null;
    readonly waypoints: readonly MissionWaypoint[];
    readonly started_at: IsoDateTime | null;
    readonly finished_at: IsoDateTime | null;
  };
