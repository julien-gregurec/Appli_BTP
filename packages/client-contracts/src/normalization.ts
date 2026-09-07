/**
 * Normalisation — implémentation de référence.
 *
 * Ces fonctions sont l'**implémentation de référence** de la normalisation décrite au §12 de
 * `ELSATIA_CANONICAL_CLIENT_MODEL_AND_SEARCH_AUDIT_V1`. Quand la fonction SQL `normaliser()`
 * sera écrite (lot ultérieur, aucune migration ici), elle devra produire exactement la même
 * sortie sur les mêmes entrées : une asymétrie entre la normalisation d'indexation et celle de
 * la requête rend l'index inutile en silence.
 *
 * Choix repris de l'audit et à ne pas dévier :
 * - translittération explicite plutôt qu'`unaccent()` — `unaccent` est `STABLE`, donc
 *   inutilisable dans une colonne `GENERATED ALWAYS … STORED`, et n'est installée nulle part ;
 * - pas de similarité approximative : le trigram accélérera un `LIKE` exact sur la forme
 *   normalisée, il ne servira pas de moteur de ressemblance. Sur une facture, proposer
 *   « DUPONT » à qui a tapé « DUPOND » coûte cher.
 */

const ACCENT_SOURCE = "àâäáãåçèéêëìíîïñòóôöõøùúûüýÿ";
const ACCENT_TARGET = "aaaaaaceeeeiiiinoooooouuuuyy";

/** Ligatures, traitées avant la translittération caractère à caractère (1 → 2 caractères). */
const LIGATURES: readonly (readonly [string, string])[] = [
  ["œ", "oe"],
  ["æ", "ae"],
  ["ß", "ss"],
];

/** Ponctuation ramenée à un espace : `SAINT-DENIS` ≡ `SAINT DENIS`, `L'HÔPITAL` ≡ `L HOPITAL`. */
const PUNCTUATION_PATTERN = /['’`\-–—._,;:/\\()[\]{}#&+*"«»]/g;

/**
 * Forme normalisée servant à l'indexation **et** à la requête : minuscules, sans accent, sans
 * ponctuation, espaces réduits.
 */
export function normalizeSearchText(input: string | null | undefined): string {
  if (typeof input !== "string" || input.length === 0) return "";

  let text = input.toLowerCase();
  for (const [ligature, replacement] of LIGATURES) {
    text = text.split(ligature).join(replacement);
  }

  let transliterated = "";
  for (const character of text) {
    const index = ACCENT_SOURCE.indexOf(character);
    transliterated += index === -1 ? character : ACCENT_TARGET[index];
  }

  return transliterated.replace(PUNCTUATION_PATTERN, " ").replace(/\s+/g, " ").trim();
}

/** Ne conserve que les chiffres. Utilisé par le SIREN, le SIRET et le code postal. */
export function keepDigits(input: string | null | undefined): string {
  return typeof input === "string" ? input.replace(/\D/g, "") : "";
}

/**
 * Forme comparable d'un numéro de téléphone français : chiffres seuls, préfixe international
 * ramené au `0` national. `06 12 34 56 78`, `+33 6 12 34 56 78` et `06.12.34.56.78` donnent
 * tous `0612345678`. La valeur saisie par l'utilisateur, elle, reste intacte dans le contrat.
 *
 * Un numéro non français est conservé sous forme `+<indicatif><chiffres>` : le ramener à un `0`
 * national inventerait un plan de numérotation qui n'existe pas.
 */
export function normalizePhoneNumber(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const hasInternationalPrefix = trimmed.startsWith("+") || trimmed.startsWith("00");
  // `00` est le préfixe international écrit à la française : il désigne la même chose que `+`,
  // et le conserver ferait de `0033…` et `+33…` deux numéros différents.
  const digits = hasInternationalPrefix
    ? keepDigits(trimmed).replace(/^00/, "")
    : keepDigits(trimmed);
  if (digits.length === 0) return null;

  if (digits.startsWith("33") && hasInternationalPrefix) {
    const national = digits.slice(2);
    return national.length === 9 ? `0${national}` : `+${digits}`;
  }
  if (hasInternationalPrefix) return `+${digits}`;
  return digits;
}

/** Majuscules, sans espace ni ponctuation : `FR 40 303 265 045` → `FR40303265045`. */
export function normalizeVatNumber(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length === 0 ? null : normalized;
}

/** Majuscules, point retiré : `43.32A` → `4332A`. Le terme utilisateur subit le même sort. */
export function normalizeActivityCode(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length === 0 ? null : normalized;
}

/** Code postal comparable : chiffres seuls pour la France, alphanumérique majuscule ailleurs. */
export function normalizePostalCode(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.length === 0 ? null : normalized;
}

/** Adresse e-mail comparable : minuscules, espaces retirés. Aucun découpage de la partie locale. */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toLowerCase();
  return normalized.length === 0 ? null : normalized;
}

/** Nombre maximum de jetons retenus dans un terme de recherche (§13.2 de l'audit). */
export const SEARCH_MAX_TOKENS = 6;

/** Longueur minimale d'un jeton retenu : un caractère isolé n'est que du bruit. */
export const SEARCH_MIN_TOKEN_LENGTH = 2;

/**
 * Découpe un terme saisi en jetons normalisés. Sémantique : **ET entre les jetons, OU entre les
 * champs** — les champs étant concaténés dans un document unique, le OU est implicite.
 */
export function tokenizeSearchTerm(term: string | null | undefined): readonly string[] {
  const normalized = normalizeSearchText(term);
  if (normalized.length === 0) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length >= SEARCH_MIN_TOKEN_LENGTH)
    .slice(0, SEARCH_MAX_TOKENS);
}

/**
 * Assemble un document de recherche à partir de fragments hétérogènes. Chaque fragment est
 * normalisé isolément puis joint par un espace ; les vides disparaissent.
 */
export function buildSearchDocument(fragments: readonly (string | null | undefined)[]): string {
  return fragments
    .map((fragment) => normalizeSearchText(fragment))
    .filter((fragment) => fragment.length > 0)
    .join(" ");
}
