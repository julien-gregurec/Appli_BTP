/**
 * Finition d'un seau de peinture.
 *
 * ### Ce que la finition est
 *
 * La finition — mat, satiné, brillant, texturé — est une caractéristique du
 * produit, pas de la couleur. Elle figure sur l'étiquette, et c'est de là
 * qu'elle vient : elle est **déclarée** par la personne qui saisit la fiche, ou
 * lue sur l'étiquette. Deux seaux de teinte identique et de finition différente
 * sont deux produits différents et ne se remplacent pas : sans ce champ, un
 * inventaire de peinture reste inexploitable pour préparer un chantier.
 *
 * ### Ce que la finition n'est pas
 *
 * Elle n'est jamais estimée depuis une photographie. Le brillant apparent d'une
 * surface sur une image dépend de l'angle de prise de vue, de l'éclairage et du
 * traitement de l'appareil : une photo ne permet pas de conclure, et Colors ne
 * prétendra pas le contraire. `indetermine` est donc une valeur de plein droit,
 * pas un échec — c'est l'état honnête d'un seau dont personne n'a lu
 * l'étiquette.
 *
 * ### Écriture
 *
 * La colonne `colors_seaux.finition` existe depuis la migration
 * `20260909000281` (V1.5). Elle n'est écrite que par la RPC
 * `colors_definir_finition` : `colors_valider_seau` refuse toute mutation dont
 * l'appelant n'est pas `postgres`, ce qui ferme toute autre voie, y compris
 * depuis la clé de service.
 */

export const FINITIONS = ["mat", "satine", "brillant", "texture", "indetermine"] as const;
export type FinitionColors = (typeof FINITIONS)[number];

export const FINITION_PAR_DEFAUT: FinitionColors = "indetermine";

export const LIBELLES_FINITION: Record<FinitionColors, string> = {
  mat: "Mat",
  satine: "Satiné",
  brillant: "Brillant",
  texture: "Texturé",
  indetermine: "Finition inconnue",
};

/**
 * Origine de la valeur. Le modèle n'admet que deux origines : quelqu'un l'a
 * déclarée, ou personne ne l'a renseignée. Aucune troisième origine « estimée »
 * n'est prévue, et c'est délibéré — voir l'en-tête de ce module.
 */
export type OrigineFinition = "declaree" | "inconnue";

export type FinitionSeau = {
  valeur: FinitionColors;
  origine: OrigineFinition;
  libelle: string;
  /** Phrase affichable, qui ne dit jamais plus que ce qui est su. */
  mention: string;
};

export function estFinitionColors(valeur: unknown): valeur is FinitionColors {
  return typeof valeur === "string" && (FINITIONS as readonly string[]).includes(valeur);
}

/** Normalise une valeur venue d'un formulaire ou d'une étiquette lue. */
export function finitionSur(valeur: unknown): FinitionSeau {
  if (!estFinitionColors(valeur) || valeur === "indetermine") {
    return {
      valeur: FINITION_PAR_DEFAUT,
      origine: "inconnue",
      libelle: LIBELLES_FINITION.indetermine,
      mention: "Finition non renseignée. Elle se lit sur l’étiquette du seau.",
    };
  }
  return {
    valeur,
    origine: "declaree",
    libelle: LIBELLES_FINITION[valeur],
    mention: `Finition ${LIBELLES_FINITION[valeur].toLowerCase()}, déclarée d’après l’étiquette.`,
  };
}
