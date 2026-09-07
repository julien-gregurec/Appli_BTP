/**
 * Jeux d'essai anonymes (§22 du brief noyau).
 *
 * **Aucune donnée réelle, aucune donnée privée** : pas d'adresse existante, pas de nom de
 * client, pas de coordonnées de chantier. Les positions sont posées au large de la côte
 * atlantique française (point nul de convention), les identifiants sont des UUID déterministes
 * lisibles, et les noms de projet décrivent la forme géométrique, pas un bien immobilier.
 *
 * Trois cas, choisis parce qu'ils couvrent trois régimes de validation différents :
 *
 * - `toitureSimple` — deux pans symétriques, géométrie validée, mesure fiable ;
 * - `maisonComplexe` — six pans, noues et obstacles, géométrie **partiellement validée** :
 *   c'est le cas qui doit produire un métré non fiable tant qu'un humain n'a pas tranché ;
 * - `facade` — relevé de façade sans toiture, issu de frames vidéo, donc `degraded_source`
 *   propagé jusqu'à la mesure.
 */

import type { InspectionFinding } from "../inspection";
import type { MediaAsset } from "../media";
import type { Measurement } from "../measurement";
import type { DroneProject } from "../project";
import type { ReconstructionJob, ReconstructionResult } from "../reconstruction";
import type { RoofModel } from "../roof";
import {
  asControlPointId,
  asDroneProjectId,
  asEntrepriseId,
  asInspectionFindingId,
  asMeasurementId,
  asMediaAssetId,
  asReconstructionJobId,
  asReconstructionResultId,
  asRoofEdgeId,
  asRoofModelId,
  asRoofObstacleId,
  asRoofPlaneId,
  asUtilisateurId,
} from "../ids";
import { CONSENTEMENT_NON_RECUEILLI } from "../project";
import { EXTERNAL_REFERENCE_NON_LIE } from "../common";
import { QUALITY_EVIDENCE_INCONNUE } from "../quality";

/** Construit un UUID de démonstration lisible : `<prefixe>-0000-4000-8000-<suffixe>`. */
function uuidDemo(prefixe: string, suffixe: string): string {
  return `${prefixe.padEnd(8, "0")}-0000-4000-8000-${suffixe.padEnd(12, "0")}`;
}

const ENTREPRISE = asEntrepriseId(uuidDemo("e0000001", "000000000001"));
const OPERATEUR = asUtilisateurId(uuidDemo("40000001", "000000000001"));
const T0 = "2026-06-15T09:00:00.000Z";
const T1 = "2026-06-15T11:30:00.000Z";

/** Point de convention hors zone habitée : aucun chantier réel n'est désigné. */
const POSITION_CONVENTION = {
  latitude_deg: 46.0,
  longitude_deg: -3.0,
  altitude: { value_m: 0, reference: "wgs84_ellipsoid" },
} as const;

export type DroneFixture = {
  readonly label: string;
  readonly project: DroneProject;
  readonly media: readonly MediaAsset[];
  readonly job: ReconstructionJob;
  readonly result: ReconstructionResult;
  readonly roof: RoofModel | null;
  readonly measurements: readonly Measurement[];
  readonly findings: readonly InspectionFinding[];
};

function media(input: {
  readonly prefixe: string;
  readonly projet: string;
  readonly kind: MediaAsset["kind"];
  readonly source: MediaAsset["source"];
  readonly degraded: boolean;
  readonly sha: string;
}): MediaAsset {
  const id = asMediaAssetId(uuidDemo(input.prefixe, "000000000001"));
  return {
    id,
    project_id: asDroneProjectId(input.projet),
    entreprise_id: ENTREPRISE,
    kind: input.kind,
    storage_ref: {
      bucket: "drone-medias",
      path: `${ENTREPRISE}/${input.projet}/${id}.jpg`,
    },
    mime: "image/jpeg",
    size_bytes: 8_412_672,
    sha256: input.sha,
    captured_at: T0,
    position: POSITION_CONVENTION,
    relative_altitude: { value_m: 42, reference: "relative_to_takeoff" },
    orientation: { yaw_deg: 180, pitch_deg: -90, roll_deg: 0, exif_orientation: 1 },
    device_id: null,
    camera_profile_id: null,
    exif: { Make: "DEMO", Model: "DEMO-CAM", FocalLength: 8.8 },
    quality_flags: { blur_score: 0.12, exposure_score: 0.51, duplicate_of: null, usable: true },
    degraded_source: input.degraded,
    blurring_applied: null,
    source: input.source,
    created_at: T0,
    updated_at: T0,
  };
}

