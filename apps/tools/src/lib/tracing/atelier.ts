/**
 * §6 / §7 — Aides de l'accueil Atelier et du flux « nouveau tracé ».
 *
 * Pas d'UI ici : uniquement des fonctions pures (libellés, construction et mise à jour
 * d'un `TracingProject`, description pour la liste des projets récents). Les composants
 * React s'appuient dessus.
 */

import {
  createTracingProject,
  validateTracingProject,
  TracingProjectError,
  TRACING_PROJECT_TYPES,
  type TracingProject,
  type TracingProjectType,
} from "./project";
import { createProjectId } from "../projects/model";
import { traceModelLabelFor } from "./model-resolver";

/** §7 — libellés FR des types d'ouvrage, dans l'ordre demandé (Plafond, Mur, Niche, Arche, Autre). */
export const TRACING_OUVRAGE_LABELS: Record<TracingProjectType, string> = {
  ceiling: "Plafond",
  wall: "Mur",
  niche: "Niche",
  arch: "Arche",
  other: "Autre",
};

export const TRACING_OUVRAGE_ORDER: readonly TracingProjectType[] = ["ceiling", "wall", "niche", "arch", "other"];

export function ouvrageLabel(type: TracingProjectType): string {
  return TRACING_OUVRAGE_LABELS[type];
}

/** État collecté par l'assistant avant la création réelle du projet. */
export type NewTraceInput = {
  type: TracingProjectType;
  name: string;
  roomWidthMm?: number;
  roomHeightMm?: number;
};

/** §7 — crée réellement un `TracingProject` à partir de la saisie de l'assistant. */
export function buildTracingProjectFromInput(
  input: NewTraceInput,
  options: { id?: string; now?: Date; companyId?: string; userId?: string } = {},
): TracingProject {
  if (!TRACING_PROJECT_TYPES.includes(input.type)) {
    throw new TracingProjectError("Le type d'ouvrage est inconnu.");
  }
  return createTracingProject(
    {
      id: options.id ?? createProjectId(),
      name: input.name,
      type: input.type,
      roomWidthMm: input.roomWidthMm,
      roomHeightMm: input.roomHeightMm,
      companyId: options.companyId,
      userId: options.userId,
    },
    options.now ?? new Date(),
  );
}

export type TracingProjectPatch = Partial<
  Pick<TracingProject, "name" | "roomWidthMm" | "roomHeightMm" | "modelId" | "modelParams" | "startFromPhoto">
>;

/** Applique un correctif, remonte `updatedAt` et revalide strictement (voie autosave / étapes). */
export function touchTracingProject(
  project: TracingProject,
  patch: TracingProjectPatch,
  now: Date = new Date(),
): TracingProject {
  return validateTracingProject({ ...project, ...patch, updatedAt: now.toISOString() });
}

/** Convertit une saisie optionnelle en mètres (« 4,2 ») vers des millimètres bornés. */
export function metresInputToMm(raw: string): number | undefined {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > 1000) {
    throw new TracingProjectError("La dimension de pièce doit être comprise entre 0 et 1000 m.");
  }
  return Math.round(value * 1000);
}

function formatMetres(mm: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(mm / 1000);
}

/**
 * TRACING-WORKSHOP-UI-V1 — n'enregistrer que ce que l'utilisateur a réellement changé.
 *
 * Les défauts restent publiés par le modèle et ne sont jamais recopiés dans le projet :
 * `TracingProject.modelParams` ne porte que les écarts. C'est ce qui permet à un modèle de
 * faire évoluer ses défauts sans figer d'anciennes valeurs dans les tracés enregistrés.
 *
 * `undefined` quand il n'y a aucun écart — le champ disparaît alors du projet plutôt que d'y
 * laisser un objet vide.
 */
export function modelParamOverrides(
  values: Readonly<Record<string, number>>,
  defaults: Readonly<Record<string, number>>,
): Record<string, number> | undefined {
  const overrides: Record<string, number> = {};
  for (const [id, value] of Object.entries(values)) {
    if (defaults[id] !== value) overrides[id] = value;
  }
  return Object.keys(overrides).length ? overrides : undefined;
}

/** §6 — libellé « dimensions » pour la liste des projets récents (ou `null` si non renseigné). */
export function formatRoomDimensions(widthMm?: number, heightMm?: number): string | null {
  if (widthMm && heightMm) return `${formatMetres(widthMm)} × ${formatMetres(heightMm)} m`;
  if (widthMm) return `Largeur ${formatMetres(widthMm)} m`;
  if (heightMm) return `Hauteur ${formatMetres(heightMm)} m`;
  return null;
}

export type TracingProjectSummary = {
  id: string;
  name: string;
  typeLabel: string;
  dimensionsLabel: string | null;
  modelLabel: string | null;
  startFromPhoto: boolean;
  updatedAt: string;
};

/** §6 — projection d'un `TracingProject` pour l'affichage « projets récents ». */
export function describeTracingProject(project: TracingProject): TracingProjectSummary {
  return {
    id: project.id,
    name: project.name,
    typeLabel: ouvrageLabel(project.type),
    dimensionsLabel: formatRoomDimensions(project.roomWidthMm, project.roomHeightMm),
    modelLabel: traceModelLabelFor(project.modelId),
    startFromPhoto: project.startFromPhoto === true,
    updatedAt: project.updatedAt,
  };
}

/**
 * TRACING-WORKSHOP-UI-V1 §5 — recherche dans les tracés enregistrés.
 *
 * Porte sur ce qui est affiché sur la carte : nom, type d'ouvrage, modèle, dimensions de
 * pièce. Accents et casse ignorés — sur un téléphone de chantier, « plafond sejour » doit
 * retrouver « Plafond séjour ». Une recherche vide ne filtre rien et renvoie la même liste.
 */
export function filterTracingProjects(
  summaries: readonly TracingProjectSummary[],
  query: string,
): readonly TracingProjectSummary[] {
  const needle = searchKey(query.trim());
  if (!needle) return summaries;
  return summaries.filter((summary) =>
    searchKey([summary.name, summary.typeLabel, summary.modelLabel ?? "", summary.dimensionsLabel ?? ""].join(" ")).includes(
      needle,
    ),
  );
}

/** Minuscules sans diacritiques combinants (U+0300–U+036F). */
function searchKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
