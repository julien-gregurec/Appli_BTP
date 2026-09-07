/**
 * [Measurement] et provenance de mesure — §7 et §8 du brief noyau, §K de l'architecture.
 *
 * Toute mesure porte, sans exception : `source`, `method`, `quality`, `unit`, `created_at`,
 * `geometry_ref`, `reconstruction_version`. Une mesure à laquelle il manque l'un de ces
 * champs n'est pas une mesure incomplète, c'est un chiffre sans provenance — et le produit
 * n'en affiche pas.
 */

import type { IsoDateTime, TenantScoped } from "./common";
import type {
  ControlPointId,
  DroneProjectId,
  MeasurementId,
  ReconstructionResultId,
  RoofEdgeId,
  RoofPlaneId,
  UtilisateurId,
} from "./ids";
import type { MeasurementOrigin } from "./provenance";
import { isRealWorldTrusted, originWarning } from "./provenance";
import type { MeasurementQuality } from "./quality";
import type { MeasurementUnit, Point3D } from "./units";

/** §63 — grandeurs mesurables. */
export type MeasurementKind =
  | "distance"
  | "polyline"
  | "area"
  | "angle"
  | "slope"
  | "height"
  | "elevation_delta";

export const MEASUREMENT_KINDS: readonly MeasurementKind[] = [
  "distance",
  "polyline",
  "area",
  "angle",
  "slope",
  "height",
  "elevation_delta",
];

/** Unité imposée par la grandeur. Aucune mesure ne choisit son unité librement. */
export const UNITE_PAR_GRANDEUR: Readonly<Record<MeasurementKind, MeasurementUnit>> = {
  distance: "m",
  polyline: "m",
  area: "m2",
  angle: "deg",
  slope: "percent",
  height: "m",
  elevation_delta: "m",
};

/**
 * §37 — trois natures distinctes et **affichées** : mesuré, calculé, estimé. Elles ne sont pas
 * interchangeables et l'interface ne les fusionne jamais.
 */
export type MeasurementNature = "measured" | "computed" | "estimated";

export const MEASUREMENT_NATURES: readonly MeasurementNature[] = [
  "measured",
  "computed",
  "estimated",
];

export const MEASUREMENT_NATURE_LABELS: Readonly<Record<MeasurementNature, string>> = {
  measured: "MESURÉ",
  computed: "CALCULÉ",
  estimated: "ESTIMÉ",
};

/** D'où vient physiquement la valeur. Distinct de `origin`, qui dit à quel point on la croit. */
export type MeasurementSource =
  | "reconstruction"
  | "orthophoto"
  | "field_control"
  | "manual_input"
  | "imported";

export const MEASUREMENT_SOURCES: readonly MeasurementSource[] = [
  "reconstruction",
  "orthophoto",
  "field_control",
  "manual_input",
  "imported",
];

/** Comment la valeur a été obtenue. */
export type MeasurementMethod = "manual_3d" | "manual_ortho" | "derived_plane" | "derived_model";

export const MEASUREMENT_METHODS: readonly MeasurementMethod[] = [
  "manual_3d",
  "manual_ortho",
  "derived_plane",
  "derived_model",
];

/**
 * Géométrie effectivement utilisée (§58). Sans elle, une mesure n'est pas reproductible ; et
 * une mesure non reproductible n'est pas une mesure.
 */
export type GeometryRef =
  | { readonly kind: "points"; readonly points: readonly Point3D[] }
  | { readonly kind: "roof_plane"; readonly plane_id: RoofPlaneId }
  | { readonly kind: "roof_edge"; readonly edge_id: RoofEdgeId }
  | { readonly kind: "ortho_points"; readonly points: readonly Point3D[] };

export type Measurement = TenantScoped & {
  readonly id: MeasurementId;
  readonly project_id: DroneProjectId;
  readonly kind: MeasurementKind;
  readonly value: number;
  readonly unit: MeasurementUnit;
  readonly nature: MeasurementNature;
  readonly source: MeasurementSource;
  readonly method: MeasurementMethod;
  readonly origin: MeasurementOrigin;
  readonly quality: MeasurementQuality;
  readonly geometry_ref: GeometryRef;
  /** Quel résultat de reconstruction a produit la valeur. `null` pour une saisie terrain. */
  readonly reconstruction_result_id: ReconstructionResultId | null;
  readonly reconstruction_version: number | null;
  readonly author_id: UtilisateurId | null;
  readonly created_at: IsoDateTime;
};

/** Vrai si l'unité portée par la mesure est celle qu'impose sa grandeur. */
export function uniteCoherenteAvecGrandeur(measurement: {
  readonly kind: MeasurementKind;
  readonly unit: MeasurementUnit;
}): boolean {
  return UNITE_PAR_GRANDEUR[measurement.kind] === measurement.unit;
}

/**
 * Présentation d'une mesure : nature affichée, fiabilité, avertissement éventuel.
 * Point unique par lequel l'interface et le PDF passent, pour que la règle ne se réécrive pas
 * à deux endroits.
 */
export function describeMeasurementTrust(measurement: Measurement): {
  readonly nature_label: string;
  readonly trusted: boolean;
  readonly warning: string;
} {
  return {
    nature_label: MEASUREMENT_NATURE_LABELS[measurement.nature],
    trusted: isRealWorldTrusted(measurement.origin) && !measurement.quality.degraded_source,
    warning: measurement.quality.degraded_source
      ? "Valeur indicative — issue d'une image dégradée (frame vidéo)."
      : originWarning(measurement.origin),
  };
}

/**
 * [ControlPoint] — §26. Point de calage ou distance connue relevée sur site : c'est ce qui
 * permet de contrôler, et le cas échéant de corriger, l'échelle d'une reconstruction.
 */
export type ControlPoint = {
  readonly id: ControlPointId;
  readonly label: string;
  readonly measured_position: Point3D;
  readonly known_position: Point3D | null;
  readonly known_distance_m: number | null;
  readonly residual_m: number | null;
};
