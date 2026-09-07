/**
 * `DroneMeasurementExportV1` — mesures exportées vers Gestion Pro, Tools ou un tableur.
 *
 * Chaque ligne porte sa provenance complète. Un consommateur ne peut pas recevoir une valeur
 * nue : c'est la traduction en contrat du §84 (aucune valeur affichée sans provenance).
 */

import type { IsoDateTime } from "../common";
import type { MeasurementKind, MeasurementMethod, MeasurementNature, MeasurementSource } from "../measurement";
import type { MeasurementUnit } from "../units";
import type { DroneContractEnvelopeV1, ExportedProvenanceV1 } from "./common";

export type MeasurementRowV1 = {
  readonly measurement_ref: string;
  readonly kind: MeasurementKind;
  readonly value: number;
  readonly unit: MeasurementUnit;
  readonly nature: MeasurementNature;
  readonly nature_label: string;
  readonly source: MeasurementSource;
  readonly method: MeasurementMethod;
  readonly geometry_kind: string;
  readonly reconstruction_version: number | null;
  readonly created_at: IsoDateTime;
  readonly provenance: ExportedProvenanceV1;
};

export type DroneMeasurementExportV1 = DroneContractEnvelopeV1<"drone.measurements"> & {
  readonly measurements: readonly MeasurementRowV1[];
};

export const DRONE_MEASUREMENT_EXPORT_V1 = {
  contract: "drone.measurements",
  contract_version: 1,
} as const;
