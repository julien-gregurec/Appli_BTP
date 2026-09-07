import { describe, expect, it } from "vitest";

import { maisonComplexe, toitureSimple } from "../fixtures";
import type {
  DroneInspectionExportV1,
  DroneMeasurementExportV1,
  DroneProjectSummaryV1,
  DroneRoofExportV1,
  DroneSolarExportV1,
} from "../exports";
import { toExportedProvenanceV1 } from "../exports";
import { stableStringify } from "../serialization";
import {
  validateDroneInspectionExportV1,
  validateDroneMeasurementExportV1,
  validateDroneProjectSummaryV1,
  validateDroneRoofExportV1,
  validateDroneSolarExportV1,
} from "./contracts";

const GENERE_LE = "2026-06-16T08:00:00.000Z";
const PROVENANCE = toExportedProvenanceV1({
  origin: "calibrated",
  quality: toitureSimple.measurements[0].quality,
});

const resume: DroneProjectSummaryV1 = {
  contract: "drone.project_summary",
  contract_version: 1,
  generated_at: GENERE_LE,
  project_id: toitureSimple.project.id,
  reconstruction_version: 1,
  project_name: toitureSimple.project.name,
  survey_type: "roof",
  survey_date: "2026-06-15",
  client_name: null,
  address: null,
  quantities: [
    {
      label: "Surface développée",
      value: 97.2,
      unit: "m2",
      nature: "computed",
      provenance: PROVENANCE,
    },
  ],
  findings_summary: [],
  findings_total: 0,
  report_export_id: null,
};

const toiture: DroneRoofExportV1 = {
  contract: "drone.roof",
  contract_version: 1,
  generated_at: GENERE_LE,
  project_id: toitureSimple.project.id,
  reconstruction_version: 1,
  reference_frame: { kind: "reconstruction_local", reconstruction_result_version: 1 },
  north_rotation_deg: 0,
  planes: (toitureSimple.roof?.planes ?? []).map((pan) => ({
    plane_ref: pan.id,
    label: pan.label,
    area_m2: pan.area_m2,
    slope_deg: pan.slope_deg,
    slope_percent: pan.slope_percent,
    azimuth_deg: pan.azimuth_deg,
    polygon: pan.polygon,
    validated: pan.validated_by !== null,
    provenance: PROVENANCE,
  })),
  edges: [],
  obstacles: [],
  total_area_m2: 97.2,
  fully_validated: true,
  provenance: PROVENANCE,
};

const mesures: DroneMeasurementExportV1 = {
  contract: "drone.measurements",
  contract_version: 1,
  generated_at: GENERE_LE,
  project_id: toitureSimple.project.id,
  reconstruction_version: 1,
  measurements: [
    {
      measurement_ref: toitureSimple.measurements[0].id,
      kind: "area",
      value: 97.2,
      unit: "m2",
      nature: "computed",
      nature_label: "CALCULÉ",
      source: "reconstruction",
      method: "derived_plane",
      geometry_kind: "roof_plane",
      reconstruction_version: 1,
      created_at: GENERE_LE,
      provenance: PROVENANCE,
    },
  ],
};

const inspection: DroneInspectionExportV1 = {
  contract: "drone.inspection",
  contract_version: 1,
  generated_at: GENERE_LE,
  project_id: maisonComplexe.project.id,
  reconstruction_version: 2,
  findings: maisonComplexe.findings.map((constat) => ({
    finding_ref: constat.id,
    title: constat.title,
    description: constat.description,
    category: constat.category,
    priority: constat.priority,
    status: constat.status,
    model_point: constat.position.model_point,
    ortho_point: constat.position.ortho_point,
    media: [],
    measurement_refs: [],
    created_at: constat.created_at,
  })),
  reserve_drafts: maisonComplexe.findings.map((constat) => ({
    finding_ref: constat.id,
    title: constat.title,
    comment: constat.description,
    category: constat.category,
    observed_at: constat.created_at,
    media: [],
    location_hint: null,
  })),
};

