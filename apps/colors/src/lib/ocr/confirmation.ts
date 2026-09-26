/**
 * Confirmation champ par champ d'une lecture d'étiquette.
 *
 * Une proposition d'OCR n'est pas une donnée : c'est une suggestion. Le passage
 * de l'une à l'autre est un geste humain, et il est ici découpé au champ près —
 * pas à l'analyse entière. La raison est concrète : sur une étiquette de
 * peinture, la marque est presque toujours bien lue et la référence presque
 * jamais. Un « tout accepter » ferait entrer des références fausses dans
 * l'inventaire, exactement là où elles coûtent le plus cher — à la commande.
 *
 * Ce module est pur : il décrit ce qui sera écrit, et ne l'écrit pas. L'écriture
 * revient à `colors_confirmer_analyse_ocr`, qui refuse une analyse déjà traitée.
 */

import type { PropositionOcrColors } from "@/lib/ocr-colors";

export const CHAMPS_OCR = ["marque", "produit", "reference", "teinte", "teinteReference", "volumeNominal"] as const;
export type ChampOcrColors = (typeof CHAMPS_OCR)[number];

export const LIBELLES_CHAMPS_OCR: Record<ChampOcrColors, string> = {
  marque: "Marque",
  produit: "Produit",
  reference: "Référence produit",
  teinte: "Nom de teinte",
  teinteReference: "Référence de teinte",
  volumeNominal: "Volume nominal",
};

export type ChampAConfirmer = {
  champ: ChampOcrColors;
  libelle: string;
  valeurProposee: string;
  /** Confiance annoncée par le prestataire, ou `null` s'il n'en annonce pas. */
  confiance: number | null;
};

/**
 * Champs réellement soumis à confirmation.
 *
 * Une proposition vide n'est pas présentée : demander de confirmer du vide
 * n'apporte rien et entraîne à valider sans lire.
 */
export function champsAConfirmer(proposition: PropositionOcrColors): ChampAConfirmer[] {
  return CHAMPS_OCR.flatMap((champ) => {
    const propose = proposition.champs[champ];
    const valeur = propose?.valeur?.trim();
    if (!valeur) return [];
    return [{ champ, libelle: LIBELLES_CHAMPS_OCR[champ], valeurProposee: valeur, confiance: propose?.confiance ?? null }];
  });
}

/**
 * Résultat à écrire, à partir des seuls champs explicitement acceptés.
 *
 * Un champ non coché n'est pas écrit : il n'est ni conservé, ni marqué
 * « refusé », il n'entre simplement pas dans la fiche. Rien n'est jamais écrit
 * par défaut.
 */
export function resultatConfirme(
  proposition: PropositionOcrColors,
  acceptes: readonly string[],
): Record<string, string> {
  const retenus = new Set(acceptes);
  const resultat: Record<string, string> = {};
  for (const { champ, valeurProposee } of champsAConfirmer(proposition)) {
    if (retenus.has(champ)) resultat[champ] = valeurProposee;
  }
  return resultat;
}

/** Une confirmation sans aucun champ retenu est un rejet, et doit être traitée comme tel. */
export function estRejet(resultat: Record<string, string>): boolean {
  return Object.keys(resultat).length === 0;
}
