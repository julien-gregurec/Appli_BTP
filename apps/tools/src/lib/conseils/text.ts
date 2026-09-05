/**
 * Normalisation de texte pour la recherche locale : insensible à la casse et aux
 * accents. Aucune dépendance externe.
 */
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const APOSTROPHES = /[’'`]/g;

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(APOSTROPHES, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Découpe une requête en jetons normalisés non vides. */
export function tokenize(query: string): string[] {
  const normalized = normalizeText(query);
  return normalized.length === 0 ? [] : normalized.split(" ");
}