const solaire: DroneSolarExportV1 = {
  contract: "drone.solar",
  contract_version: 1,
  generated_at: GENERE_LE,
  project_id: toitureSimple.project.id,
  reconstruction_version: 1,
  variants: [
    {
      layout_ref: "variante-a",
      variant_label: "Variante A — portrait",
      plane_ref: toitureSimple.roof?.planes[0].id ?? "",
      panel: {
        manufacturer: "DEMO",
        model: "DEMO-425",
        width_mm: 1134,
        height_mm: 1762,
        peak_power_w: 425,
      },
      orientations_used: ["portrait"],
      panel_count: 18,
      total_peak_power_w: 7650,
      used_area_m2: 35.96,
      plane_area_m2: 48.6,
      coverage_ratio: 0.74,
      provenance: PROVENANCE,
    },
  ],
  shading_model: "none",
  declared_regulatory_setbacks: [],
};

describe("contrats d'export V1", () => {
  it("accepte les cinq contrats correctement formés", () => {
    expect(validateDroneProjectSummaryV1(resume).ok).toBe(true);
    expect(validateDroneRoofExportV1(toiture).ok).toBe(true);
    expect(validateDroneMeasurementExportV1(mesures).ok).toBe(true);
    expect(validateDroneInspectionExportV1(inspection).ok).toBe(true);
    expect(validateDroneSolarExportV1(solaire).ok).toBe(true);
  });

  it("refuse une enveloppe dont le nom ou la version ne correspond pas", () => {
    expect(validateDroneRoofExportV1({ ...toiture, contract: "drone.solar" }).ok).toBe(false);
    expect(validateDroneRoofExportV1({ ...toiture, contract_version: 2 }).ok).toBe(false);
  });

  it("refuse une valeur publiée sans son bloc de provenance (§84)", () => {
    const sansProvenance = {
      ...mesures,
      measurements: [{ ...mesures.measurements[0], provenance: undefined }],
    };
    const resultat = validateDroneMeasurementExportV1(sansProvenance);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.issues.map((a) => a.path)).toContain("$.measurements[0].provenance");
    }
  });

  it("refuse un azimut hors domaine", () => {
    const horsDomaine = {
      ...toiture,
      planes: [{ ...toiture.planes[0], azimuth_deg: 400 }],
    };
    const resultat = validateDroneRoofExportV1(horsDomaine);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.issues.map((a) => a.path)).toContain("$.planes[0].azimuth_deg");
    }
  });

  it("refuse un brouillon de réserve porteur d'un statut de workflow (§118)", () => {
    const avecStatut = {
      ...inspection,
      reserve_drafts: [{ ...inspection.reserve_drafts[0], status: "validee" }],
    };
    const resultat = validateDroneInspectionExportV1(avecStatut);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(resultat.issues.map((a) => a.path)).toContain("$.reserve_drafts[0].status");
    }
  });

  it("refuse un modèle d'ombrage annoncé (§31)", () => {
    expect(validateDroneSolarExportV1({ ...solaire, shading_model: "simple" }).ok).toBe(false);
  });

  it("refuse une surface utilisée supérieure à la surface du pan", () => {
    const incoherent = {
      ...solaire,
      variants: [{ ...solaire.variants[0], used_area_m2: 60 }],
    };
    expect(validateDroneSolarExportV1(incoherent).ok).toBe(false);
  });

  it("sérialise chaque contrat de façon stable et reparse à l'identique", () => {
    for (const contrat of [resume, toiture, mesures, inspection, solaire]) {
      const serialise = stableStringify(contrat);
      expect(stableStringify(JSON.parse(serialise))).toBe(serialise);
    }
  });
});

describe("provenance exportée", () => {
  it("propage la source dégradée jusqu'au bloc publié (§77)", () => {
    const provenance = toExportedProvenanceV1({
      origin: "manual",
      quality: {
        level: "indicative",
        evidence: {
          reprojection_error_px: null,
          ground_sampling_distance_mm_px: null,
          control_point_error_m: null,
          source_accuracy: null,
        },
        uncertainty_value: null,
        uncertainty_unit: null,
        degraded_source: true,
      },
    });

    expect(provenance.origin).toBe("approximated");
    expect(provenance.trusted).toBe(false);
    expect(provenance.warning).toContain("dégradée");
    expect(provenance.uncertainty_value).toBeNull();
  });
});