// --- Cas 1 : petite toiture deux pans ------------------------------------------------

const PROJET_SIMPLE = uuidDemo("40000010", "000000000001");
const RESULTAT_SIMPLE = asReconstructionResultId(uuidDemo("40000012", "000000000001"));

export const toitureSimple: DroneFixture = {
  label: "Toiture deux pans symétriques",
  project: {
    id: asDroneProjectId(PROJET_SIMPLE),
    entreprise_id: ENTREPRISE,
    name: "Toiture deux pans — jeu d'essai",
    survey_type: "roof",
    status: "validated",
    client_name: null,
    address: null,
    position: POSITION_CONVENTION,
    survey_date: "2026-06-15",
    operator_id: OPERATEUR,
    retention_days: 365,
    processing_consent: CONSENTEMENT_NON_RECUEILLI,
    external_reference: EXTERNAL_REFERENCE_NON_LIE,
    created_at: T0,
    updated_at: T1,
  },
  media: [
    media({
      prefixe: "40000011",
      projet: PROJET_SIMPLE,
      kind: "photo",
      source: "sd_card",
      degraded: false,
      sha: "a".repeat(64),
    }),
  ],
  job: {
    id: asReconstructionJobId(uuidDemo("40000013", "000000000001")),
    project_id: asDroneProjectId(PROJET_SIMPLE),
    entreprise_id: ENTREPRISE,
    status: "completed",
    engine: "demo",
    engine_version: "0.0.0-demo",
    parameters: { quality: "medium" },
    input_set: [asMediaAssetId(uuidDemo("40000011", "000000000001"))],
    idempotency_key: "b".repeat(64),
    attempts: 1,
    max_attempts: 3,
    error_category: null,
    started_at: T0,
    finished_at: T1,
    duration_s: 9000,
    estimated_cost_cents: 120,
    created_at: T0,
    updated_at: T1,
  },
  result: {
    id: RESULTAT_SIMPLE,
    job_id: asReconstructionJobId(uuidDemo("40000013", "000000000001")),
    project_id: asDroneProjectId(PROJET_SIMPLE),
    entreprise_id: ENTREPRISE,
    version: 1,
    engine: "demo",
    engine_version: "0.0.0-demo",
    artifacts: {
      point_cloud: null,
      mesh: null,
      texture: null,
      orthophoto: { bucket: "drone-resultats", path: `${ENTREPRISE}/${PROJET_SIMPLE}/ortho.tif` },
      digital_surface_model: null,
      lightweight_glb: null,
    },
    quality_metrics: {
      ...QUALITY_EVIDENCE_INCONNUE,
      reprojection_error_px: 0.42,
      ground_sampling_distance_mm_px: 12,
      calibrated_cameras_count: 120,
      input_images_count: 124,
      retained_images_ratio: 0.97,
    },
    created_at: T1,
    updated_at: T1,
  },
  roof: {
    id: asRoofModelId(uuidDemo("40000014", "000000000001")),
    project_id: asDroneProjectId(PROJET_SIMPLE),
    entreprise_id: ENTREPRISE,
    reconstruction_result_id: RESULTAT_SIMPLE,
    reference_frame: { kind: "reconstruction_local", reconstruction_result_version: 1 },
    north: { kind: "geographic", model_rotation_deg: 0 },
    origin: "corrected",
    validated_by: OPERATEUR,
    validated_at: T1,
    planes: [
      {
        id: asRoofPlaneId(uuidDemo("40000015", "000000000001")),
        label: "Pan sud",
        area_m2: 48.6,
        slope_deg: 35,
        slope_percent: 70.02,
        azimuth_deg: 180,
        plane_equation: { a: 0, b: 0.5736, c: 0.8192, d: -3.2 },
        polygon: [
          { x_m: 0, y_m: 0, z_m: 3 },
          { x_m: 8.1, y_m: 0, z_m: 3 },
          { x_m: 8.1, y_m: 6, z_m: 7.2 },
          { x_m: 0, y_m: 6, z_m: 7.2 },
        ],
        origin: "corrected",
        validated_by: OPERATEUR,
        validated_at: T1,
      },
      {
        id: asRoofPlaneId(uuidDemo("40000015", "000000000002")),
        label: "Pan nord",
        area_m2: 48.6,
        slope_deg: 35,
        slope_percent: 70.02,
        azimuth_deg: 0,
        plane_equation: { a: 0, b: -0.5736, c: 0.8192, d: -3.2 },
        polygon: [
          { x_m: 0, y_m: 6, z_m: 7.2 },
          { x_m: 8.1, y_m: 6, z_m: 7.2 },
          { x_m: 8.1, y_m: 12, z_m: 3 },
          { x_m: 0, y_m: 12, z_m: 3 },
        ],
        origin: "corrected",
        validated_by: OPERATEUR,
        validated_at: T1,
      },
    ],
    edges: [
      {
        id: asRoofEdgeId(uuidDemo("40000016", "000000000001")),
        type: "ridge",
        polyline: [
          { x_m: 0, y_m: 6, z_m: 7.2 },
          { x_m: 8.1, y_m: 6, z_m: 7.2 },
        ],
        length_m: 8.1,
        adjacent_plane_ids: [
          asRoofPlaneId(uuidDemo("40000015", "000000000001")),
          asRoofPlaneId(uuidDemo("40000015", "000000000002")),
        ],
        origin: "corrected",
        validated_by: OPERATEUR,
        validated_at: T1,
      },
    ],
    obstacles: [],
    quality: {
      level: "standard",
      evidence: {
        ...QUALITY_EVIDENCE_INCONNUE,
        reprojection_error_px: 0.42,
        ground_sampling_distance_mm_px: 12,
        source_accuracy: "gnss_standard",
      },
      uncertainty_value: null,
      uncertainty_unit: null,
      degraded_source: false,
    },
    created_at: T1,
    updated_at: T1,
  },
  measurements: [
    {
      id: asMeasurementId(uuidDemo("40000017", "000000000001")),
      project_id: asDroneProjectId(PROJET_SIMPLE),
      entreprise_id: ENTREPRISE,
      kind: "area",
      value: 97.2,
      unit: "m2",
      nature: "computed",
      source: "reconstruction",
      method: "derived_plane",
      origin: "calibrated",
      quality: {
        level: "standard",
        evidence: QUALITY_EVIDENCE_INCONNUE,
        uncertainty_value: null,
        uncertainty_unit: null,
        degraded_source: false,
      },
      geometry_ref: { kind: "roof_plane", plane_id: asRoofPlaneId(uuidDemo("40000015", "000000000001")) },
      reconstruction_result_id: RESULTAT_SIMPLE,
      reconstruction_version: 1,
      author_id: OPERATEUR,
      created_at: T1,
    },
  ],
  findings: [],
};

