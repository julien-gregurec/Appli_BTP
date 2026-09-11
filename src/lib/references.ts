/**
 * Références internes de Gestion Pro — partie pure, sans base ni navigateur.
 *
 * La base fait foi (supabase/proposed/gp-v1-metier-references-internes.sql.proposed) : elle génère,
 * normalise, garantit l'unicité et journalise. Ce module sert l'écran : mêmes formats par défaut,
 * même nettoyage, même comparaison, et des messages lisibles quand la base refuse une référence.
 *
 * Vocabulaire (rapport lot A § 4.1, décision D3) — une colonne, un sens :
 *   reference_interne        référence de l'entreprise, stable, unique par nature d'objet ;
 *   numero                   numéro légal d'un document, immuable ;
 *   reference_fabricant      « référence fournisseur » au sens de la fiche article = celle du fabricant ;
 *   code_article_fournisseur code de l'article chez UN distributeur (un par fournisseur) ;
 *   reference_client         référence du dossier ou du bon de commande chez le client.
 */
import { normaliser } from "@/lib/devis/recherche-articles";

/** Natures d'objet dont la base génère la référence (miroir de `reference_parametre_defaut`). */
export const ENTITES_REFERENCE = ["client", "chantier", "fournisseur", "article", "ouvrage"] as const;
export type EntiteReference = (typeof ENTITES_REFERENCE)[number];

export type FormatReference = { prefixe: string; largeur: number; avecAnnee: boolean };

export const FORMATS_REFERENCE_DEFAUT: Record<EntiteReference, FormatReference> = {
  client: { prefixe: "CLI", largeur: 4, avecAnnee: false },
  chantier: { prefixe: "CHA", largeur: 3, avecAnnee: true },
  fournisseur: { prefixe: "FRN", largeur: 4, avecAnnee: false },
  article: { prefixe: "ART", largeur: 5, avecAnnee: false },
  ouvrage: { prefixe: "OUV", largeur: 4, avecAnnee: false },
};

export const LONGUEUR_MAX_REFERENCE = 120;
export const LARGEUR_MIN = 3;
export const LARGEUR_MAX = 8;

export const LIBELLES_REFERENCES = {
  reference_interne: "Réf. interne",
  numero: "N°",
  reference_fabricant: "Réf. fabricant",
  code_article_fournisseur: "Code fournisseur",
  reference_client: "Réf. client",
  reference_affaire: "Réf. affaire",
} as const;

const NOMS_ENTITES: Record<EntiteReference, string> = {
  client: "un autre client",
  chantier: "un autre chantier",
  fournisseur: "un autre fournisseur",
  article: "un autre article du catalogue",
  ouvrage: "un autre ouvrage",
};

/** Même règle que le déclencheur `trg_references_normalisees` : espaces retirés, vide = absent. */
export function nettoyerReference(valeur: string | null | undefined): string | null {
  const nette = (valeur ?? "").trim();
  return nette === "" ? null : nette;
}

/** Deux références désignent-elles la même chose pour l'unicité ? (casse, accents, séparateurs ignorés) */
export function memeReference(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliser(a);
  return na !== "" && na === normaliser(b);
}

export type ResultatReference = { ok: true; valeur: string | null } | { ok: false; erreur: string };

/** Valide une référence saisie avant envoi. `null` = laisser la base générer (si activé). */
export function validerReferenceSaisie(valeur: string | null | undefined): ResultatReference {
  const nette = nettoyerReference(valeur);
  if (nette === null) return { ok: true, valeur: null };
  if (nette.length > LONGUEUR_MAX_REFERENCE) {
    return { ok: false, erreur: `La référence dépasse ${LONGUEUR_MAX_REFERENCE} caractères.` };
  }
  if (normaliser(nette) === "") {
    return { ok: false, erreur: "La référence doit contenir au moins une lettre ou un chiffre." };
  }
  return { ok: true, valeur: nette };
}

export function validerFormat(format: FormatReference): string | null {
  if (!/^[A-Z0-9]{1,8}$/.test(format.prefixe)) {
    return "Le préfixe comporte de 1 à 8 lettres majuscules ou chiffres.";
  }
  if (!Number.isInteger(format.largeur) || format.largeur < LARGEUR_MIN || format.largeur > LARGEUR_MAX) {
    return `La numérotation comporte de ${LARGEUR_MIN} à ${LARGEUR_MAX} chiffres.`;
  }
  return null;
}

/** Rendu d'une référence générée — miroir de `next_reference` (aperçu dans les paramètres). */
export function formaterReference(format: FormatReference, numero: number, annee: number): string {
  const chiffres = String(Math.max(0, Math.trunc(numero))).padStart(format.largeur, "0");
  return format.avecAnnee ? `${format.prefixe}-${annee}-${chiffres}` : `${format.prefixe}-${chiffres}`;
}

const ENTITE_PAR_INDEX: Record<string, EntiteReference> = {
  clients_reference_interne_norm_uniq: "client",
  chantiers_reference_interne_norm_uniq: "chantier",
  fournisseurs_reference_norm_uniq: "fournisseur",
  prestations_catalogue_reference_interne_norm_uniq: "article",
  ouvrages_reference_interne_norm_uniq: "ouvrage",
};

type ErreurBase = { code?: string | null; message?: string | null; details?: string | null } | null | undefined;

/**
 * Message lisible pour un refus de la base portant sur une référence, ou `null` si l'erreur n'en
 * relève pas (l'appelant garde alors son message générique).
 */
export function messageErreurReference(erreur: ErreurBase): string | null {
  if (!erreur) return null;
  const texte = `${erreur.message ?? ""} ${erreur.details ?? ""}`;
  if (erreur.code === "23505") {
    if (texte.includes("articles_stock_reference_interne_norm_uniq")) {
      return "Cette référence interne est déjà portée par un autre article du stock.";
    }
    for (const [index, entite] of Object.entries(ENTITE_PAR_INDEX)) {
      if (texte.includes(index)) return `Cette référence est déjà utilisée par ${NOMS_ENTITES[entite]}.`;
    }
    if (texte.includes("catalogue_codes_fournisseurs")) {
      return "Ce distributeur a déjà un code pour cet article, ou l'article a déjà un distributeur principal.";
    }
  }
  if (erreur.code === "23514" && texte.includes("signifiante_check")) {
    return "La référence doit contenir au moins une lettre ou un chiffre.";
  }
  return null;
}
