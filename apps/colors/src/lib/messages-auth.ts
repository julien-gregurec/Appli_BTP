/**
 * Jeu fermé des messages affichables sur les écrans d'authentification.
 *
 * Ces écrans ne rendent jamais un texte reçu par l'URL : ils ne rendent que le
 * libellé ELSATIA associé à un code connu. Un code inconnu n'affiche rien.
 * Cela ferme la composition « lien légitime + message crédible » utilisable
 * pour de l'hameçonnage sur le domaine de l'application.
 */

export const CODE_IDENTIFIANTS_INVALIDES = "identifiants";
export const CODE_ACCES_COLORS_ABSENT = "acces-colors";
export const CODE_DECONNEXION = "deconnexion";

/** Réinitialisation de mot de passe. */
export const CODE_EMAIL_REQUIS = "email-requis";
export const CODE_RESET_INDISPONIBLE = "reset-indisponible";
export const CODE_LIEN_INVALIDE = "lien-invalide";
export const CODE_MOT_DE_PASSE_TROP_COURT = "mot-de-passe-court";
export const CODE_MOTS_DE_PASSE_DIFFERENTS = "mots-de-passe-differents";
export const CODE_MOT_DE_PASSE_REFUSE = "mot-de-passe-refuse";
export const CODE_DEMANDE_ENVOYEE = "demande-envoyee";
export const CODE_MOT_DE_PASSE_MODIFIE = "mot-de-passe-modifie";

/** Longueur minimale acceptée avant même de solliciter Supabase. */
export const LONGUEUR_MINIMALE_MOT_DE_PASSE = 12;

const ERREURS = new Map<string, string>([
  [CODE_IDENTIFIANTS_INVALIDES, "Identifiants incorrects."],
  [CODE_ACCES_COLORS_ABSENT, "Votre compte ELSATIA ne dispose pas d’un accès actif à Colors."],
  [CODE_EMAIL_REQUIS, "Saisissez votre adresse email."],
  [
    CODE_RESET_INDISPONIBLE,
    "La réinitialisation est momentanément indisponible. Réessayez plus tard.",
  ],
  [
    CODE_LIEN_INVALIDE,
    "Ce lien de réinitialisation est invalide ou expiré. Demandez-en un nouveau.",
  ],
  [
    CODE_MOT_DE_PASSE_TROP_COURT,
    `Le mot de passe doit contenir au moins ${LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères.`,
  ],
  [CODE_MOTS_DE_PASSE_DIFFERENTS, "Les deux mots de passe ne correspondent pas."],
  [CODE_MOT_DE_PASSE_REFUSE, "Ce mot de passe a été refusé. Choisissez-en un autre."],
]);

const CONFIRMATIONS = new Map<string, string>([
  [CODE_DECONNEXION, "Vous êtes déconnecté"],
  [
    CODE_DEMANDE_ENVOYEE,
    "Si un compte ELSATIA correspond à cette adresse, un email de réinitialisation vient d’être envoyé.",
  ],
  [
    CODE_MOT_DE_PASSE_MODIFIE,
    "Mot de passe modifié. Vous pouvez maintenant vous connecter.",
  ],
]);

function libelle(table: Map<string, string>, code: unknown): string | null {
  return typeof code === "string" ? table.get(code) ?? null : null;
}

/** Libellé d'erreur de connexion associé au code, ou `null` si le code est inconnu. */
export function messageErreurConnexion(code: unknown): string | null {
  return libelle(ERREURS, code);
}

/** Libellé de confirmation associé au code, ou `null` si le code est inconnu. */
export function messageConfirmationConnexion(code: unknown): string | null {
  return libelle(CONFIRMATIONS, code);
}
