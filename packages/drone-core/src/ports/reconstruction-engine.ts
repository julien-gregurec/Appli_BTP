/**
 * `ReconstructionEngineAdapter` — §14 du brief noyau.
 *
 * Le moteur photogrammétrique est un fournisseur **remplaçable** : ODM aujourd'hui, Metashape
 * en plan B, un autre demain. Le noyau ne connaît donc ni ODM ni Metashape, seulement ce
 * contrat. La contrainte de licence d'ODM (AGPL-3.0, clause réseau à qualifier avant
 * commercialisation) est une raison de plus pour que rien de spécifique ne remonte ici.
 *
 * Aucune implémentation n'est fournie par ce lot.
 */

import type { IsoDateTime } from "../common";
import type { ReconstructionJobId } from "../ids";
import type {
  ReconstructionArtifacts,
  ReconstructionEngine,
  ReconstructionErrorCategory,
  ReconstructionParameters,
  ReconstructionQualityMetrics,
  ReconstructionStatus,
} from "../reconstruction";

/** Identité du moteur, telle qu'elle sera figée dans la clé d'idempotence. */
export type EngineDescriptor = {
  readonly engine: ReconstructionEngine;
  readonly version: string;
  readonly supports_gpu: boolean;
  /** Paramètres reconnus, pour valider une soumission avant de consommer du GPU. */
  readonly supported_parameters: readonly string[];
};

/** Poignée opaque retournée par le moteur ; elle n'a de sens que pour lui. */
export type EngineJobHandle = {
  readonly engine_job_id: string;
  readonly submitted_at: IsoDateTime;
};

export type EngineSubmission = {
  readonly job_id: ReconstructionJobId;
  /** URL signées de lecture des médias d'entrée. Jamais de contenu binaire dans ce contrat. */
  readonly input_urls: readonly string[];
  readonly parameters: ReconstructionParameters;
};

export type EngineProgress = {
  readonly status: ReconstructionStatus;
  readonly percent: number | null;
  readonly stage: string | null;
  readonly error_category: ReconstructionErrorCategory | null;
  readonly error_message: string | null;
};

export type EngineOutcome = {
  readonly artifacts: ReconstructionArtifacts;
  readonly quality_metrics: ReconstructionQualityMetrics;
  readonly duration_s: number;
  readonly estimated_cost_cents: number | null;
};

export interface ReconstructionEngineAdapter {
  describe(): EngineDescriptor;

  submit(submission: EngineSubmission): Promise<EngineJobHandle>;

  /** Interrogation d'avancement. Le moteur ne rappelle pas : c'est le worker qui interroge. */
  poll(handle: EngineJobHandle): Promise<EngineProgress>;

  cancel(handle: EngineJobHandle): Promise<void>;

  /** N'est appelée qu'après un `poll` en `completed`. */
  fetchOutcome(handle: EngineJobHandle): Promise<EngineOutcome>;
}
