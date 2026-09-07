/**
 * [RoofModel], [RoofPlane], [RoofEdge], [RoofObstacle] — §15 du brief noyau, §J de
 * l'architecture.
 *
 * Doctrine encodée : **ELSATIA propose, l'utilisateur valide.** Chaque entité géométrique
 * porte `origin` (`detected` / `corrected` / `manual`) et son valideur ; une détection
 * automatique reste une proposition tant qu'un humain ne l'a pas validée (§22).
 */

import type { HumanValidation, TenantScoped, Timestamped } from "./common";
import type {
  DroneProjectId,
  ReconstructionResultId,
  RoofEdgeId,
  RoofModelId,
  RoofObstacleId,
  RoofPlaneId,
} from "./ids";
import type { MeasurementQuality } from "./quality";
import type { Point3D, ReferenceFrame } from "./units";

/** §21 — vocabulaire de couverture, en français métier derrière des codes stables. */
export type RoofEdgeType = "ridge" | "eave" | "verge" | "valley" | "hip" | "parapet";

export const ROOF_EDGE_TYPES: readonly RoofEdgeType[] = [
  "ridge",
  "eave",
  "verge",
  "valley",
  "hip",
  "parapet",
];

export const ROOF_EDGE_LABELS: Readonly<Record<RoofEdgeType, string>> = {
  ridge: "Faîtage",
  eave: "Égout",
  verge: "Rive",
  valley: "Noue",
  hip: "Arêtier",
  parapet: "Acrotère",
};

export type RoofObstacleType =
  | "chimney"
  | "roof_window"
  | "ventilation"
  | "antenna"
  | "technical_zone"
  | "other";

export const ROOF_OBSTACLE_TYPES: readonly RoofObstacleType[] = [
  "chimney",
  "roof_window",
  "ventilation",
  "antenna",
  "technical_zone",
  "other",
];

export const ROOF_OBSTACLE_LABELS: Readonly<Record<RoofObstacleType, string>> = {
  chimney: "Cheminée",
  roof_window: "Fenêtre de toit",
  ventilation: "Ventilation",
  antenna: "Antenne",
  technical_zone: "Zone technique",
  other: "Autre",
};

/** Équation de plan `a·x + b·y + c·z + d = 0`, exprimée dans le `ReferenceFrame` du modèle. */
export type PlaneEquation = {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
};

/**
 * [RoofPlane] — un pan.
 *
 * La pente est publiée **dans les deux unités** (§67) : convertir côté interface conduirait
 * tôt ou tard à un arrondi qui n'est pas le nôtre.
 */
export type RoofPlane = HumanValidation & {
  readonly id: RoofPlaneId;
  readonly label: string | null;
  readonly area_m2: number;
  readonly slope_deg: number;
  readonly slope_percent: number;
  /** Azimut du pan, nord géographique = 0, sens horaire, dans `[0, 360)`. */
  readonly azimuth_deg: number;
  readonly plane_equation: PlaneEquation;
  readonly polygon: readonly Point3D[];
};

export type RoofEdge = HumanValidation & {
  readonly id: RoofEdgeId;
  readonly type: RoofEdgeType;
  readonly polyline: readonly Point3D[];
  readonly length_m: number;
  /** Pans adjacents, quand la topologie est connue. */
  readonly adjacent_plane_ids: readonly RoofPlaneId[];
};

export type RoofObstacle = HumanValidation & {
  readonly id: RoofObstacleId;
  readonly type: RoofObstacleType;
  readonly footprint: readonly Point3D[];
  readonly height_m: number | null;
  /** §29 — marge de sécurité de pose, en millimètres, jamais codée en dur ailleurs. */
  readonly safety_margin_mm: number;
  readonly plane_id: RoofPlaneId | null;
};

/**
 * Référence de nord retenue pour le modèle. Le nord **magnétique** n'est jamais utilisé dans
 * un contrat : la déclinaison varie dans le temps et rendrait un azimut non reproductible.
 */
export type NorthReference = {
  readonly kind: "geographic";
  /** Rotation à appliquer au repère du modèle pour aligner +Y sur le nord géographique. */
  readonly model_rotation_deg: number;
};

export type RoofModel = TenantScoped &
  Timestamped &
  HumanValidation & {
    readonly id: RoofModelId;
    readonly project_id: DroneProjectId;
    readonly reconstruction_result_id: ReconstructionResultId | null;
    readonly reference_frame: ReferenceFrame;
    readonly north: NorthReference;
    readonly planes: readonly RoofPlane[];
    readonly edges: readonly RoofEdge[];
    readonly obstacles: readonly RoofObstacle[];
    readonly quality: MeasurementQuality;
  };

/** Surface développée totale des pans. Somme simple, sans arrondi. */
export function surfaceTotalePans(planes: readonly RoofPlane[]): number {
  return planes.reduce((total, plane) => total + plane.area_m2, 0);
}

/** Longueur cumulée des arêtes d'un type donné (faîtage, égout, rive…). */
export function longueurCumuleeAretes(
  edges: readonly RoofEdge[],
  type: RoofEdgeType,
): number {
  return edges.filter((edge) => edge.type === type).reduce((total, edge) => total + edge.length_m, 0);
}

/**
 * §22 — vrai seulement si **toute** la géométrie a été validée par un humain. Un modèle dont
 * un seul pan reste une proposition ne peut pas produire un métré présenté comme fiable.
 */
export function modeleEntierementValide(model: RoofModel): boolean {
  const entites: readonly HumanValidation[] = [
    model,
    ...model.planes,
    ...model.edges,
    ...model.obstacles,
  ];
  return entites.every((entite) => entite.validated_by !== null && entite.validated_at !== null);
}
