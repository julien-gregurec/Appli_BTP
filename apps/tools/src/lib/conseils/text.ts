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

/**
 * Met en forme une durée indicative de fiche (minutes) : « 25 min », « 1 h », « 1 h 30 ».
 * Purement présentationnelle — aucune promesse de délai.
 */
export function formatEstimatedDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) return "—";
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}
