/**
 * [DroneDevice] et [CameraProfile].
 *
 * Les deux sont alimentés par le SDK quand il est disponible, **et déduits de l'EXIF sinon**.
 * Le champ `source` est donc obligatoire : il dit si l'on connaît la focale ou si on l'a lue
 * dans un en-tête, ce qui n'engage pas la même confiance en aval.
 */

import type { TenantScoped, Timestamped } from "./common";
import type { CameraProfileId, DroneDeviceId } from "./ids";

export type HardwareInfoSource = "sdk" | "exif" | "manual" | "demo";

export const HARDWARE_INFO_SOURCES: readonly HardwareInfoSource[] = [
  "sdk",
  "exif",
  "manual",
  "demo",
];

export type DroneDevice = TenantScoped &
  Timestamped & {
    readonly id: DroneDeviceId;
    readonly manufacturer: string;
    readonly model: string;
    readonly serial_number: string | null;
    readonly firmware_version: string | null;
    readonly controller_model: string | null;
    readonly source: HardwareInfoSource;
  };

/** Coefficients de distorsion du modèle de Brown-Conrady, tels que publiés par les moteurs. */
export type LensDistortion = {
  readonly k1: number;
  readonly k2: number;
  readonly k3: number;
  readonly p1: number;
  readonly p2: number;
};

/**
 * [CameraProfile] — clé de la qualité de reconstruction (§24). Les dimensions capteur et
 * focale sont en **millimètres**, unité dans laquelle les constructeurs les publient.
 */
export type CameraProfile = TenantScoped &
  Timestamped & {
    readonly id: CameraProfileId;
    readonly name: string;
    readonly device_id: DroneDeviceId | null;
    readonly focal_length_mm: number;
    readonly sensor_width_mm: number;
    readonly sensor_height_mm: number;
    readonly image_width_px: number;
    readonly image_height_px: number;
    /** `null` tant que la calibration n'a pas été établie — jamais des zéros de complaisance. */
    readonly distortion: LensDistortion | null;
    readonly source: HardwareInfoSource;
  };
