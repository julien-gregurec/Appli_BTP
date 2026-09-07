/**
 * `DroneRoofExportV1` — géométrie toiture destinée à Tools (§120) et aux exports DXF/SVG.
 *
 * Transporte des contours, des pans et des arêtes. Ne transporte ni maillage, ni nuage de
 * points, ni média brut : Tools travaille en 2D, et lui envoyer un modèle 3D reviendrait à
 * lui demander de devenir un moteur 3D.
 */

import type { RoofEdgeType } from "../roof";
import type { Point3D, ReferenceFrame } from "../units";
import type { DroneContractEnvelopeV1, ExportedProvenanceV1 } from "./common";

export type RoofPlaneExportV1 = {
  readonly plane_ref: string;
  readonly label: string | null;
  readonly area_m2: number;
  readonly slope_deg: number;
  readonly slope_percent: number;
  readonly azimuth_deg: number;
  readonly polygon: readonly Point3D[];
  readonly validated: boolean;
  readonly provenance: ExportedProvenanceV1;
};

export type RoofEdgeExportV1 = {
  readonly edge_ref: string;
  readonly type: RoofEdgeType;
  readonly length_m: number;
  readonly polyline: readonly Point3D[];
  readonly validated: boolean;
};

export type RoofObstacleExportV1 = {
  readonly obstacle_ref: string;
  readonly type: string;
  readonly footprint: readonly Point3D[];
  readonly safety_margin_mm: number;
};

export type DroneRoofExportV1 = DroneContractEnvelopeV1<"drone.roof"> & {
  readonly reference_frame: ReferenceFrame;
  readonly north_rotation_deg: number;
  readonly planes: readonly RoofPlaneExportV1[];
  readonly edges: readonly RoofEdgeExportV1[];
  readonly obstacles: readonly RoofObstacleExportV1[];
  readonly total_area_m2: number;
  /** §22 — faux si une seule entité reste une proposition non validée. */
  readonly fully_validated: boolean;
  readonly provenance: ExportedProvenanceV1;
};

export const DRONE_ROOF_EXPORT_V1 = {
  contract: "drone.roof",
  contract_version: 1,
} as const;
