import { destinationInterneSure } from "@/lib/security/redirects";

/**
 * Les liens envoyés par e-mail (confirmation d'inscription, réinitialisation de
 * mot de passe) ne doivent JAMAIS être construits à partir d'en-têtes HTTP
 * fournis par le client (`Origin`, `X-Forwarded-Host`, `Host`) : ces en-têtes
 * sont modifiables par l'appelant, et un attaquant capable de les faire
 * accepter par la plateforme d'hébergement pourrait faire pointer le lien
 * envoyé à la victime vers un domaine qu'il contrôle, capturant ainsi le token
 * à usage unique. On utilise uniquement l'URL canonique de déploiement,
 * configurée côté serveur.
 */
export const ERREUR_CONFIGURATION_URL_AUTH =
  "La configuration de l’application ne permet pas d’envoyer cet e-mail. Réessayez plus tard.";

export function construireUrlCallbackAuth(
  destination: string,
  urlPublique: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
) {
  if (!urlPublique) return null;

  const destinationSure = destinationInterneSure(destination, "/dashboard");
  const callback = new URL("/auth/callback", urlPublique);
  callback.searchParams.set("next", destinationSure);
  return callback.toString();
}

export function urlCallbackReinitialisation(urlPublique: string | undefined = process.env.NEXT_PUBLIC_APP_URL) {
  return construireUrlCallbackAuth("/nouveau-mot-de-passe", urlPublique);
}
