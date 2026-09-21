import { BRAND } from "@/lib/brand";
import { destinationInterneSure } from "@/lib/security/redirects";

type ConfigurationUrlPublique = Pick<typeof BRAND, "urlPublique">;

export const ERREUR_CONFIGURATION_URL_AUTH =
  "La configuration de l’application ne permet pas d’envoyer cet e-mail. Réessayez plus tard.";

export function construireUrlCallbackAuth(
  destination: string,
  configuration: ConfigurationUrlPublique = BRAND,
) {
  if (!configuration.urlPublique) return null;

  const destinationSure = destinationInterneSure(destination, "/dashboard");
  const callback = new URL("/auth/callback", configuration.urlPublique);
  callback.searchParams.set("next", destinationSure);
  return callback.toString();
}

export function urlCallbackReinitialisation(configuration: ConfigurationUrlPublique = BRAND) {
  return construireUrlCallbackAuth("/nouveau-mot-de-passe", configuration);
}
