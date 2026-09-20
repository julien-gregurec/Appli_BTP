/**
 * Jeu fermé des messages affichables sur l'écran de connexion.
 *
 * `/login` ne rend jamais un texte reçu par l'URL : il ne rend que le libellé associé à un
 * code connu. Réserves affichait auparavant `?error=<texte>` tel quel : un lien légitime du
 * domaine de l'application pouvait porter n'importe quel message crédible (« Compte suspendu,
 * appelez le… »). React échappe le HTML, pas la tromperie. Colors a fermé ce cas de la même
 * façon (`apps/colors/src/lib/messages-auth.ts`).
 */

export const CODE_IDENTIFIANTS_INVALIDES = "identifiants";
export const CODE_ACCES_RESERVES_ABSENT = "acces-reserves";
/** Le service d'authentification, ou la lecture d'habilitation, n'a pas répondu : ce n'est ni un mot de passe faux ni une absence de droit. */
export const CODE_SERVICE_INDISPONIBLE = "service-indisponible";
export const CODE_DECONNEXION = "deconnexion";

const ERREURS = new Map<string, string>([
  [CODE_IDENTIFIANTS_INVALIDES, "Identifiants incorrects."],
  [CODE_ACCES_RESERVES_ABSENT, "Votre compte ELSATIA ne dispose pas d’un accès actif à Réserves."],
  [
    CODE_SERVICE_INDISPONIBLE,
    "Le service d’authentification ne répond pas. Vos identifiants sont probablement corrects : réessayez dans un instant.",
  ],
]);

const CONFIRMATIONS = new Map<string, string>([[CODE_DECONNEXION, "Vous êtes déconnecté"]]);

function libelle(table: Map<string, string>, code: unknown): string | null {
  return typeof code === "string" ? table.get(code) ?? null : null;
}

export function messageErreurConnexion(code: unknown): string | null {
  return libelle(ERREURS, code);
}

export function messageConfirmationConnexion(code: unknown): string | null {
  return libelle(CONFIRMATIONS, code);
}
