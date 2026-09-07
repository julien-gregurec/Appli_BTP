/**
 * Identifiants typés (§5 du brief noyau).
 *
 * Le dépôt n'impose pas de convention d'identifiants — `packages/application-access` manipule
 * des `string` nus. On la resserre ici, parce qu'un noyau Drone fait circuler dix-neuf
 * familles d'UUID côte à côte et que passer un `media_id` là où un `project_id` est attendu
 * doit être une erreur de compilation, pas un incident de production.
 *
 * Le marquage est **purement statique** : à l'exécution un identifiant reste une chaîne, donc
 * la sérialisation JSON est inchangée et aucun coût n'est ajouté au runtime.
 */

declare const ID_BRAND: unique symbol;

type Brand<Nom extends string> = string & { readonly [ID_BRAND]: Nom };

export type EntrepriseId = Brand<"EntrepriseId">;
export type UtilisateurId = Brand<"UtilisateurId">;

export type DroneProjectId = Brand<"DroneProjectId">;
export type DroneMissionId = Brand<"DroneMissionId">;
export type DroneDeviceId = Brand<"DroneDeviceId">;
export type CameraProfileId = Brand<"CameraProfileId">;
export type MediaAssetId = Brand<"MediaAssetId">;
export type TelemetrySampleId = Brand<"TelemetrySampleId">;
export type ReconstructionJobId = Brand<"ReconstructionJobId">;
export type ReconstructionResultId = Brand<"ReconstructionResultId">;
export type RoofModelId = Brand<"RoofModelId">;
export type RoofPlaneId = Brand<"RoofPlaneId">;
export type RoofEdgeId = Brand<"RoofEdgeId">;
export type RoofObstacleId = Brand<"RoofObstacleId">;
export type MeasurementId = Brand<"MeasurementId">;
export type ControlPointId = Brand<"ControlPointId">;
export type SolarPanelSpecId = Brand<"SolarPanelSpecId">;
export type SolarLayoutId = Brand<"SolarLayoutId">;
export type InspectionFindingId = Brand<"InspectionFindingId">;
export type ExportArtifactId = Brand<"ExportArtifactId">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vrai pour un UUID canonique. Les identifiants Drone sont des UUID, comme ceux du socle. */
export function estUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export class IdentifiantInvalideError extends Error {
  constructor(
    public readonly typeIdentifiant: string,
    public readonly valeur: unknown,
  ) {
    super(`Identifiant ${typeIdentifiant} invalide`);
    this.name = "IdentifiantInvalideError";
  }
}

/**
 * Fabrique un convertisseur validant : la seule porte d'entrée d'une chaîne brute vers un
 * identifiant typé. Une valeur non conforme lève, elle n'est jamais silencieusement acceptée.
 */
function creerConvertisseurId<T extends string>(typeIdentifiant: string) {
  return function convertir(value: unknown): T {
    if (!estUuid(value)) throw new IdentifiantInvalideError(typeIdentifiant, value);
    return value as T;
  };
}

export const asEntrepriseId = creerConvertisseurId<EntrepriseId>("EntrepriseId");
export const asUtilisateurId = creerConvertisseurId<UtilisateurId>("UtilisateurId");
export const asDroneProjectId = creerConvertisseurId<DroneProjectId>("DroneProjectId");
export const asDroneMissionId = creerConvertisseurId<DroneMissionId>("DroneMissionId");
export const asDroneDeviceId = creerConvertisseurId<DroneDeviceId>("DroneDeviceId");
export const asCameraProfileId = creerConvertisseurId<CameraProfileId>("CameraProfileId");
export const asMediaAssetId = creerConvertisseurId<MediaAssetId>("MediaAssetId");
export const asTelemetrySampleId = creerConvertisseurId<TelemetrySampleId>("TelemetrySampleId");
export const asReconstructionJobId = creerConvertisseurId<ReconstructionJobId>("ReconstructionJobId");
export const asReconstructionResultId =
  creerConvertisseurId<ReconstructionResultId>("ReconstructionResultId");
export const asRoofModelId = creerConvertisseurId<RoofModelId>("RoofModelId");
export const asRoofPlaneId = creerConvertisseurId<RoofPlaneId>("RoofPlaneId");
export const asRoofEdgeId = creerConvertisseurId<RoofEdgeId>("RoofEdgeId");
export const asRoofObstacleId = creerConvertisseurId<RoofObstacleId>("RoofObstacleId");
export const asMeasurementId = creerConvertisseurId<MeasurementId>("MeasurementId");
export const asControlPointId = creerConvertisseurId<ControlPointId>("ControlPointId");
export const asSolarPanelSpecId = creerConvertisseurId<SolarPanelSpecId>("SolarPanelSpecId");
export const asSolarLayoutId = creerConvertisseurId<SolarLayoutId>("SolarLayoutId");
export const asInspectionFindingId =
  creerConvertisseurId<InspectionFindingId>("InspectionFindingId");
export const asExportArtifactId = creerConvertisseurId<ExportArtifactId>("ExportArtifactId");
