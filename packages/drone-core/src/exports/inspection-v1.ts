/**
 * `DroneInspectionExportV1` — constats d'inspection, et **brouillon** de réserve pour
 * Réserves (§34, §118).
 *
 * Drone transmet chantier, photo, position, commentaire, catégorie et date. Il ne transmet
 * aucun statut de validation : la validation et le workflow restent intégralement dans
 * Réserves. Le champ `reserve_draft` est donc explicitement nommé « draft ».
 */

import type { IsoDateTime } from "../common";
import type { FindingCategory, FindingPriority, FindingStatus } from "../inspection";
import type { Point2D, Point3D } from "../units";
import type { DroneContractEnvelopeV1 } from "./common";

export type FindingMediaRefV1 = {
  readonly media_ref: string;
  /** URL signée et expirante, jamais un chemin de bucket ni une URL publique. */
  readonly signed_url: string | null;
  readonly expires_at: IsoDateTime | null;
};

export type InspectionFindingExportV1 = {
  readonly finding_ref: string;
  readonly title: string;
  readonly description: string | null;
  readonly category: FindingCategory;
  readonly priority: FindingPriority;
  readonly status: FindingStatus;
  readonly model_point: Point3D | null;
  readonly ortho_point: Point2D | null;
  readonly media: readonly FindingMediaRefV1[];
  readonly measurement_refs: readonly string[];
  readonly created_at: IsoDateTime;
};

/** Brouillon destiné à Réserves. Aucun statut de workflow : Réserves reste maître. */
export type ReserveDraftV1 = {
  readonly finding_ref: string;
  readonly title: string;
  readonly comment: string | null;
  readonly category: FindingCategory;
  readonly observed_at: IsoDateTime;
  readonly media: readonly FindingMediaRefV1[];
  readonly location_hint: string | null;
};

export type DroneInspectionExportV1 = DroneContractEnvelopeV1<"drone.inspection"> & {
  readonly findings: readonly InspectionFindingExportV1[];
  readonly reserve_drafts: readonly ReserveDraftV1[];
};

export const DRONE_INSPECTION_EXPORT_V1 = {
  contract: "drone.inspection",
  contract_version: 1,
} as const;
