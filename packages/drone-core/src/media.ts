/**
 * [MediaAsset] et [TelemetrySample] — §11 du brief noyau, §E du document d'architecture.
 *
 * Deux règles non négociables sont encodées ici :
 *
 * - **Les EXIF ne sont jamais supprimés à l'import** (§76). Ils portent la focale,
 *   l'orientation et la position, c'est-à-dire l'entrée du calcul. Le champ `exif` conserve
 *   la table brute ; les colonnes dénormalisées ne la remplacent pas, elles l'indexent.
 * - **Toute frame extraite d'une vidéo porte `degraded_source: true`** (§77), et ce marquage
 *   se propage jusqu'à la mesure et jusqu'au PDF (voir `provenance.applyDegradedSource`).
 */

import type { IsoDateTime, TenantScoped, Timestamped } from "./common";
import type {
  CameraProfileId,
  DroneDeviceId,
  DroneProjectId,
  MediaAssetId,
  TelemetrySampleId,
} from "./ids";
import type { StorageObjectRef } from "./storage-ref";
import type { Altitude, Wgs84Position } from "./units";

export type MediaKind = "photo" | "video" | "extracted_frame" | "thermal";

export const MEDIA_KINDS: readonly MediaKind[] = ["photo", "video", "extracted_frame", "thermal"];

/** D'où vient physiquement le fichier. `demo` marque les médias de l'`AdaptateurDemo` (§103). */
export type MediaSource =
  | "sd_card"
  | "device_folder"
  | "drone_download"
  | "manual_upload"
  | "video_extraction"
  | "demo";

export const MEDIA_SOURCES: readonly MediaSource[] = [
  "sd_card",
  "device_folder",
  "drone_download",
  "manual_upload",
  "video_extraction",
  "demo",
];

/** Orientation de prise de vue. `exif_orientation` est le code EXIF brut, conservé tel quel. */
export type CaptureOrientation = {
  readonly yaw_deg: number | null;
  readonly pitch_deg: number | null;
  readonly roll_deg: number | null;
  readonly exif_orientation: number | null;
};

/**
 * §75 — contrôle qualité local, avant upload. Les scores sont **mesurés** et nullables ;
 * `usable` est une décision, corrigeable par l'utilisateur, jamais un verrou.
 */
export type MediaQualityFlags = {
  readonly blur_score: number | null;
  readonly exposure_score: number | null;
  readonly duplicate_of: MediaAssetId | null;
  readonly usable: boolean;
};

/** §47 — floutage appliqué : zones et méthode, pour pouvoir en rendre compte. */
export type BlurringApplied = {
  readonly method: string;
  readonly regions_count: number;
  readonly applied_at: IsoDateTime;
};

export type MediaAsset = TenantScoped &
  Timestamped & {
    readonly id: MediaAssetId;
    readonly project_id: DroneProjectId;
    readonly kind: MediaKind;
    readonly storage_ref: StorageObjectRef;
    readonly mime: string;
    readonly size_bytes: number;
    /** §74 — déduplication et reprise d'upload. Minuscules, 64 caractères hexadécimaux. */
    readonly sha256: string;
    readonly captured_at: IsoDateTime | null;
    readonly position: Wgs84Position | null;
    readonly relative_altitude: Altitude | null;
    readonly orientation: CaptureOrientation | null;
    readonly device_id: DroneDeviceId | null;
    readonly camera_profile_id: CameraProfileId | null;
    /** §76 — table EXIF conservée intégralement, jamais purgée à l'import. */
    readonly exif: Readonly<Record<string, unknown>> | null;
    readonly quality_flags: MediaQualityFlags;
    /** §77 — vrai pour toute frame extraite d'une vidéo. */
    readonly degraded_source: boolean;
    readonly blurring_applied: BlurringApplied | null;
    readonly source: MediaSource;
  };

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function estSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

/**
 * §77 — une frame extraite d'une vidéo est dégradée par construction. La règle est portée par
 * le noyau et non par l'appelant, pour qu'aucun chemin d'import ne puisse l'oublier.
 */
export function estSourceDegradee(kind: MediaKind, source: MediaSource): boolean {
  return kind === "extracted_frame" || source === "video_extraction";
}

/**
 * [TelemetrySample] — série temporelle d'acquisition.
 *
 * Table volumineuse et **facultative** : elle est absente d'un import simple, et le produit
 * doit fonctionner intégralement sans elle.
 */
export type TelemetrySample = TenantScoped & {
  readonly id: TelemetrySampleId;
  readonly project_id: DroneProjectId;
  readonly recorded_at: IsoDateTime;
  readonly position: Wgs84Position | null;
  /** §68 — hauteur relative au décollage, distincte de l'altitude GPS ci-dessus. */
  readonly relative_altitude: Altitude | null;
  readonly yaw_deg: number | null;
  readonly pitch_deg: number | null;
  readonly roll_deg: number | null;
  readonly gimbal_pitch_deg: number | null;
  readonly battery_percent: number | null;
  readonly satellites_count: number | null;
};
