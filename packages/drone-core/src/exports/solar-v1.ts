/**
 * `DroneSolarExportV1` — implantations photovoltaïques.
 *
 * Le contrat exporte des variantes comparables (§30), la puissance crête et la surface
 * utilisée. Il n'exporte **aucune estimation de production** : l'ombrage est hors périmètre
 * (§31), et une production annoncée sans modèle d'ombrage serait un chiffre crédible et faux.
 */

import type { PanelOrientation, ShadingModel } from "../solar";
import type { DroneContractEnvelopeV1, ExportedProvenanceV1 } from "./common";

export type SolarPanelSpecExportV1 = {
  readonly manufacturer: string;
  readonly model: string;
  readonly width_mm: number;
  readonly height_mm: number;
  readonly peak_power_w: number;
};

export type SolarVariantExportV1 = {
  readonly layout_ref: string;
  readonly variant_label: string;
  readonly plane_ref: string;
  readonly panel: SolarPanelSpecExportV1;
  readonly orientations_used: readonly PanelOrientation[];
  readonly panel_count: number;
  readonly total_peak_power_w: number;
  readonly used_area_m2: number;
  readonly plane_area_m2: number;
  readonly coverage_ratio: number;
  readonly provenance: ExportedProvenanceV1;
};

export type DroneSolarExportV1 = DroneContractEnvelopeV1<"drone.solar"> & {
  readonly variants: readonly SolarVariantExportV1[];
  /** Toujours `"none"` en V1 : dire l'absence de modèle d'ombrage plutôt que la taire. */
  readonly shading_model: ShadingModel;
  /** Retraits réglementaires déclarés par l'utilisateur, repris tels quels. */
  readonly declared_regulatory_setbacks: readonly string[];
};

export const DRONE_SOLAR_EXPORT_V1 = {
  contract: "drone.solar",
  contract_version: 1,
} as const;
