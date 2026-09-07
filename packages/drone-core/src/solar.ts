/**
 * [SolarPanelSpec], [SolarPlacementRules], [SolarLayout], [SolarLayoutResult] — §16 du brief
 * noyau, §L de l'architecture.
 *
 * Deux règles de produit sont visibles dans ces types, et c'est voulu :
 *
 * - **le catalogue de panneaux n'est pas pré-rempli** (§38) : le noyau définit la forme d'une
 *   fiche, il n'en fournit aucune ;
 * - **les retraits réglementaires ne sont pas codés en dur** (§28) : ils sont des paramètres
 *   saisis, par défaut vides, et l'utilisateur qui les renseigne engage sa responsabilité.
 *
 * L'ombrage est hors périmètre (§31) : un moteur solaire approximatif produirait des chiffres
 * crédibles et faux, ce qui est le pire résultat possible pour un outil de métré. Le champ
 * `shading_model` existe pour rendre cette absence explicite plutôt que silencieuse.
 */

import type { IsoDateTime, TenantScoped, Timestamped } from "./common";
import type { DroneProjectId, RoofPlaneId, SolarLayoutId, SolarPanelSpecId } from "./ids";
import type { MeasurementOrigin } from "./provenance";
import type { Point3D } from "./units";

/** Fiche panneau. Dimensions en **millimètres**, unité de publication des fabricants. */
export type SolarPanelSpec = TenantScoped &
  Timestamped & {
    readonly id: SolarPanelSpecId;
    readonly manufacturer: string;
    readonly model: string;
    readonly width_mm: number;
    readonly height_mm: number;
    readonly thickness_mm: number | null;
    readonly peak_power_w: number;
    readonly weight_kg: number | null;
  };

export type PanelOrientation = "portrait" | "landscape";

export const PANEL_ORIENTATIONS: readonly PanelOrientation[] = ["portrait", "landscape"];

/** Zone interdite d'implantation, tracée sur un pan. */
export type ForbiddenZone = {
  readonly label: string;
  readonly polygon: readonly Point3D[];
  readonly margin_mm: number;
};

/**
 * §28 — retrait réglementaire **déclaré par l'utilisateur**. Le noyau ne connaît aucune valeur
 * par défaut : la réglementation varie par commune et par assureur, et inventer un retrait
 * serait produire un plan d'implantation faux avec l'autorité d'un logiciel.
 */
export type RegulatorySetback = {
  readonly label: string;
  readonly value_mm: number;
  readonly declared_by_user: true;
  readonly reference: string | null;
};

export type SolarPlacementRules = {
  readonly allowed_orientations: readonly PanelOrientation[];
  readonly row_gap_mm: number;
  readonly column_gap_mm: number;
  readonly margin_ridge_mm: number;
  readonly margin_eave_mm: number;
  readonly margin_verge_mm: number;
  readonly obstacle_margin_mm: number;
  readonly forbidden_zones: readonly ForbiddenZone[];
  /** Vide par défaut. Une liste vide signifie « aucun retrait déclaré », pas « aucun retrait ». */
  readonly regulatory_setbacks: readonly RegulatorySetback[];
};

/** Règles de départ : aucune marge inventée, aucun retrait supposé. */
export const REGLES_IMPLANTATION_VIDES: SolarPlacementRules = {
  allowed_orientations: ["portrait", "landscape"],
  row_gap_mm: 0,
  column_gap_mm: 0,
  margin_ridge_mm: 0,
  margin_eave_mm: 0,
  margin_verge_mm: 0,
  obstacle_margin_mm: 0,
  forbidden_zones: [],
  regulatory_setbacks: [],
};

/**
 * Variante d'implantation. §30 — plusieurs variantes comparables par projet, donc une entité
 * par variante, jamais une colonne sur le pan.
 */
export type SolarLayout = TenantScoped &
  Timestamped & {
    readonly id: SolarLayoutId;
    readonly project_id: DroneProjectId;
    readonly roof_plane_id: RoofPlaneId;
    readonly panel_spec_id: SolarPanelSpecId;
    readonly variant_label: string;
    readonly rules: SolarPlacementRules;
  };

export type PanelPlacement = {
  readonly row: number;
  readonly column: number;
  readonly orientation: PanelOrientation;
  /** Centre du panneau, dans le repère du modèle de toiture. */
  readonly center: Point3D;
};

/** §31 — l'ombrage est hors périmètre ; le dire dans le contrat évite de le laisser croire. */
export type ShadingModel = "none";

export type SolarLayoutResult = {
  readonly layout_id: SolarLayoutId;
  readonly panel_count: number;
  readonly total_peak_power_w: number;
  readonly used_area_m2: number;
  readonly plane_area_m2: number;
  readonly placements: readonly PanelPlacement[];
  readonly shading_model: ShadingModel;
  /** Provenance héritée du pan : une implantation ne peut pas être plus fiable que sa toiture. */
  readonly origin: MeasurementOrigin;
  readonly computed_at: IsoDateTime;
};

/** Puissance crête d'une implantation. Pas d'estimation de production : ce serait §31. */
export function puissanceCrete(panelCount: number, spec: SolarPanelSpec): number {
  return panelCount * spec.peak_power_w;
}

/** Taux de couverture du pan, dans `[0, 1]`. */
export function tauxCouverture(result: SolarLayoutResult): number {
  if (result.plane_area_m2 <= 0) return 0;
  return result.used_area_m2 / result.plane_area_m2;
}
