/**
 * Politique d'activation de la lecture d'étiquette (OCR) dans ELSATIA Colors.
 *
 * ### Ce que l'OCR fait, et ce qu'il ne fera jamais
 *
 * L'OCR lit le texte d'une étiquette : marque, produit, référence, nom de
 * teinte, volume nominal. Il ne lit **aucune couleur** — le pixel d'une photo
 * n'est pas une mesure colorimétrique — et il ne modifie **jamais** une fiche
 * tout seul. Chaque champ proposé doit être accepté par une personne, un par
 * un. C'est la raison d'être de `analyserEtiquetteColors`, qui force le statut
 * `a_confirmer` quel que soit ce que renvoie le fournisseur, et de la RPC
 * `colors_confirmer_analyse_ocr`, qui refuse une analyse déjà traitée.
 *
 * ### Refus par défaut
 *
 * Envoyer la photographie d'un chantier à un tiers n'est pas un détail
 * technique : c'est un transfert de données vers un sous-traitant, qui suppose
 * un contrat, une base légale et une information des personnes. Tant que ces
 * trois éléments ne sont pas réunis, l'OCR reste inactif, et aucune image ne
 * quitte l'infrastructure ELSATIA.
 *
 * L'activation exige donc DEUX déclarations serveur convergentes, jamais une
 * seule :
 *
 *   - `COLORS_OCR_ACTIF=oui`       — décision d'exploitation, assumée ;
 *   - `COLORS_OCR_FOURNISSEUR=<id>` — sous-traitant nommé, donc identifiable
 *                                     dans un registre de traitements.
 *
 * Un « oui » sans fournisseur nommé ne suffit pas : il désignerait un
 * destinataire inconnu. Un fournisseur nommé sans « oui » ne suffit pas non
 * plus : une configuration préparée n'est pas une décision prise. Aucune de ces
 * variables n'est `NEXT_PUBLIC_` — ni l'identité du sous-traitant ni, a
 * fortiori, sa clé d'accès n'ont à figurer dans le bundle navigateur.
 */

export type EtatOcrColors =
  | { actif: true; fournisseur: string }
  | { actif: false; raison: RaisonOcrInactif };

export type RaisonOcrInactif =
  | "desactive"
  | "fournisseur_non_declare"
  | "fournisseur_inconnu";

export const RAISONS_OCR_INACTIF: Record<RaisonOcrInactif, string> = {
  desactive: "La lecture d’étiquette est désactivée sur cette installation. Aucune image n’est transmise à un tiers.",
  fournisseur_non_declare: "La lecture d’étiquette est demandée mais aucun prestataire n’est déclaré : elle reste inactive.",
  fournisseur_inconnu: "Le prestataire de lecture d’étiquette déclaré n’est pas reconnu par cette version de Colors.",
};

export const VARIABLE_OCR_ACTIF = "COLORS_OCR_ACTIF";
export const VARIABLE_OCR_FOURNISSEUR = "COLORS_OCR_FOURNISSEUR";

/** Seule valeur qui active. Tout le reste — vide, « true », « 1 » — laisse inactif. */
export const VALEUR_ACTIVATION = "oui";

export type ConfigurationOcr = {
  actif: string | undefined;
  fournisseur: string | undefined;
  /** Identifiants de fournisseurs réellement implémentés dans cette version. */
  fournisseursConnus: readonly string[];
};

/**
 * Décision d'activation, à partir de la configuration seule.
 *
 * Fonction pure : aucune variable d'environnement n'est lue ici, ce qui permet
 * d'éprouver les quatre issues sans manipuler `process.env`.
 *
 * Le refus est le défaut à chaque branche : toute configuration qui n'est pas
 * explicitement et complètement affirmative laisse l'OCR inactif.
 */
export function decisionOcr(configuration: ConfigurationOcr): EtatOcrColors {
  if (configuration.actif?.trim().toLowerCase() !== VALEUR_ACTIVATION) {
    return { actif: false, raison: "desactive" };
  }
  const fournisseur = configuration.fournisseur?.trim();
  if (!fournisseur) return { actif: false, raison: "fournisseur_non_declare" };
  if (!configuration.fournisseursConnus.includes(fournisseur)) {
    return { actif: false, raison: "fournisseur_inconnu" };
  }
  return { actif: true, fournisseur };
}