// --- Cas 2 : maison complexe, géométrie partiellement validée -------------------------

const PROJET_COMPLEXE = uuidDemo("40000020", "000000000001");
const RESULTAT_COMPLEXE = asReconstructionResultId(uuidDemo("40000022", "000000000001"));

const PANS_COMPLEXES = [
  { suffixe: "000000000001", label: "Pan principal sud", area: 62.4, azimut: 175, valide: true },
  { suffixe: "000000000002", label: "Pan principal nord", area: 62.4, azimut: 355, valide: true },
  { suffixe: "000000000003", label: "Croupe est", area: 18.2, azimut: 85, valide: true },
  { suffixe: "000000000004", label: "Croupe ouest", area: 18.2, azimut: 265, valide: false },
  { suffixe: "000000000005", label: "Appentis", area: 11.7, azimut: 190, valide: false },
  { suffixe: "000000000006", label: "Lucarne", area: 3.1, azimut: 175, valide: false },
] as const;

export const maisonComplexe: DroneFixture = {
  label: "Maison six pans, noues et obstacles, validation partielle",
  project: {
    id: asDroneProjectId(PROJET_COMPLEXE),
    entreprise_id: ENTREPRISE,
    name: "Maison complexe — jeu d'essai",
    survey_type: "roof",
    status: "to_validate",
    client_name: null,
    address: null,
    position: POSITION_CONVENTION,
    survey_date: "2026-06-15",
    operator_id: OPERATEUR,
    retention_days: null,
    processing_consent: CONSENTEMENT_NON_RECUEILLI,
    external_reference: EXTERNAL_REFERENCE_NON_LIE,
    created_at: T0,
    updated_at: T1,
  },
  media: [
    media({
      prefixe: "40000021",
      projet: PROJET_COMPLEXE,
      kind: "photo",
      source: "device_folder",
      degraded: false,
      sha: "c".repeat(64),
    }),
  ],
  job: {
    id: asReconstructionJobId(uuidDemo("40000023", "000000000001")),
    project_id: asDroneProjectId(PROJET_COMPLEXE),
    entreprise_id: ENTREPRISE,
    status: "completed",
    engine: "demo",
    engine_version: "0.0.0-demo",
    parameters: { quality: "high", mesh_octree_depth: 11 },
    input_set: [asMediaAssetId(uuidDemo("40000021", "000000000001"))],
    idempotency_key: "d".repeat(64),
    attempts: 2,
    max_attempts: 3,
    error_category: null,
    started_at: T0,
    finished_at: T1,
    duration_s: 14_400,
    estimated_cost_cents: 340,
    created_at: T0,
    updated_at: T1,
  },
  result: {
    id: RESULTAT_COMPLEXE,
    job_id: asReconstructionJobId(uuidDemo("40000023", "000000000001")),
    project_id: asDroneProjectId(PROJET_COMPLEXE),
    entreprise_id: ENTREPRISE,
    version: 2,
    engine: "demo",
    engine_version: "0.0.0-demo",
    artifacts: {
      point_cloud: null,
      mesh: { bucket: "drone-resultats", path: `${ENTREPRISE}/${PROJET_COMPLEXE}/mesh.obj` },
      texture: null,
      orthophoto: { bucket: "drone-resultats", path: `${ENTREPRISE}/${PROJET_COMPLEXE}/ortho.tif` },
      digital_surface_model: null,
      lightweight_glb: {
        bucket: "drone-resultats",
        path: `${ENTREPRISE}/${PROJET_COMPLEXE}/model.glb`,
      },
    },
    quality_metrics: {
      ...QUALITY_EVIDENCE_INCONNUE,
      reprojection_error_px: 0.78,
      ground_sampling_distance_mm_px: 18,
      calibrated_cameras_count: 286,
      input_images_count: 310,
      retained_images_ratio: 0.92,
    },
    created_at: T1,
    updated_at: T1,
  },
  roof: {
    id: asRoofModelId(uuidDemo("40000024", "000000000001")),
    project_id: asDroneProjectId(PROJET_COMPLEXE),
    entreprise_id: ENTREPRISE,
    reconstruction_result_id: RESULTAT_COMPLEXE,
    reference_frame: { kind: "reconstruction_local", reconstruction_result_version: 2 },
    north: { kind: "geographic", model_rotation_deg: 12.5 },
    origin: "detected",
    validated_by: null,
    validated_at: null,
    planes: PANS_COMPLEXES.map((pan) => ({
      id: asRoofPlaneId(uuidDemo("40000025", pan.suffixe)),
      label: pan.label,
      area_m2: pan.area,
      slope_deg: 40,
      slope_percent: 83.91,
      azimuth_deg: pan.azimut,
      plane_equation: { a: 0, b: 0.643, c: 0.766, d: -4.1 },
      polygon: [
        { x_m: 0, y_m: 0, z_m: 3.2 },
        { x_m: 6, y_m: 0, z_m: 3.2 },
        { x_m: 6, y_m: 5, z_m: 7.4 },
        { x_m: 0, y_m: 5, z_m: 7.4 },
      ],
      origin: pan.valide ? ("corrected" as const) : ("detected" as const),
      validated_by: pan.valide ? OPERATEUR : null,
      validated_at: pan.valide ? T1 : null,
    })),
    edges: [
      {
        id: asRoofEdgeId(uuidDemo("40000026", "000000000001")),
        type: "valley",
        polyline: [
          { x_m: 6, y_m: 0, z_m: 3.2 },
          { x_m: 9, y_m: 3, z_m: 6.1 },
        ],
        length_m: 4.24,
        adjacent_plane_ids: [
          asRoofPlaneId(uuidDemo("40000025", "000000000001")),
          asRoofPlaneId(uuidDemo("40000025", "000000000003")),
        ],
        origin: "detected",
        validated_by: null,
        validated_at: null,
      },
    ],
    obstacles: [
      {
        id: asRoofObstacleId(uuidDemo("40000027", "000000000001")),
        type: "chimney",
        footprint: [
          { x_m: 2, y_m: 2, z_m: 5.4 },
          { x_m: 2.8, y_m: 2, z_m: 5.4 },
          { x_m: 2.8, y_m: 2.8, z_m: 5.4 },
          { x_m: 2, y_m: 2.8, z_m: 5.4 },
        ],
        height_m: 1.4,
        safety_margin_mm: 300,
        plane_id: asRoofPlaneId(uuidDemo("40000025", "000000000001")),
        origin: "detected",
        validated_by: null,
        validated_at: null,
      },
    ],
    quality: {
      level: "indicative",
      evidence: {
        ...QUALITY_EVIDENCE_INCONNUE,
        reprojection_error_px: 0.78,
        ground_sampling_distance_mm_px: 18,
        source_accuracy: "gnss_standard",
      },
      uncertainty_value: null,
      uncertainty_unit: null,
      degraded_source: false,
    },
    created_at: T1,
    updated_at: T1,
  },
  measurements: [
    {
      id: asMeasurementId(uuidDemo("40000028", "000000000001")),
      project_id: asDroneProjectId(PROJET_COMPLEXE),
      entreprise_id: ENTREPRISE,
      kind: "area",
      value: 176.0,
      unit: "m2",
      nature: "computed",
      source: "reconstruction",
      method: "derived_model",
      origin: "imported",
      quality: {
        level: "indicative",
        evidence: QUALITY_EVIDENCE_INCONNUE,
        uncertainty_value: null,
        uncertainty_unit: null,
        degraded_source: false,
      },
      geometry_ref: { kind: "roof_plane", plane_id: asRoofPlaneId(uuidDemo("40000025", "000000000004")) },
      reconstruction_result_id: RESULTAT_COMPLEXE,
      reconstruction_version: 2,
      author_id: OPERATEUR,
      created_at: T1,
    },
  ],
  findings: [
    {
      id: asInspectionFindingId(uuidDemo("40000029", "000000000001")),
      project_id: asDroneProjectId(PROJET_COMPLEXE),
      entreprise_id: ENTREPRISE,
      title: "Tuiles déplacées en rive",
      description: null,
      category: "tile_damage",
      priority: "medium",
      status: "open",
      position: {
        model_point: { x_m: 5.4, y_m: 1.2, z_m: 5.8 },
        ortho_point: null,
        media_anchor: {
          media_id: asMediaAssetId(uuidDemo("40000021", "000000000001")),
          x_px: 2104,
          y_px: 1388,
        },
      },
      media_refs: [asMediaAssetId(uuidDemo("40000021", "000000000001"))],
      measurement_refs: [],
      author_id: OPERATEUR,
      external_reference: EXTERNAL_REFERENCE_NON_LIE,
      created_at: T1,
      updated_at: T1,
    },
  ],
};

