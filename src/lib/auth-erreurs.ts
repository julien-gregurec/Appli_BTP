export const MESSAGE_GENERIQUE = "Une erreur est survenue. Réessayez dans un instant.";

const CORRESPONDANCES: Array<[RegExp, string]> = [
  [/user already registered/i, "Un compte existe déjà avec cette adresse email."],
  [/invalid login credentials/i, "Adresse email ou mot de passe incorrect."],
  [/email not confirmed/i, "Confirmez votre adresse email avant de vous connecter."],
  [/password should be at least/i, "Le mot de passe est trop court."],
  [/signup requires a valid password/i, "Le mot de passe saisi n’est pas valide."],
  [/unable to validate email address/i, "L’adresse email n’est pas valide."],
  [/new password should be different/i, "Le nouveau mot de passe doit être différent de l’ancien."],
  [/aal2 required|insufficient_aal|reauthentication|requires? (mfa|two.?factor|reauthentication)|mfa.*(required|verification)/i, "Vérification en deux étapes requise pour changer le mot de passe."],
  [/for security purposes, you can only request this after/i, "Trop de tentatives. Réessayez dans quelques instants."],
  [/email rate limit exceeded/i, "Trop de tentatives. Réessayez dans quelques instants."],
  [/token has expired|otp_expired/i, "Le lien a expiré. Demandez-en un nouveau."],
];

/**
 * Supabase Auth renvoie des messages techniques en anglais (SDK non localisé).
 * On ne les affiche jamais tels quels : soit une traduction connue, soit un
 * message générique — le détail original reste disponible côté serveur (appelant).
 */
export function traduireErreurAuth(message: string | null | undefined): string {
  if (!message) return MESSAGE_GENERIQUE;
  const correspondance = CORRESPONDANCES.find(([motif]) => motif.test(message));
  return correspondance ? correspondance[1] : MESSAGE_GENERIQUE;
}
