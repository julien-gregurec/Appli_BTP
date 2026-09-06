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
  tracingProjectMode,
  type TracingProject,
  type TracingProjectMode,
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

/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 — surcharges à conserver quand l'utilisateur (re)choisit
 * un modèle.
 *
 * Changer de modèle invalide les surcharges de l'ancien : `{ diameter: 2400 }` ne veut rien
 * dire sur une ogive, et le résolveur les signalerait comme paramètres inconnus. Elles sont
 * donc abandonnées.
 *
 * Re-choisir le MÊME modèle, en revanche, doit les conserver. Ce n'est pas un cas de bord :
 * la reprise d'un tracé enregistré repose l'utilisateur sur l'étape « modèle » avec son
 * modèle déjà sélectionné, et le geste naturel pour continuer est de le re-toucher. Effacer
 * les réglages à cet instant perdrait silencieusement le travail enregistré — exactement ce
 * que l'autosave existe pour empêcher.
 */
export function modelParamsAfterModelChoice(
  project: Pick<TracingProject, "modelId" | "modelParams">,
  nextModelId: string | null | undefined,
): Record<string, number> | undefined {
  const sameModel = (project.modelId ?? null) === (nextModelId ?? null);
  return sameModel ? project.modelParams : undefined;
}

export type TracingProjectPatch = Partial<
  Pick<
    TracingProject,
    "name" | "roomWidthMm" | "roomHeightMm" | "modelId" | "modelParams" | "freeGeometry" | "startFromPhoto"
  >
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
  /**
   * FREE-DRAWING §2 — mode réel du tracé, DÉDUIT de ce que le projet porte (jamais stocké).
   * La liste doit le montrer : « Reprendre » ne mène pas au même écran selon le mode, et un
   * tracé libre qui apparaîtrait « sans modèle » ferait croire à un projet resté vide.
   */
  mode: TracingProjectMode;
  modeLabel: string | null;
  startFromPhoto: boolean;
  updatedAt: string;
};

const MODE_LABELS: Readonly<Record<TracingProjectMode, string | null>> = {
  parametric: null,
  free: "TRACÉ LIBRE",
  // « Sans modèle » n'a rien d'anormal — c'est « décider plus tard » — et n'a pas à être
  // signalé comme un manque dans une liste.
  undecided: null,
};

/** §6 — projection d'un `TracingProject` pour l'affichage « projets récents ». */
export function describeTracingProject(project: TracingProject): TracingProjectSummary {
  const mode = tracingProjectMode(project);
  return {
    id: project.id,
    name: project.name,
    typeLabel: ouvrageLabel(project.type),
    dimensionsLabel: formatRoomDimensions(project.roomWidthMm, project.roomHeightMm),
    modelLabel: traceModelLabelFor(project.modelId),
    mode,
    modeLabel: MODE_LABELS[mode],
    startFromPhoto: project.startFromPhoto === true,
    updatedAt: project.updatedAt,
  };
}