// --- Cas 3 : façade issue de frames vidéo (source dégradée) ---------------------------

const PROJET_FACADE = uuidDemo("40000030", "000000000001");
const RESULTAT_FACADE = asReconstructionResultId(uuidDemo("40000032", "000000000001"));

export const facade: DroneFixture = {
  label: "Façade relevée à partir de frames vidéo (source dégradée)",
  project: {
    id: asDroneProjectId(PROJET_FACADE),
    entreprise_id: ENTREPRISE,
    name: "Façade — jeu d'essai",
    survey_type: "facade",
    status: "to_validate",
    client_name: null,
    address: null,
    position: POSITION_CONVENTION,
    survey_date: "2026-06-15",
    operator_id: OPERATEUR,
    retention_days: 90,
    processing_consent: CONSENTEMENT_NON_RECUEILLI,
    external_reference: EXTERNAL_REFERENCE_NON_LIE,
    created_at: T0,
    updated_at: T1,
  },
  media: [
    media({
      prefixe: "40000031",
      projet: PROJET_FACADE,
      kind: "extracted_frame",
      source: "video_extraction",
      degraded: true,
      sha: "e".repeat(64),
    }),
  ],
  job: {
    id: asReconstructionJobId(uuidDemo("40000033", "000000000001")),
    project_id: asDroneProjectId(PROJET_FACADE),
    entreprise_id: ENTREPRISE,
    status: "completed",
    engine: "demo",
    engine_version: "0.0.0-demo",
    parameters: { quality: "low" },
    input_set: [asMediaAssetId(uuidDemo("40000031", "000000000001"))],
    idempotency_key: "f".repeat(64),
    attempts: 1,
    max_attempts: 3,
    error_category: null,
    started_at: T0,
    finished_at: T1,
    duration_s: 3600,
    estimated_cost_cents: 60,
    created_at: T0,
    updated_at: T1,
  },
  result: {
    id: RESULTAT_FACADE,
    job_id: asReconstructionJobId(uuidDemo("40000033", "000000000001")),
    project_id: asDroneProjectId(PROJET_FACADE),
    entreprise_id: ENTREPRISE,
    version: 1,
    engine: "demo",
    engine_version: "0.0.0-demo",
    artifacts: {
      point_cloud: null,
      mesh: { bucket: "drone-resultats", path: `${ENTREPRISE}/${PROJET_FACADE}/mesh.obj` },
      texture: null,
      orthophoto: null,
      digital_surface_model: null,
      lightweight_glb: null,
    },
    quality_metrics: {
      ...QUALITY_EVIDENCE_INCONNUE,
      reprojection_error_px: 1.94,
      ground_sampling_distance_mm_px: 41,
      calibrated_cameras_count: 58,
      input_images_count: 96,
      retained_images_ratio: 0.6,
    },
    created_at: T1,
    updated_at: T1,
  },
  roof: null,
  measurements: [
    {
      id: asMeasurementId(uuidDemo("40000034", "000000000001")),
      project_id: asDroneProjectId(PROJET_FACADE),
      entreprise_id: ENTREPRISE,
      kind: "height",
      value: 8.42,
      unit: "m",
      nature: "measured",
      source: "reconstruction",
      method: "manual_3d",
      origin: "manual",
      quality: {
        level: "indicative",
        evidence: {
          ...QUALITY_EVIDENCE_INCONNUE,
          ground_sampling_distance_mm_px: 41,
          source_accuracy: "gnss_standard",
        },
        uncertainty_value: null,
        uncertainty_unit: null,
        // §77 — la mesure hérite de la dégradation de la frame vidéo dont elle est issue.
        degraded_source: true,
      },
      geometry_ref: {
        kind: "points",
        points: [
          { x_m: 0, y_m: 0, z_m: 0 },
          { x_m: 0, y_m: 0, z_m: 8.42 },
        ],
      },
      reconstruction_result_id: RESULTAT_FACADE,
      reconstruction_version: 1,
      author_id: OPERATEUR,
      created_at: T1,
    },
  ],
  findings: [],
};

export const FIXTURES: readonly DroneFixture[] = [toitureSimple, maisonComplexe, facade];

/** Point de calage de démonstration, utilisé pour illustrer le contrôle d'échelle (§26). */
export const POINT_CONTROLE_DEMO = {
  id: asControlPointId(uuidDemo("40000040", "000000000001")),
  label: "Distance connue façade (jeu d'essai)",
  measured_position: { x_m: 0, y_m: 0, z_m: 0 },
  known_position: null,
  known_distance_m: 5,
  residual_m: null,
} as const;
