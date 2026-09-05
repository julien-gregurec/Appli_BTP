import { getConseilCategory } from "./categories";
import { normalizeText, tokenize } from "./text";
import type { ConseilFiche } from "./types";

/**
 * Index de recherche pré-normalisé pour une fiche. Construit une seule fois au
 * chargement du registre : la recherche reste purement locale et hors ligne.
 */
type SearchDoc = {
  fiche: ConseilFiche;
  title: string;
  description: string;
  tags: string;
  category: string;
  trades: string;
  haystack: string;
};

function buildDoc(fiche: ConseilFiche): SearchDoc {
  const category = getConseilCategory(fiche.category);
  const title = normalizeText(fiche.title);
  const description = normalizeText(fiche.shortDescription);
  const tags = fiche.tags.map(normalizeText).join(" ");
  const categoryText = `${normalizeText(category.name)} ${fiche.category}`;
  const trades = fiche.trades.map(normalizeText).join(" ");
  return {
    fiche,
    title,
    description,
    tags,
    category: categoryText,
    trades,
    haystack: [title, description, tags, categoryText, trades, normalizeText(fiche.subcategory ?? "")]
      .filter(Boolean)
      .join(" "),
  };
}

export function createConseilSearchIndex(fiches: readonly ConseilFiche[]): SearchDoc[] {
  return fiches.map(buildDoc);
}

/** Score simple : titre > tags > catégorie/métier > description. 0 = aucune correspondance. */
function scoreDoc(doc: SearchDoc, tokens: readonly string[]): number {
  let score = 0;
  for (const token of tokens) {
    if (!doc.haystack.includes(token)) return 0; // tous les jetons doivent apparaître
    if (doc.title.includes(token)) score += 8;
    if (doc.tags.includes(token)) score += 4;
    if (doc.category.includes(token) || doc.trades.includes(token)) score += 3;
    if (doc.description.includes(token)) score += 2;
  }
  return score;
}

/**
 * Recherche locale sur titre, description, tags, catégorie et métier.
 * Insensible à la casse et aux accents. Requête vide → toutes les fiches (ordre d'origine).
 */
export function searchConseils(
  index: readonly SearchDoc[],
  query: string,
): ConseilFiche[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return index.map((doc) => doc.fiche);
  return index
    .map((doc) => ({ doc, score: scoreDoc(doc, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.fiche.title.localeCompare(b.doc.fiche.title, "fr"))
    .map((entry) => entry.doc.fiche);
}
