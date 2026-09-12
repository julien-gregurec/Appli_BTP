/**
 * Types de lignes d'un devis en grille (GP V1, lot C) — module PUR.
 *
 * Distinct de la NATURE d'une ligne chiffrée (`LigneLibre.type` : main-d'œuvre, fourniture…), qui
 * sert aux exports comptables. Le type de ligne dit ce que la ligne EST dans le document :
 * chiffrée (article, prestation libre), structurante (titre, sous-titre), texte (commentaire),
 * calculée (sous-total), remise, ou mise en page (vide, séparateur, saut de page).
 *
 * Règle centrale, tenue par la base (contrainte) et par l'écran : une ligne non chiffrée porte
 * quantité 0, prix 0 et remise 0. Les totaux SQL (`recalc_totaux_devis`) restent donc justes sans
 * connaître les types ; un sous-total est toujours calculé, jamais enregistré comme montant.
 */

export const TYPES_LIGNE_GRILLE = [
  { cle: "article", libelle: "Article", court: "Art.", aide: "Article ou prestation issu du catalogue", chiffree: true },
  { cle: "libre", libelle: "Prestation libre", court: "Libre", aide: "Ligne chiffrée saisie librement", chiffree: true },
  { cle: "titre", libelle: "Titre", court: "Titre", aide: "Titre de section, sans montant", chiffree: false },
  { cle: "sous_titre", libelle: "Sous-titre", court: "S-titre", aide: "Sous-titre de section, sans montant", chiffree: false },
  { cle: "commentaire", libelle: "Commentaire", court: "Comm.", aide: "Texte imprimé pour le client, sans montant", chiffree: false },
  { cle: "sous_total", libelle: "Sous-total", court: "S-total", aide: "Somme des lignes depuis le sous-total précédent — calculée, jamais saisie", chiffree: false },
  { cle: "remise", libelle: "Remise", court: "Remise", aide: "Montant négatif : en pourcentage de la section, ou fixe", chiffree: false },
  { cle: "vide", libelle: "Ligne vide", court: "Vide", aide: "Espace dans le document", chiffree: false },
  { cle: "separateur", libelle: "Séparateur", court: "Sép.", aide: "Trait horizontal", chiffree: false },
  { cle: "saut_page", libelle: "Saut de page", court: "Page", aide: "Force une nouvelle page à l'impression", chiffree: false },
] as const;

export type TypeLigneGrille = (typeof TYPES_LIGNE_GRILLE)[number]["cle"];

export const TYPE_LIGNE_DEFAUT: TypeLigneGrille = "libre";

const PAR_CLE = new Map(TYPES_LIGNE_GRILLE.map((t) => [t.cle, t]));

export function libelleTypeLigne(type: TypeLigneGrille | null | undefined): string {
  return PAR_CLE.get(type ?? TYPE_LIGNE_DEFAUT)?.libelle ?? String(type);
}

export function estTypeLigne(v: unknown): v is TypeLigneGrille {
  return typeof v === "string" && PAR_CLE.has(v as TypeLigneGrille);
}

/** Type effectif d'une ligne qui n'en déclare pas : les données historiques sont chiffrées. */
export function typeDe(l: { typeLigne?: TypeLigneGrille | null }): TypeLigneGrille {
  return l.typeLigne ?? TYPE_LIGNE_DEFAUT;
}

/** Article ou prestation libre : entre dans les totaux avec quantité × prix. */
export function estChiffree(type: TypeLigneGrille): boolean {
  return type === "article" || type === "libre";
}

/** Porte un montant dans les totaux : ligne chiffrée, ou remise (montant négatif). */
export function porteMontant(type: TypeLigneGrille): boolean {
  return estChiffree(type) || type === "remise";
}

/** Une désignation est exigée, sauf pour les lignes de pure mise en page. */
export function exigeDesignation(type: TypeLigneGrille): boolean {
  return type !== "vide" && type !== "separateur" && type !== "saut_page";
}

/** Se saisit dans la grille (une ligne de mise en page n'a aucune cellule modifiable). */
export function estSaisissable(type: TypeLigneGrille): boolean {
  return exigeDesignation(type);
}

export type ChampLigne =
  | "designation" | "description" | "type" | "quantite" | "unite" | "prixUnitaireHt" | "remiseLignePct" | "tauxTva"
  | "remiseSectionPct" | "commentaireInterne";

const CHAMPS_CHIFFREE: readonly ChampLigne[] = ["designation", "description", "type", "quantite", "unite", "prixUnitaireHt", "remiseLignePct", "tauxTva", "commentaireInterne"];
const CHAMPS_TEXTE: readonly ChampLigne[] = ["designation", "description", "commentaireInterne"];
const CHAMPS_PAR_TYPE: Record<TypeLigneGrille, readonly ChampLigne[]> = {
  article: CHAMPS_CHIFFREE,
  libre: CHAMPS_CHIFFREE,
  titre: CHAMPS_TEXTE,
  sous_titre: CHAMPS_TEXTE,
  commentaire: CHAMPS_TEXTE,
  sous_total: ["designation", "commentaireInterne"],
  remise: ["designation", "prixUnitaireHt", "remiseSectionPct", "tauxTva", "commentaireInterne"],
  vide: [],
  separateur: [],
  saut_page: [],
};

export function champModifiable(type: TypeLigneGrille, champ: ChampLigne): boolean {
  return CHAMPS_PAR_TYPE[type].includes(champ);
}

export const DESIGNATION_PAR_DEFAUT: Partial<Record<TypeLigneGrille, string>> = {
  sous_total: "Sous-total",
  remise: "Remise",
};

/**
 * Valeurs numériques imposées par le type — la même règle que la contrainte SQL :
 * non chiffrée → 0 / 0 / 0 ; remise → quantité 1, prix ≤ 0, remise de ligne 0.
 */
export function normaliserSelonType<L extends {
  typeLigne?: TypeLigneGrille | null; designation: string; quantite: number; prixUnitaireHt: number; remiseLignePct: number;
  remiseSectionPct?: number | null;
}>(ligne: L): L {
  const type = typeDe(ligne);
  if (estChiffree(type)) return { ...ligne, remiseSectionPct: null };
  if (type === "remise") {
    return {
      ...ligne,
      designation: ligne.designation || DESIGNATION_PAR_DEFAUT.remise!,
      quantite: 1,
      prixUnitaireHt: Math.min(0, Number.isFinite(ligne.prixUnitaireHt) ? ligne.prixUnitaireHt : 0),
      remiseLignePct: 0,
    };
  }
  return {
    ...ligne,
    designation: exigeDesignation(type) ? (ligne.designation || DESIGNATION_PAR_DEFAUT[type] || "") : "",
    quantite: 0,
    prixUnitaireHt: 0,
    remiseLignePct: 0,
    remiseSectionPct: null,
  };
}
