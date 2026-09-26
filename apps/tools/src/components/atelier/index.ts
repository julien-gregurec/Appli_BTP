/**
 * Atelier — vues « report » et « métrés ».
 *
 * Composants UI + adaptateurs légers au-dessus du backend `@/lib/chantier` (déjà testé).
 * Aucune dépendance au moteur géométrique interne, à IndexedDB, à Supabase ni à une route
 * Atelier précise : tout passe par des props typées (§9), brancheables sur n'importe quel
 * `TracingProject` / adaptateur.
 */

export { ReportTableView } from "./report/ReportTableView";
export { WitnessDimensionCard } from "./report/WitnessDimensionCard";
export {
  buildReportViewModel,
  REPORT_COLUMNS,
  type ReportTableViewProps,
  type ReportTableViewModel,
  type ReportDisplayRow,
} from "./report/report-view-model";
export {
  buildWitnessViewModel,
  WITNESS_PRESETS_MM,
  type WitnessViewModel,
} from "./report/witness-view-model";

export { NomenclatureTable } from "./quantities/NomenclatureTable";
export { MarginSelector } from "./quantities/MarginSelector";
export { ProfilePlanCard } from "./quantities/ProfilePlanCard";
export { LightingSummaryCard } from "./quantities/LightingSummaryCard";
export {
  buildNomenclatureViewModel,
  type NomenclatureTableProps,
  type NomenclatureViewModel,
  type NomenclatureDisplayLine,
} from "./quantities/nomenclature-view-model";
export {
  buildMarginViewModel,
  resolveMarginChoice,
  MARGIN_OPTIONS,
  type MarginOption,
  type MarginViewModel,
} from "./quantities/margin-view-model";
export {
  buildProfilePlanViewModel,
  type ProfilePlanCardProps,
  type ProfilePlanViewModel,
} from "./quantities/profile-view-model";
export {
  buildLightingSummaryViewModel,
  type LightingSummaryCardProps,
  type LightingSummaryViewModel,
  type LedSummaryInput,
} from "./quantities/lighting-view-model";

export { OriginBadge } from "./shared/OriginBadge";
export { QualityBadge } from "./shared/QualityBadge";
export {
  originBadgeModel,
  qualityBadgeModel,
  type OriginBadgeModel,
  type QualityBadgeModel,
} from "./shared/badges";
export { formatDecimal, formatMm, formatQuantity, formatPercent } from "./shared/format";
