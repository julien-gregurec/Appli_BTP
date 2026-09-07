/**
 * `DroneProjectSummaryV1` — résumé de relevé destiné à Gestion Pro (§119).
 *
 * Ce que le contrat transporte : le lien vers le relevé, les surfaces, les métrés, la
 * référence du PDF, les données PV et les anomalies résumées.
 * Ce qu'il ne transporte **jamais** : le modèle 3D, les médias bruts.
 */

import type { IsoDate } from "../common";
import type { SurveyType } from "../project";
import type { DroneContractEnvelopeV1, ExportedProvenanceV1 } from "./common";

export type ProjectSummaryQuantityV1 = {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly nature: "measured" | "computed" | "estimated";
  readonly provenance: ExportedProvenanceV1;
};

export type ProjectSummaryFindingV1 = {
  readonly title: string;
  readonly category: string;
  readonly priority: string;
  readonly status: string;
};

export type DroneProjectSummaryV1 = DroneContractEnvelopeV1<"drone.project_summary"> & {
  readonly project_name: string;
  readonly survey_type: SurveyType;
  readonly survey_date: IsoDate | null;
  readonly client_name: string | null;
  readonly address: string | null;
  readonly quantities: readonly ProjectSummaryQuantityV1[];
  readonly findings_summary: readonly ProjectSummaryFindingV1[];
  /** Nombre de constats, y compris ceux non repris dans le résumé ci-dessus. */
  readonly findings_total: number;
  readonly report_export_id: string | null;
};

export const DRONE_PROJECT_SUMMARY_V1 = {
  contract: "drone.project_summary",
  contract_version: 1,
} as const;
