/**
 * Jeu fermé des messages de confirmation et d'erreur des écrans métier Colors.
 *
 * Même discipline que `messages-auth.ts`, étendue aux paramètres `ok` et
 * `erreur` : une page ne rend jamais le texte reçu par l'URL, seulement le
 * libellé ELSATIA associé à un code connu. Deux conséquences :
 *
 *  1. plus aucun détail technique PostgreSQL ne peut transiter par une URL — la
 *     Server Action ne dispose que de codes pour parler à la page ;
 *  2. plus aucun texte arbitraire (« Votre compte est suspendu, appelez le… »)
 *     ne peut être affiché sur le domaine de l'application par simple
 *     fabrication de lien.
 */

/** La saisie du formulaire est refusée par les règles métier Colors. */
export const CODE_VALIDATION = "validation";
/** Le rôle Colors de la personne ne permet pas l'action. */
export const CODE_PERMISSION = "permission";
/** La ressource visée n'existe pas, ou plus, dans le périmètre de l'organisation. */
export const CODE_INDISPONIBLE = "indisponible";
/** Échec technique côté base : le détail reste dans les journaux serveur. */
export const CODE_ERREUR_GENERIQUE = "erreur-generique";

/** Codes de validation de quantité, retournés par `validerQuantite`. */
export const CODE_QUANTITE_UNITE_POURCENTAGE = "quantite-unite-pourcentage";
export const CODE_QUANTITE_POURCENTAGE_HORS_BORNES = "quantite-pourcentage-hors-bornes";
export const CODE_QUANTITE_UNITE_INCOHERENTE = "quantite-unite-incoherente";
export const CODE_QUANTITE_NOMINALE_INVALIDE = "quantite-nominale-invalide";
export const CODE_QUANTITE_RESTANTE_NEGATIVE = "quantite-restante-negative";
export const CODE_QUANTITE_RESTANTE_DEPASSE = "quantite-restante-depasse";
export const CODE_SEUIL_INVALIDE = "seuil-invalide";

/** Codes de confirmation. */
export const CODE_SEAU_AJOUTE = "seau-ajoute";
export const CODE_EMPLACEMENT_AJOUTE = "emplacement-ajoute";
export const CODE_QUANTITE_MISE_A_JOUR = "quantite-mise-a-jour";
export const CODE_SEAU_DEPLACE = "seau-deplace";
export const CODE_ETAT_MIS_A_JOUR = "etat-mis-a-jour";
export const CODE_SEAU_ARCHIVE = "seau-archive";
export const CODE_SEAU_RESTAURE = "seau-restaure";
export const CODE_INFORMATIONS_MISES_A_JOUR = "informations-mises-a-jour";
export const CODE_PARAMETRES_ENREGISTRES = "parametres-enregistres";

const ERREURS = new Map<string, string>([
  [CODE_VALIDATION, "Les informations saisies ne sont pas valides."],
  [CODE_PERMISSION, "Votre rôle Colors ne permet pas cette action."],
  [CODE_INDISPONIBLE, "Cet élément n’est pas disponible."],
  [CODE_ERREUR_GENERIQUE, "L’opération n’a pas pu aboutir. Réessayez dans un instant."],
  [CODE_QUANTITE_UNITE_POURCENTAGE, "En mode pourcentage, l’unité doit être le pourcentage."],
  [CODE_QUANTITE_POURCENTAGE_HORS_BORNES, "Le pourcentage doit être compris entre 0 et 100."],
  [CODE_QUANTITE_UNITE_INCOHERENTE, "L’unité ne correspond pas au mode de saisie."],
  [CODE_QUANTITE_NOMINALE_INVALIDE, "La quantité nominale doit être positive."],
  [CODE_QUANTITE_RESTANTE_NEGATIVE, "La quantité restante ne peut pas être négative."],
  [CODE_QUANTITE_RESTANTE_DEPASSE, "La quantité restante dépasse la quantité nominale."],
  [CODE_SEUIL_INVALIDE, "Le seuil doit être un nombre compris entre 0 et 100."],
]);

const CONFIRMATIONS = new Map<string, string>([
  [CODE_SEAU_AJOUTE, "Seau ajouté"],
  [CODE_EMPLACEMENT_AJOUTE, "Emplacement ajouté"],
  [CODE_QUANTITE_MISE_A_JOUR, "Quantité mise à jour"],
  [CODE_SEAU_DEPLACE, "Seau déplacé"],
  [CODE_ETAT_MIS_A_JOUR, "État mis à jour"],
  [CODE_SEAU_ARCHIVE, "Seau archivé"],
  [CODE_SEAU_RESTAURE, "Seau restauré"],
  [CODE_INFORMATIONS_MISES_A_JOUR, "Informations mises à jour"],
  [CODE_PARAMETRES_ENREGISTRES, "Paramètres enregistrés"],
]);

function libelle(table: Map<string, string>, code: unknown): string | null {
  return typeof code === "string" ? table.get(code) ?? null : null;
}

/** Libellé d'erreur métier associé au code, ou `null` si le code est inconnu. */
export function messageErreurMetier(code: unknown): string | null {
  return libelle(ERREURS, code);
}

/** Libellé de confirmation métier associé au code, ou `null` si le code est inconnu. */
export function messageConfirmationMetier(code: unknown): string | null {
  return libelle(CONFIRMATIONS, code);
}
