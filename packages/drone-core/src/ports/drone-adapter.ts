/**
 * `DroneAdapter` — §13 du brief noyau, §D de l'architecture.
 *
 * Aucune implémentation DJI ici : seulement le contrat.
 *
 * **`capabilities()` est la méthode structurante.** Sans elle, l'interface ment : elle promet
 * `startMission()` sur un Mini 3 qui ne sait pas l'exécuter. L'interface utilisateur se
 * construit sur les capacités déclarées, jamais sur l'existence d'une méthode. Toute méthode
 * dont la capacité correspondante est fausse doit rejeter avec `CapaciteNonSupporteeError`,
 * et non se comporter comme si de rien n'était.
 *
 * Contrainte de performance héritée du §100 : le flux vidéo ne traverse pas le pont JS. Ici,
 * `videoFeed()` retourne un **descripteur de surface**, jamais des trames.
 */

import type { IsoDateTime } from "../common";
import type { Altitude, Wgs84Position } from "../units";

export type DroneAdapterKind = "import" | "demo" | "dji" | "parrot";

/** Ce que **cet** adaptateur sait faire, sur **ce** matériel. */
export type DroneCapabilities = {
  readonly live_connection: boolean;
  readonly telemetry: boolean;
  readonly video_feed: boolean;
  readonly photo_capture: boolean;
  readonly waypoint_missions: boolean;
  readonly media_download: boolean;
  readonly gimbal_control: boolean;
};

/** Adaptateur d'import : aucune connexion, et pourtant 100 % du marché adressable. */
export const CAPACITES_IMPORT: DroneCapabilities = {
  live_connection: false,
  telemetry: false,
  video_feed: false,
  photo_capture: false,
  waypoint_missions: false,
  media_download: true,
  gimbal_control: false,
};

export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

export type DroneDeviceInfo = {
  readonly manufacturer: string;
  readonly model: string;
  readonly serial_number: string | null;
  readonly firmware_version: string | null;
  readonly controller_model: string | null;
};

export type BatteryState = {
  readonly percent: number;
  readonly voltage_v: number | null;
  readonly temperature_c: number | null;
};

export type GimbalState = {
  readonly pitch_deg: number;
  readonly yaw_deg: number;
  readonly roll_deg: number;
};

export type CameraState = {
  readonly recording: boolean;
  readonly remaining_photos: number | null;
  readonly storage_free_bytes: number | null;
};

export type TelemetryEvent = {
  readonly recorded_at: IsoDateTime;
  readonly position: Wgs84Position | null;
  readonly relative_altitude: Altitude | null;
  readonly yaw_deg: number | null;
  readonly pitch_deg: number | null;
  readonly roll_deg: number | null;
  readonly battery_percent: number | null;
};

/**
 * Descripteur de surface de rendu vidéo. Le rendu est natif ; le pont JS ne reçoit que cet
 * identifiant, jamais une trame.
 */
export type VideoFeedDescriptor = {
  readonly surface_id: string;
  readonly width_px: number;
  readonly height_px: number;
};

export type MediaDownloadProgress = {
  readonly downloaded_count: number;
  readonly total_count: number;
  readonly downloaded_bytes: number;
  readonly total_bytes: number | null;
};

export type MissionControlState = "idle" | "running" | "paused" | "stopped";

export class CapaciteNonSupporteeError extends Error {
  constructor(public readonly capacite: keyof DroneCapabilities) {
    super(`Capacité non supportée par cet adaptateur : ${capacite}`);
    this.name = "CapaciteNonSupporteeError";
  }
}

export interface DroneAdapter {
  readonly kind: DroneAdapterKind;

  capabilities(): DroneCapabilities;

  connect(): Promise<ConnectionState>;
  disconnect(): Promise<void>;
  connectionState(): ConnectionState;

  deviceInfo(): Promise<DroneDeviceInfo | null>;
  batteryState(): Promise<BatteryState | null>;
  cameraState(): Promise<CameraState | null>;
  gimbalState(): Promise<GimbalState | null>;

  /** Flux d'événements légers. Le pont JS ne porte que ça. */
  telemetry(): AsyncIterable<TelemetryEvent>;

  /** Descripteur de surface native — jamais des trames. */
  videoFeed(): Promise<VideoFeedDescriptor>;

  capturePhoto(): Promise<void>;

  startMission(missionId: string): Promise<MissionControlState>;
  pauseMission(): Promise<MissionControlState>;
  resumeMission(): Promise<MissionControlState>;
  stopMission(): Promise<MissionControlState>;

  downloadMedia(): AsyncIterable<MediaDownloadProgress>;
}

/** Garde à appeler avant toute méthode conditionnée par une capacité. */
export function exigerCapacite(
  capabilities: DroneCapabilities,
  capacite: keyof DroneCapabilities,
): void {
  if (!capabilities[capacite]) throw new CapaciteNonSupporteeError(capacite);
}
