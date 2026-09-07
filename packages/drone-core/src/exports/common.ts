/**
 * Socle commun des contrats d'export versionnés (§18 du brief noyau, §N de l'architecture).
 *
 * Un contrat d'export est **versionné et figé**. On n'ajoute pas un champ obligatoire à un
 * `V1` : on publie un `V2`. C'est la seule discipline qui permette à Gestion Pro, Tools et
 * Réserves de consommer Drone sans se casser à chaque livraison.
 *
 * Règle de contenu, valable pour les cinq contrats : **aucune valeur n'est exportée sans sa
 * provenance**. Un consommateur qui reçoit une surface reçoit aussi l'origine et la nature de
 * cette surface, et il ne peut donc pas la présenter comme une donnée certifiée.
 */

import type { IsoDateTime } from "../common";
import type { DroneProjectId } from "../ids";
import type { MeasurementOrigin } from "../provenance";
import { resolveMeasurementTrust } from "../provenance";
import type { MeasurementQuality, MeasurementQualityLevel } from "../quality";

export type DroneContractName =
  | "drone.project_summary"
  | "drone.roof"
  | "drone.measurements"
  | "drone.inspection"
  | "drone.solar";

export const DRONE_CONTRACT_NAMES: readonly DroneContractName[] = [
  "drone.project_summary",
  "drone.roof",
  "drone.measurements",
  "drone.inspection",
  "drone.solar",
];

/** En-tête commun à tous les contrats V1. */
export type DroneContractEnvelopeV1<N extends DroneContractName> = {
  readonly contract: N;
  readonly contract_version: 1;
  readonly generated_at: IsoDateTime;
  readonly project_id: DroneProjectId;
  /** Version de reconstruction dont l'export est issu. `null` pour un projet sans modèle. */
  readonly reconstruction_version: number | null;
};

/**
 * Bloc de provenance obligatoire attaché à toute valeur numérique exportée.
 * `trusted: false` doit se traduire par une mention visible chez le consommateur.
 */
export type ExportedProvenanceV1 = {
  readonly origin: MeasurementOrigin;
  readonly quality_level: MeasurementQualityLevel;
  readonly trusted: boolean;
  readonly degraded_source: boolean;
  readonly uncertainty_value: number | null;
  readonly uncertainty_unit: string | null;
  /** Chaîne vide s'il n'y a rien à signaler ; sinon la mention à afficher telle quelle. */
  readonly warning: string;
};

export function estDroneContractName(value: unknown): value is DroneContractName {
  return typeof value === "string" && (DRONE_CONTRACT_NAMES as readonly string[]).includes(value);
}

/**
 * Construit le bloc de provenance d'une valeur exportée.
 *
 * Cette fonction existe pour une raison précise : `trusted` et `warning` ne doivent pas être
 * recalculés par chaque producteur d'export. Recomposée à cinq endroits, la règle du maillon
 * faible finit par diverger à l'un d'eux, et c'est exactement là qu'une valeur non fiable
 * sortirait sans mention.
 */
export function toExportedProvenanceV1(input: {
  readonly origin: MeasurementOrigin;
  readonly quality: MeasurementQuality;
}): ExportedProvenanceV1 {
  const resolue = resolveMeasurementTrust({
    origins: [input.origin],
    degraded_source: input.quality.degraded_source,
  });

  return {
    origin: resolue.origin,
    quality_level: input.quality.level,
    trusted: resolue.trusted,
    degraded_source: input.quality.degraded_source,
    uncertainty_value: input.quality.uncertainty_value,
    uncertainty_unit: input.quality.uncertainty_unit,
    warning: input.quality.degraded_source
      ? "Valeur indicative — issue d'une image dégradée (frame vidéo)."
      : resolue.warning,
  };
}
