/**
 * §8 — Choix de modèle à la création d'un tracé.
 *
 * ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §3 : ce fichier ne définit PLUS sa propre liste de
 * slugs. Il projette le registre géométrique réel (`geometry/models/catalog.ts`, 13 modèles
 * sur Engine B) vers le vocabulaire de l'assistant « nouveau tracé ». Le `modelId` retenu
 * est donc, par construction, un slug que `model-resolver.ts` sait résoudre.
 *
 * Ce fichier n'ajoute que de l'information produit qui n'a pas sa place dans le moteur :
 * une courte description et l'affinité avec un type d'ouvrage. Aucun paramètre, aucun
 * défaut, aucune géométrie — tout cela reste publié par le modèle lui-même (§4).
 *
 * `TracingProject.modelId` reste optionnel : « Décider plus tard » est un choix valide.
 */

import { TRACE_MODEL_CATALOG, TRACE_MODEL_SLUGS, type TraceModelSlug } from "../geometry/models/catalog";
import type { TracingProjectType } from "./project";

export type AtelierModelOption = {
  /** Slug du registre — voir `optionalModelId` dans project.ts (`^[a-z0-9][a-z0-9-]{0,39}$`). */
  modelId: TraceModelSlug;
  label: string;
  description: string;
  /** Types d'ouvrage pour lesquels ce modèle est proposé en premier. */
  ouvrages: readonly TracingProjectType[];
};

/** Information purement produit, indexée sur les slugs du registre. */
const PRESENTATION: Readonly<Record<TraceModelSlug, { description: string; ouvrages: readonly TracingProjectType[] }>> = {
  "circle-division": { description: "Un cercle directeur divisé en parts égales.", ouvrages: ["ceiling", "niche", "other"] },
  "star-5": { description: "Branches régulières à partir d'un rayon directeur.", ouvrages: ["ceiling", "wall", "other"] },
  "rosette-6": { description: "Six pétales répartis autour d'un centre.", ouvrages: ["ceiling", "niche", "wall"] },
  heart: { description: "Deux lobes et une pointe, sur largeur et hauteur données.", ouvrages: ["wall", "other"] },
  "arch-full-round": { description: "Demi-cercle sur deux naissances.", ouvrages: ["arch", "niche"] },
  "ogive-equilateral": { description: "Arc brisé à deux centres.", ouvrages: ["arch", "niche"] },
  "ellipse-pedagogical": { description: "Tracé elliptique par grand et petit axe, méthode des foyers.", ouvrages: ["ceiling", "arch", "niche"] },
  "spiral-archimedes": { description: "Spirale à pas constant, du rayon de départ au rayon final.", ouvrages: ["ceiling", "wall", "other"] },
  "flower-4": { description: "Quatre pétales inscrits dans un cercle directeur.", ouvrages: ["ceiling", "wall", "niche"] },
  "flower-5": { description: "Cinq pétales inscrits dans un cercle directeur.", ouvrages: ["ceiling", "wall", "niche"] },
  "flower-6-elongated": { description: "Six pétales allongés autour d'un centre.", ouvrages: ["ceiling", "wall", "niche"] },
  turbine: { description: "Rosace tournante : branches décalées d'un angle constant.", ouvrages: ["ceiling", "other"] },
  "double-s": { description: "Composition de deux S opposés, largeur et bombement réglables.", ouvrages: ["wall", "other"] },
};

export const ATELIER_MODEL_OPTIONS: readonly AtelierModelOption[] = TRACE_MODEL_SLUGS.map((slug) => ({
  modelId: slug,
  label: TRACE_MODEL_CATALOG[slug].label,
  description: PRESENTATION[slug].description,
  ouvrages: PRESENTATION[slug].ouvrages,
}));

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
