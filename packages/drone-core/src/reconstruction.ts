/**
 * [ReconstructionJob] et [ReconstructionResult] — §9 et §10 du brief noyau.
 *
 * Deux invariants portés par ce module :
 *
 * - **On n'écrase jamais une reconstruction** (§59, §81). Un projet conserve plusieurs
 *   résultats, chacun avec sa `version` croissante, son moteur et ses paramètres.
 * - **L'idempotence est une clé, pas une intention** (§95) : voir `idempotency.ts`.
 */

import type { IsoDateTime, TenantScoped, Timestamped } from "./common";
import type {
  DroneProjectId,
  MediaAssetId,
  ReconstructionJobId,
  ReconstructionResultId,
} from "./ids";
import type { QualityEvidence } from "./quality";
import type { StorageObjectRef } from "./storage-ref";
import type { JsonValue } from "./serialization";

export type ReconstructionStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "quality_check"
  | "completed"
  | "failed"
  | "cancelled";

export const RECONSTRUCTION_STATUSES: readonly ReconstructionStatus[] = [
  "queued",
  "uploading",
  "processing",
  "quality_check",
  "completed",
  "failed",
  "cancelled",
];

export function estReconstructionStatus(value: unknown): value is ReconstructionStatus {
  return typeof value === "string" && (RECONSTRUCTION_STATUSES as readonly string[]).includes(value);
}

/**
 * Transitions autorisées. `failed → queued` est la reprise bornée par `attempts` ; au-delà de
 * la borne, le travail part en dead-letter et reste `failed` (§94). `completed`, `cancelled`
 * sont terminaux : un résultat acquis ne se réécrit pas.
 */
const TRANSITIONS: Record<ReconstructionStatus, readonly ReconstructionStatus[]> = {
  queued: ["uploading", "processing", "cancelled", "failed"],
  uploading: ["processing", "failed", "cancelled"],
  processing: ["quality_check", "completed", "failed", "cancelled"],
  quality_check: ["completed", "failed", "cancelled"],
  completed: [],
  failed: ["queued"],
  cancelled: [],
};

export function transitionsReconstructionAutorisees(
  status: ReconstructionStatus,
): readonly ReconstructionStatus[] {
  return TRANSITIONS[status];
}

export function peutTransitionnerReconstruction(
  from: ReconstructionStatus,
  to: ReconstructionStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function estStatutTerminal(status: ReconstructionStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Catégories d'erreur, pour distinguer ce qui se rejoue de ce qui ne se rejoue pas. */
export type ReconstructionErrorCategory =
  | "input_insufficient"
  | "engine_failure"
  | "timeout"
  | "storage_unavailable"
  | "cancelled_by_user"
  | "unknown";

export const RECONSTRUCTION_ERROR_CATEGORIES: readonly ReconstructionErrorCategory[] = [
  "input_insufficient",
  "engine_failure",
  "timeout",
  "storage_unavailable",
  "cancelled_by_user",
  "unknown",
];

/** Moteurs prévus. L'union reste ouverte côté adaptateur : le moteur est remplaçable (§B.1). */
export type ReconstructionEngine = "odm" | "metashape" | "demo";

export const RECONSTRUCTION_ENGINES: readonly ReconstructionEngine[] = ["odm", "metashape", "demo"];

/** Paramètres moteur, opaques au noyau mais **sérialisés de façon stable** pour l'idempotence. */
export type ReconstructionParameters = { readonly [key: string]: JsonValue };

export type ReconstructionJob = TenantScoped &
  Timestamped & {
    readonly id: ReconstructionJobId;
    readonly project_id: DroneProjectId;
    readonly status: ReconstructionStatus;
    readonly engine: ReconstructionEngine;
    readonly engine_version: string;
    readonly parameters: ReconstructionParameters;
    /** Jeu d'entrée figé au moment de la soumission (§78). */
    readonly input_set: readonly MediaAssetId[];
    /** §95 — unique. Voir `buildIdempotencyPayload` / `computeIdempotencyKey`. */
    readonly idempotency_key: string;
    readonly attempts: number;
    readonly max_attempts: number;
    readonly error_category: ReconstructionErrorCategory | null;
    readonly started_at: IsoDateTime | null;
    readonly finished_at: IsoDateTime | null;
    readonly duration_s: number | null;
    /** §93 — observabilité du coût, sans laquelle le pricing est indéfendable. */
    readonly estimated_cost_cents: number | null;
  };

/** Artefacts produits. Chacun est une référence de stockage, jamais une URL. */
export type ReconstructionArtifacts = {
  readonly point_cloud: StorageObjectRef | null;
  readonly mesh: StorageObjectRef | null;
  readonly texture: StorageObjectRef | null;
  readonly orthophoto: StorageObjectRef | null;
  readonly digital_surface_model: StorageObjectRef | null;
  /** §72 — modèle allégé destiné au client web et mobile. */
  readonly lightweight_glb: StorageObjectRef | null;
};

/**
 * Métriques de qualité produites par le moteur.
 *
 * Elles sont les **entrées** du niveau de qualité §24, elles ne sont pas le niveau lui-même :
 * aucune fonction de ce package ne les convertit en niveau, faute de seuils établis (§107).
 */
export type ReconstructionQualityMetrics = QualityEvidence & {
  readonly calibrated_cameras_count: number | null;
  readonly input_images_count: number | null;
  readonly retained_images_ratio: number | null;
};

export type ReconstructionResult = TenantScoped &
  Timestamped & {
    readonly id: ReconstructionResultId;
    readonly job_id: ReconstructionJobId;
    readonly project_id: DroneProjectId;
    /** Entier croissant par projet. Une nouvelle version ne remplace pas la précédente. */
    readonly version: number;
    readonly engine: ReconstructionEngine;
    readonly engine_version: string;
    readonly artifacts: ReconstructionArtifacts;
    readonly quality_metrics: ReconstructionQualityMetrics;
  };
