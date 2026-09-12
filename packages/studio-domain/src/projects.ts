export const projectTypes = {
  construction: "Chantier",
  travel: "Voyage / Vacances",
  wedding: "Mariage",
  birthday: "Anniversaire",
  event: "Événement",
  memory: "Souvenir",
  free: "Libre",
} as const;
export type ProjectType = keyof typeof projectTypes;
export const aspectRatios = {
  "9:16": "Vertical",
  "16:9": "Horizontal",
  "1:1": "Carré",
  "4:5": "Portrait social",
} as const;
export type AspectRatio = keyof typeof aspectRatios;
export type ProjectStatus = "draft" | "ready" | "archived";
export const projectStatuses = {
  draft: "Brouillon",
  ready: "Prêt",
  archived: "Archivé",
} as const;
export interface ProjectInput {
  name: string;
  project_type: ProjectType;
  description: string;
  location_label: string;
  started_at: string | null;
  ended_at: string | null;
  target_duration_seconds: number | null;
  target_aspect_ratio: AspectRatio;
  status: "draft" | "ready";
  metadata_json: Record<string, string>;
}
export interface StudioProject extends Omit<ProjectInput, "status"> {
  id: string;
  workspace_id: string;
  created_by: string;
  status: ProjectStatus;
  cover_asset_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  revision: number;
}
export interface ProjectSummary extends StudioProject {
  photos: number;
  videos: number;
  media_bytes: number;
}
export interface ProjectList {
  total: number;
  projects: ProjectSummary[];
}
export interface ProjectAsset {
  workspace_id: string;
  project_id: string;
  asset_id: string;
  sort_order: number;
  created_at: string;
}
export interface DashboardStats {
  projects: number;
  photos: number;
  videos: number;
  bytes: number;
}
export function isProjectType(v: unknown): v is ProjectType {
  return typeof v === "string" && Object.hasOwn(projectTypes, v);
}
export function isAspectRatio(v: unknown): v is AspectRatio {
  return typeof v === "string" && Object.hasOwn(aspectRatios, v);
}
export class ProjectValidationError extends Error {}
function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function text(v: unknown, max: number, label: string, required = false) {
  if (typeof v !== "string" || v.trim().length > max || (required && !v.trim()))
    throw new ProjectValidationError(
      `${label} : ${required ? "1 à " : ""}${max} caractères maximum.`,
    );
  return v.trim();
}
function date(v: unknown): string | null {
  if (v === null || v === "") return null;
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    throw new ProjectValidationError("Date invalide.");
  return v;
}
export function validateProject(v: unknown): ProjectInput {
  if (!object(v)) throw new ProjectValidationError("Projet invalide.");
  if (!isProjectType(v.project_type))
    throw new ProjectValidationError("Type de projet invalide.");
  if (!isAspectRatio(v.target_aspect_ratio))
    throw new ProjectValidationError("Format cible invalide.");
  if (v.status !== "draft" && v.status !== "ready")
    throw new ProjectValidationError("Statut invalide.");
  const duration = v.target_duration_seconds;
  if (
    duration !== null &&
    (typeof duration !== "number" ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 600)
  )
    throw new ProjectValidationError(
      "La durée doit être comprise entre 1 et 600 secondes.",
    );
  const start = date(v.started_at),
    end = date(v.ended_at);
  if (start && end && end < start)
    throw new ProjectValidationError(
      "La date de fin doit suivre la date de début.",
    );
  const metadata: Record<string, string> = {};
  if (!object(v.metadata_json))
    throw new ProjectValidationError("Informations projet invalides.");
  for (const [key, value] of Object.entries(v.metadata_json)) {
    if (
      v.project_type !== "construction" ||
      !["client", "company", "services"].includes(key)
    )
      throw new ProjectValidationError(
        "Informations incompatibles avec le type.",
      );
    metadata[key] = text(value, 500, "Information chantier");
  }
  return {
    name: text(v.name, 100, "Nom", true),
    project_type: v.project_type,
    description: text(v.description, 2000, "Description"),
    location_label: text(v.location_label, 200, "Lieu"),
    started_at: start,
    ended_at: end,
    target_duration_seconds: duration,
    target_aspect_ratio: v.target_aspect_ratio,
    status: v.status,
    metadata_json: metadata,
  };
}
export function canEditProject(role: string, status: ProjectStatus) {
  return ["owner", "admin", "editor"].includes(role) && status !== "archived";
}
export function canManageProject(role: string) {
  return role === "owner" || role === "admin";
}
export function durationLabel(n: number | null) {
  return n === null ? "Automatique" : `${n} s`;
}
/** Stable chronological preference, never a timeline. */
export function chronologicalIds<
  T extends {
    id: string;
    captured_at: string | null;
    created_at: string;
    sort_order: number;
  },
>(items: T[]) {
  return [...items]
    .sort(
      (a, b) =>
        Date.parse(a.captured_at ?? a.created_at) -
          Date.parse(b.captured_at ?? b.created_at) ||
        a.sort_order - b.sort_order ||
        a.id.localeCompare(b.id),
    )
    .map((a) => a.id);
}
export function moveMedia(ids: string[], source: string, target: string) {
  const from = ids.indexOf(source),
    to = ids.indexOf(target);
  if (from < 0 || to < 0)
    throw new ProjectValidationError("Média non autorisé.");
  const result = [...ids];
  result.splice(from, 1);
  result.splice(to, 0, source);
  return result;
}
