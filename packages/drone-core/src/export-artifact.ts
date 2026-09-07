/**
 * [ExportArtifact] — trace de ce qui a été remis au client (§59, §86).
 *
 * L'export est une entité, pas un effet de bord : savoir quel PDF a été produit, quand, par
 * qui, et à partir de quelle version de reconstruction, est ce qui rend un litige instruisable.
 */

import type { IsoDateTime, TenantScoped } from "./common";
import type {
  DroneProjectId,
  ExportArtifactId,
  ReconstructionResultId,
  UtilisateurId,
} from "./ids";
import type { StorageObjectRef } from "./storage-ref";

export type ExportFormat = "pdf" | "dxf" | "svg" | "csv" | "json" | "glb";

export const EXPORT_FORMATS: readonly ExportFormat[] = ["pdf", "dxf", "svg", "csv", "json", "glb"];

export type ExportScope =
  | "project_summary"
  | "roof"
  | "measurements"
  | "inspection"
  | "solar"
  | "client_share";

export const EXPORT_SCOPES: readonly ExportScope[] = [
  "project_summary",
  "roof",
  "measurements",
  "inspection",
  "solar",
  "client_share",
];

export type ExportArtifact = TenantScoped & {
  readonly id: ExportArtifactId;
  readonly project_id: DroneProjectId;
  readonly format: ExportFormat;
  readonly scope: ExportScope;
  readonly storage_ref: StorageObjectRef;
  /** Version de reconstruction sur laquelle l'export a été produit. */
  readonly reconstruction_result_id: ReconstructionResultId | null;
  readonly contract_version: string | null;
  readonly generated_by: UtilisateurId | null;
  readonly generated_at: IsoDateTime;
  readonly sha256: string | null;
};
