/**
 * Jeu fermé des messages affichables sur `/login`.
 *
 * L'écran de connexion ne rend jamais un texte reçu par l'URL : il ne rend que
 * le libellé ELSATIA associé à un code connu. Un code inconnu n'affiche rien.
 * Cela ferme la composition « lien légitime + message crédible » utilisable
 * pour de l'hameçonnage sur le domaine de l'application.
 */

export const CODE_IDENTIFIANTS_INVALIDES = "identifiants";
export const CODE_ACCES_COLORS_ABSENT = "acces-colors";
export const CODE_DECONNEXION = "deconnexion";

const ERREURS = new Map<string, string>([
  [CODE_IDENTIFIANTS_INVALIDES, "Identifiants incorrects."],
  [CODE_ACCES_COLORS_ABSENT, "Votre compte ELSATIA ne dispose pas d’un accès actif à Colors."],
]);

const CONFIRMATIONS = new Map<string, string>([
  [CODE_DECONNEXION, "Vous êtes déconnecté"],
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
