/**
 * Registre versionné du module Conseils & Techniques.
 *
 * Source unique de vérité pour les fiches. Le contenu est embarqué dans le bundle :
 * il fonctionne hors ligne, sans réseau ni base de données.
 */
import { CONSEIL_FICHES_SOURCE } from "./content";
import { createConseilSearchIndex, searchConseils } from "./search";
import { filterConseils } from "./filters";
import type { ConseilFiche, ConseilFilter } from "./types";
import { validateConseilRegistry } from "./validate";

/** Version du schéma de contenu. À incrémenter lors d'un changement de structure de fiche. */
export const CONSEILS_CONTENT_VERSION = "1.1.0";

/** Fiches triées de façon déterministe (par titre, locale FR). */
export const CONSEIL_FICHES: readonly ConseilFiche[] = [...CONSEIL_FICHES_SOURCE].sort((a, b) =>
  a.title.localeCompare(b.title, "fr"),
);

/** Fiches publiées uniquement — vue par défaut de la preview. */
export const CONSEIL_FICHES_PUBLISHED: readonly ConseilFiche[] = CONSEIL_FICHES.filter(
  (fiche) => fiche.status === "published",
);

const BY_ID = new Map(CONSEIL_FICHES.map((fiche) => [fiche.id, fiche]));
const BY_SLUG = new Map(CONSEIL_FICHES.map((fiche) => [fiche.slug, fiche]));

export function getConseilById(id: string): ConseilFiche | undefined {
  return BY_ID.get(id);
}

export function getConseilBySlug(slug: string): ConseilFiche | undefined {
  return BY_SLUG.get(slug);
}

const SEARCH_INDEX = createConseilSearchIndex(CONSEIL_FICHES_PUBLISHED);

/** Recherche locale (titre, description, tags, catégorie, métier). Requête vide → tout. */
export function queryConseils(text: string): ConseilFiche[] {
  return searchConseils(SEARCH_INDEX, text);
}

/** Recherche + filtres combinés, dans cet ordre. */
export function browseConseils(text: string, filter: ConseilFilter): ConseilFiche[] {
  return filterConseils(queryConseils(text), filter);
}

/** Contrôle d'intégrité du registre (structure + unicité id/slug). */
export function assertConseilRegistryIntegrity(): void {
  const problems = validateConseilRegistry(CONSEIL_FICHES);
  if (problems.length > 0) {
    throw new Error(`Registre Conseils invalide :\n- ${problems.join("\n- ")}`);
  }
}
