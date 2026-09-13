/**
 * Numérotation des documents (GP V1) — miroir applicatif de la migration 20260913000294 : formats par
 * défaut, validation d'un réglage et mise en forme d'un aperçu. Le numéro réel est TOUJOURS attribué en
 * base (déclencheurs, compteur atomique) : ce module ne sert qu'à l'écran de réglages.
 */
export const TYPES_DOCUMENT_NUMEROTES = ["devis", "facture", "avoir", "commande"] as const;
export type TypeDocumentNumerote = (typeof TYPES_DOCUMENT_NUMEROTES)[number];

export const LIBELLES_TYPES_DOCUMENT: Record<TypeDocumentNumerote, string> = {
  devis: "Devis",
  facture: "Factures",
  avoir: "Avoirs",
  commande: "Commandes fournisseurs",
};

export const SEPARATEURS = [
  { cle: "-", libelle: "Tiret (-)" },
  { cle: "/", libelle: "Barre oblique (/)" },
  { cle: "", libelle: "Aucun" },
] as const;
export type Separateur = (typeof SEPARATEURS)[number]["cle"];

export type FormatNumerotation = {
  prefixe: string;
  avecAnnee: boolean;
  avecMois: boolean;
  separateur: Separateur;
  largeur: number;
  compteurAnnuel: boolean;
};

export const LARGEUR_MIN = 1;
export const LARGEUR_MAX = 8;

/** Format historique (identique aux déclencheurs d'origine). */
export function formatParDefaut(type: TypeDocumentNumerote): FormatNumerotation {
  return {
    prefixe: type === "devis" ? "DEV" : type === "commande" ? "CMD" : "FAC",
    avecAnnee: true,
    avecMois: false,
    separateur: "-",
    largeur: 3,
    compteurAnnuel: type === "commande",
  };
}

/** Motif de refus, ou `null` si le réglage est acceptable (mêmes règles que les contraintes de la base). */
export function validerFormatNumerotation(f: FormatNumerotation): string | null {
  if (!/^[A-Z0-9]{0,8}$/.test(f.prefixe)) return "Le préfixe est facultatif ; s'il est renseigné : 1 à 8 lettres majuscules ou chiffres, sans espace.";
  if (!Number.isInteger(f.largeur) || f.largeur < LARGEUR_MIN || f.largeur > LARGEUR_MAX) return `Le compteur compte de ${LARGEUR_MIN} à ${LARGEUR_MAX} chiffres.`;
  if (!SEPARATEURS.some((s) => s.cle === f.separateur)) return "Séparateur inconnu.";
  if (f.compteurAnnuel && !f.avecAnnee) return "Un compteur remis à zéro chaque année exige l'année dans le numéro (sinon deux années produiraient le même numéro).";
  if (!f.prefixe && !f.avecAnnee && !f.avecMois && f.largeur < 3) return "Sans préfixe ni année, prévoyez au moins 3 chiffres pour rester lisible.";
  return null;
}

/** Aperçu « DEV-2026-00152 » : mêmes règles que `formater_numero_document` en base. */
export function formaterNumero(f: FormatNumerotation, numero: number, date = new Date()): string {
  const parts = [
    f.prefixe || null,
    f.avecAnnee ? String(date.getFullYear()) : null,
    f.avecMois ? String(date.getMonth() + 1).padStart(2, "0") : null,
    String(Math.max(1, Math.trunc(numero))).padStart(Math.max(1, f.largeur), "0"),
  ].filter((p): p is string => p !== null);
  return parts.join(f.separateur);
}

/** Lecture indulgente d'une ligne de `numerotation_documents`. */
export function lireFormat(type: TypeDocumentNumerote, ligne: Partial<{ prefixe: string | null; avec_annee: boolean | null; avec_mois: boolean | null; separateur: string | null; largeur: number | null; compteur_annuel: boolean | null }> | null | undefined): FormatNumerotation {
  const d = formatParDefaut(type);
  if (!ligne) return d;
  const sep = SEPARATEURS.some((s) => s.cle === ligne.separateur) ? (ligne.separateur as Separateur) : d.separateur;
  return {
    prefixe: typeof ligne.prefixe === "string" ? ligne.prefixe : d.prefixe,
    avecAnnee: ligne.avec_annee ?? d.avecAnnee,
    avecMois: ligne.avec_mois ?? d.avecMois,
    separateur: sep,
    largeur: typeof ligne.largeur === "number" ? ligne.largeur : d.largeur,
    compteurAnnuel: ligne.compteur_annuel ?? d.compteurAnnuel,
  };
}
