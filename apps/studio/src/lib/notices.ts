/**
 * Every message a server action may pass through `?error=`. The Notice component
 * only renders exact members of this list, so a crafted link cannot show arbitrary text.
 */
export const notices = {
  invalidCredentials: "Identifiants invalides.",
  loginFailed:
    "Connexion impossible. Vérifiez vos identifiants et la confirmation de votre email.",
  signupInvalid:
    "Indiquez un email valide et un mot de passe de 12 caractères minimum.",
  signupUnavailable:
    "Inscription indisponible. Réessayez ou connectez-vous avec votre compte ELSATIA.",
  logoutFailed: "Déconnexion impossible. Réessayez.",
  onboardingFailed: "Création impossible. Réessayez dans quelques instants.",
  workspaceCreateFailed:
    "Création impossible : nom de 1 à 100 caractères et 20 espaces maximum.",
  denied: "Accès refusé.",
  invalidName: "Nom invalide.",
  renameFailed: "Modification refusée ou espace indisponible.",
  archiveConfirm: "Saisissez le nom exact de l’espace pour confirmer.",
  archiveFailed: "Suppression refusée ou espace indisponible.",
  memberDenied: "Modification refusée.",
  memberFailed: "Modification refusée : rôle protégé ou membre indisponible.",
  invalidLink: "Lien invalide ou expiré.",
  resetInvalid: "Indiquez un email valide.",
  passwordInvalid: "Le mot de passe doit contenir 12 caractères minimum.",
  passwordMismatch: "Les deux mots de passe ne correspondent pas.",
  brandInvalid:
    "Vérifiez les champs : lettres, chiffres et ponctuation courante uniquement (pas d’emoji).",
  brandConflict:
    "Le kit a été modifié ailleurs. Rechargez la page avant d’enregistrer.",
  brandLogoInvalid:
    "Logo refusé : choisissez une image PNG ou JPEG importée dans l’un de vos projets.",
  brandFailed: "Enregistrement impossible. Réessayez dans quelques instants.",
  inviteInvalid: "Invitation impossible : vérifiez l’adresse e-mail et le rôle.",
  inviteFailed: "Invitation impossible pour le moment. Réessayez.",
  signupClosed:
    "Les inscriptions sont fermées : demandez une invitation à l’administrateur d’un espace Studio.",
  consentRequired:
    "Acceptez les conditions d’utilisation et la politique de confidentialité pour créer un compte.",
  deleteConfirm:
    "Confirmation incorrecte : saisissez votre adresse e-mail exacte, votre mot de passe et cochez la case.",
  deleteBlocked:
    "Suppression impossible : vous êtes propriétaire d’un espace partagé. Retirez les autres membres ou archivez l’espace, puis recommencez.",
  deleteFailed:
    "La suppression n’a pas pu être terminée. Rien n’est perdu : réessayez, l’opération reprend là où elle s’est arrêtée.",
  passwordFailed:
    "Mise à jour impossible. Redemandez un lien de réinitialisation.",
} as const;
export type NoticeKey = keyof typeof notices;
const allowed = new Set<string>(Object.values(notices));
/** Returns the text to display, or nothing when the value is not a known notice. */
export function knownNotice(value: unknown): string | undefined {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}
