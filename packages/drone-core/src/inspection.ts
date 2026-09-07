/**
 * [InspectionFinding] — §17 du brief noyau, §M de l'architecture.
 *
 * Une anomalie peut être posée sur une photo, sur l'orthophoto ou sur le modèle (§32) : les
 * trois positions coexistent et aucune n'est obligatoire, parce qu'un constat photographié
 * sans position reste un constat utile.
 *
 * La liaison vers Réserves est **facultative** (§34) : Drone produit un brouillon, la
 * validation et le workflow restent intégralement dans Réserves (§118).
 */

import type { ExternalReference, TenantScoped, Timestamped } from "./common";
import type {
  DroneProjectId,
  InspectionFindingId,
  MeasurementId,
  MediaAssetId,
  UtilisateurId,
} from "./ids";
import type { Point2D, Point3D } from "./units";

export type FindingCategory =
  | "tile_damage"
  | "sealing"
  | "structure"
  | "gutter"
  | "moss_vegetation"
  | "flashing"
  | "safety"
  | "other";

export const FINDING_CATEGORIES: readonly FindingCategory[] = [
  "tile_damage",
  "sealing",
  "structure",
  "gutter",
  "moss_vegetation",
  "flashing",
  "safety",
  "other",
];

export type FindingPriority = "low" | "medium" | "high" | "critical";

export const FINDING_PRIORITIES: readonly FindingPriority[] = ["low", "medium", "high", "critical"];

export type FindingStatus = "open" | "in_progress" | "resolved" | "dismissed";

export const FINDING_STATUSES: readonly FindingStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "dismissed",
];

/** Position d'un constat sur un média : pixels de l'image, seul repère qui y a un sens. */
export type MediaAnchor = {
  readonly media_id: MediaAssetId;
  readonly x_px: number;
  readonly y_px: number;
};

/** Les trois ancrages possibles, tous facultatifs et cumulables. */
export type FindingPosition = {
  readonly model_point: Point3D | null;
  readonly ortho_point: Point2D | null;
  readonly media_anchor: MediaAnchor | null;
};

export const POSITION_NON_LOCALISEE: FindingPosition = {
  model_point: null,
  ortho_point: null,
  media_anchor: null,
};

export function estLocalise(position: FindingPosition): boolean {
  return (
    position.model_point !== null ||
    position.ortho_point !== null ||
    position.media_anchor !== null
  );
}

export type InspectionFinding = TenantScoped &
  Timestamped & {
    readonly id: InspectionFindingId;
    readonly project_id: DroneProjectId;
    readonly title: string;
    readonly description: string | null;
    readonly category: FindingCategory;
    readonly priority: FindingPriority;
    readonly status: FindingStatus;
    readonly position: FindingPosition;
    readonly media_refs: readonly MediaAssetId[];
    readonly measurement_refs: readonly MeasurementId[];
    readonly author_id: UtilisateurId | null;
    /** §34 — liaison facultative vers Réserves. `not_linked` est un état parfaitement normal. */
    readonly external_reference: ExternalReference;
  };
