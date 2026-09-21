/**
 * TRACING-WORKSHOP-UI-V1 §5/§7 — bibliothèque visuelle des modèles ELSATIA.
 *
 * Module PUR. Il ne définit aucun modèle et n'en décrit aucun de son côté : il PROJETTE le
 * registre géométrique réel (`geometry/models/catalog.ts`) et la géométrie que ces modèles
 * produisent. Libellé, paramètres, difficulté, tags, nombre d'étapes et de cotes viennent
 * tous du moteur ; la seule information ajoutée est celle que `atelier-models.ts` publie déjà
 * (courte description, affinité avec un type d'ouvrage).
 *
 * Les familles de la consigne (Rosaces, Floral, Spirales, Étoiles, Arches…) ne sont pas une
 * taxonomie inventée ici : chacune est un PRÉDICAT sur les tags réellement publiés par les
 * modèles. Une famille sans aucun modèle n'est jamais proposée — un filtre qui ne ramène
 * rien n'a pas sa place dans une bibliothèque. C'est pourquoi « LED » et « Personnalisé »,
 * cités par la consigne, sont absents : rien dans le registre ne les alimente aujourd'hui.
 */

import {
  TRACE_MODEL_CATALOG,
  TRACE_MODEL_SLUGS,
  traceModelDefaults,
  type TraceModelSlug,
} from "../../../lib/geometry/models/catalog";
import type { TraceModel, TraceParameter } from "../../../lib/geometry/trace-model";
import { ATELIER_MODEL_OPTIONS } from "../../../lib/tracing/atelier-models";
import { TRACING_OUVRAGE_LABELS, TRACING_OUVRAGE_ORDER } from "../../../lib/tracing/atelier";
import type { TracingProjectType } from "../../../lib/tracing/project";

export type LibraryFamilyId =
  | "tous"
  | "geometrique"
  | "rosaces"
  | "floral"
  | "etoiles"
  | "spirales"
  | "arches"
  | "courbes";

type FamilyDefinition = { id: LibraryFamilyId; label: string; matches: (entry: LibraryEntry) => boolean };

export type LibraryEntry = {
  slug: TraceModelSlug;
  label: string;
  description: string;
  /** Famille du registre : « fondamentaux » ou « decoratifs ». */
  group: string;
  difficulty: TraceModel["difficulty"];
  tags: readonly string[];
  ouvrages: readonly TracingProjectType[];
  parameters: readonly TraceParameter[];
  stepCount: number;
  dimensionCount: number;
  /** Géométrie aux valeurs par défaut, pour l'aperçu vectoriel (§7). */
  model: TraceModel;
};

const PRESENTATION = new Map(ATELIER_MODEL_OPTIONS.map((option) => [option.modelId, option]));

function hasTag(entry: LibraryEntry, ...tags: readonly string[]): boolean {
  return entry.tags.some((tag) => tags.includes(tag));
}

const FAMILIES: readonly FamilyDefinition[] = [
  { id: "tous", label: "Tous", matches: () => true },
  { id: "geometrique", label: "Géométrique", matches: (entry) => entry.group === "fondamentaux" },
  { id: "rosaces", label: "Rosaces", matches: (entry) => hasTag(entry, "rosace") },
  { id: "floral", label: "Floral", matches: (entry) => hasTag(entry, "fleur") },
  { id: "etoiles", label: "Étoiles", matches: (entry) => hasTag(entry, "étoile") },
  { id: "spirales", label: "Spirales", matches: (entry) => hasTag(entry, "spirale") },
  { id: "arches", label: "Arches", matches: (entry) => hasTag(entry, "arche", "ogive") },
  { id: "courbes", label: "Courbes", matches: (entry) => hasTag(entry, "courbe", "ellipse", "doucine", "ogee") },
];

/**
 * Construit la bibliothèque : chaque modèle est généré une fois à ses valeurs par défaut.
 * Un modèle dont le générateur refuse ses propres défauts est ÉCARTÉ plutôt que présenté
 * sans aperçu — on ne propose pas dans une bibliothèque ce qu'on ne sait pas dessiner.
 */
export function buildTraceLibrary(): readonly LibraryEntry[] {
  const entries: LibraryEntry[] = [];
  for (const slug of TRACE_MODEL_SLUGS) {
    const descriptor = TRACE_MODEL_CATALOG[slug];
    let model: TraceModel;
    try {
      model = descriptor.build(traceModelDefaults(descriptor));
    } catch {
      continue;
    }
    const presentation = PRESENTATION.get(slug);
    entries.push({
      slug,
      label: descriptor.label,
      description: presentation?.description ?? "",
      group: descriptor.group,
      difficulty: model.difficulty,
      tags: model.tags,
      ouvrages: presentation?.ouvrages ?? [],
      parameters: descriptor.parameters,
      stepCount: model.steps.length,
      dimensionCount: model.dimensions.length,
      model,
    });
  }
  return entries;
}

/** Familles réellement peuplées, « Tous » en tête. Une famille vide n'est pas proposée. */
export function libraryFamilies(entries: readonly LibraryEntry[]): readonly { id: LibraryFamilyId; label: string; count: number }[] {
  return FAMILIES.map((family) => ({
    id: family.id,
    label: family.label,
    count: entries.filter(family.matches).length,
  })).filter((family) => family.count > 0);
}

/** Types d'ouvrage réellement revendiqués par au moins un modèle (§5). */
export function libraryOuvrages(entries: readonly LibraryEntry[]): readonly { id: TracingProjectType; label: string; count: number }[] {
  return TRACING_OUVRAGE_ORDER.map((type) => ({
    id: type,
    label: TRACING_OUVRAGE_LABELS[type],
    count: entries.filter((entry) => entry.ouvrages.includes(type)).length,
  })).filter((ouvrage) => ouvrage.count > 0);
}

function normalise(text: string): string {
  // Diacritiques combinants (U+0300–U+036F) retirés après décomposition : « étoile » et
  // « etoile » doivent ramener la même chose, comme on tape sur un clavier de chantier.
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type LibraryFilter = {
  query?: string;
  family?: LibraryFamilyId;
  ouvrage?: TracingProjectType | null;
};

/**
 * Filtre la bibliothèque. La recherche porte sur le libellé, la description et les tags,
 * accents et casse ignorés — « rosace » doit trouver « Rosace 6 pétales » comme « ROSACES ».
 */
export function filterLibrary(entries: readonly LibraryEntry[], filter: LibraryFilter): readonly LibraryEntry[] {
  const family = FAMILIES.find((item) => item.id === (filter.family ?? "tous")) ?? FAMILIES[0];
  const needle = normalise(filter.query?.trim() ?? "");

  return entries.filter((entry) => {
    if (!family.matches(entry)) return false;
    if (filter.ouvrage && !entry.ouvrages.includes(filter.ouvrage)) return false;
    if (!needle) return true;
    const haystack = normalise([entry.label, entry.description, ...entry.tags].join(" "));
    return haystack.includes(needle);
  });
}

export const DIFFICULTY_LABELS: Readonly<Record<TraceModel["difficulty"], string>> = {
  easy: "Simple",
  intermediate: "Intermédiaire",
  advanced: "Confirmé",
};

/**
 * Paramètres mis en avant sur une carte (§7) : les premiers publiés par le modèle, dans son
 * ordre. Le modèle décide de ce qui compte — pas la carte.
 */
export function headlineParameters(entry: LibraryEntry, count = 3): readonly TraceParameter[] {
  return entry.parameters.slice(0, count);
}
