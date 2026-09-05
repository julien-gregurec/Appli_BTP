/**
 * §8 — Choix de modèle à la création d'un tracé.
 *
 * Ce lot NE reconstruit PAS le catalogue géométrique et n'importe AUCUN module de
 * `geometry/engine/**` ni `geometry/models/**` (encore en évolution dans une autre
 * conversation). On expose ici un contrat minimal et stable : une courte liste de
 * `modelId` (slugs) que le moteur géométrique résoudra plus tard.
 *
 * `TracingProject.modelId` reste optionnel : « Décider plus tard » est un choix valide.
 */

import type { TracingProjectType } from "./project";

export type AtelierModelOption = {
  /** Slug stable — voir `optionalModelId` dans project.ts (`^[a-z0-9][a-z0-9-]{0,39}$`). */
  modelId: string;
  label: string;
  description: string;
  /** Types d'ouvrage pour lesquels ce modèle est proposé en premier. */
  ouvrages: readonly TracingProjectType[];
};

const ALL_OUVRAGES: readonly TracingProjectType[] = ["ceiling", "wall", "niche", "arch", "other"];

export const ATELIER_MODEL_OPTIONS: readonly AtelierModelOption[] = [
  {
    modelId: "trace-libre",
    label: "Tracé libre",
    description: "Composer la géométrie à la main, sans modèle de départ.",
    ouvrages: ALL_OUVRAGES,
  },
  {
    modelId: "cercle-division",
    label: "Cercle divisé",
    description: "Un cercle directeur divisé en parts égales.",
    ouvrages: ["ceiling", "niche", "other"],
  },
  {
    modelId: "rosace",
    label: "Rosace",
    description: "Pétales répartis autour d'un centre.",
    ouvrages: ["ceiling", "niche", "wall"],
  },
  {
    modelId: "etoile",
    label: "Étoile",
    description: "Branches régulières à partir d'un rayon directeur.",
    ouvrages: ["ceiling", "wall", "other"],
  },
  {
    modelId: "arche-plein-cintre",
    label: "Arche plein cintre",
    description: "Demi-cercle sur deux naissances.",
    ouvrages: ["arch", "niche"],
  },
  {
    modelId: "ogive",
    label: "Ogive",
    description: "Arc brisé à deux centres.",
    ouvrages: ["arch", "niche"],
  },
  {
    modelId: "ellipse",
    label: "Ellipse",
    description: "Tracé elliptique par grand et petit axe.",
    ouvrages: ["ceiling", "arch", "niche"],
  },
];

const MODEL_BY_ID: ReadonlyMap<string, AtelierModelOption> = new Map(
  ATELIER_MODEL_OPTIONS.map((option) => [option.modelId, option]),
);

export function findAtelierModel(modelId: string | undefined | null): AtelierModelOption | undefined {
  if (!modelId) return undefined;
  return MODEL_BY_ID.get(modelId);
}

export function isKnownAtelierModel(modelId: string | undefined | null): boolean {
  return findAtelierModel(modelId) !== undefined;
}

/** Modèles à proposer pour un type d'ouvrage : les pertinents d'abord, puis le reste. */
export function atelierModelsForType(type: TracingProjectType): AtelierModelOption[] {
  const preferred = ATELIER_MODEL_OPTIONS.filter((option) => option.ouvrages.includes(type));
  const rest = ATELIER_MODEL_OPTIONS.filter((option) => !option.ouvrages.includes(type));
  return [...preferred, ...rest];
}
