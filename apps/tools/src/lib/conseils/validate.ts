import {
  CONSEIL_CATEGORY_IDS,
  CONSEIL_DIFFICULTIES,
  CONSEIL_MEDIA_ORIGINS,
  CONSEIL_MEDIA_TYPES,
  CONSEIL_STATUSES,
  CONSEIL_TRADE_IDS,
  type ConseilFiche,
} from "./types";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isIsoDate(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

/**
 * Valide une fiche isolément. Retourne la liste des problèmes (vide = fiche valide).
 * Ne dépend d'aucun réseau : contrôle de structure uniquement.
 */
export function validateConseilFiche(fiche: ConseilFiche): string[] {
  const problems: string[] = [];
  const ref = fiche?.slug || fiche?.id || "(fiche inconnue)";
  const add = (message: string) => problems.push(`[${ref}] ${message}`);

  if (!fiche || typeof fiche !== "object") return ["Fiche absente ou invalide."];

  if (!fiche.id || typeof fiche.id !== "string") add("id manquant.");
  if (!fiche.slug || !SLUG_PATTERN.test(fiche.slug)) add("slug invalide (attendu kebab-case).");
  if (!fiche.title || fiche.title.trim().length < 4) add("title trop court.");
  if (!fiche.shortDescription || fiche.shortDescription.trim().length < 10) {
    add("shortDescription trop courte.");
  }
  if (!CONSEIL_CATEGORY_IDS.includes(fiche.category)) add(`category inconnue : ${fiche.category}.`);
  if (!Array.isArray(fiche.trades) || fiche.trades.length === 0) {
    add("trades doit contenir au moins un métier.");
  } else {
    for (const trade of fiche.trades) {
      if (!CONSEIL_TRADE_IDS.includes(trade)) add(`métier inconnu : ${trade}.`);
    }
  }
  if (!Array.isArray(fiche.tags) || fiche.tags.length === 0) add("tags vide.");
  if (!CONSEIL_DIFFICULTIES.includes(fiche.difficulty)) {
    add(`difficulty inconnue : ${fiche.difficulty}.`);
  }
  if (!Array.isArray(fiche.steps) || fiche.steps.length === 0) {
    add("steps doit contenir au moins une étape.");
  } else {
    fiche.steps.forEach((step, i) => {
      if (!step || !step.title || step.title.trim().length === 0) add(`steps[${i}].title manquant.`);
      if (!step || !step.text || step.text.trim().length < 4) add(`steps[${i}].text trop court.`);
    });
  }
  for (const key of ["materials", "preparation", "tips", "commonErrors", "finalCheck", "warnings"] as const) {
    if (!Array.isArray(fiche[key])) add(`${key} doit être un tableau.`);
  }
  if (fiche.finalCheck.length === 0) add("finalCheck ne doit pas être vide.");
  if (!Array.isArray(fiche.relatedToolIds)) add("relatedToolIds doit être un tableau.");
  if (!Array.isArray(fiche.relatedTraceIds)) add("relatedTraceIds doit être un tableau.");
  if (!Array.isArray(fiche.media)) {
    add("media doit être un tableau.");
  } else {
    fiche.media.forEach((media, i) => {
      if (!CONSEIL_MEDIA_TYPES.includes(media.type)) add(`media[${i}].type inconnu : ${media.type}.`);
      if (!media.src) add(`media[${i}].src manquant.`);
      if (!media.alt || media.alt.trim().length === 0) add(`media[${i}].alt manquant.`);
      if (media.source && !CONSEIL_MEDIA_ORIGINS.includes(media.source.origin)) {
        add(`media[${i}].source.origin doit rester interne (${CONSEIL_MEDIA_ORIGINS.join(" | ")}).`);
      }
    });
  }
  if (!Number.isInteger(fiche.version) || fiche.version < 1) add("version doit être un entier >= 1.");
  if (!CONSEIL_STATUSES.includes(fiche.status)) add(`status inconnu : ${fiche.status}.`);
  if (!isIsoDate(fiche.createdAt)) add("createdAt n'est pas une date ISO.");
  if (!isIsoDate(fiche.updatedAt)) add("updatedAt n'est pas une date ISO.");
  if (isIsoDate(fiche.createdAt) && isIsoDate(fiche.updatedAt)) {
    if (Date.parse(fiche.updatedAt) < Date.parse(fiche.createdAt)) {
      add("updatedAt antérieure à createdAt.");
    }
  }

  return problems;
}

/**
 * Valide un ensemble de fiches et détecte les collisions d'id / de slug.
 * Retourne la liste complète des problèmes (vide = registre sain).
 */
export function validateConseilRegistry(fiches: readonly ConseilFiche[]): string[] {
  const problems: string[] = [];
  for (const fiche of fiches) problems.push(...validateConseilFiche(fiche));

  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  for (const fiche of fiches) {
    if (seenIds.has(fiche.id)) problems.push(`id dupliqué : ${fiche.id}.`);
    seenIds.add(fiche.id);
    if (seenSlugs.has(fiche.slug)) problems.push(`slug dupliqué : ${fiche.slug}.`);
    seenSlugs.add(fiche.slug);
  }

  return problems;
}
