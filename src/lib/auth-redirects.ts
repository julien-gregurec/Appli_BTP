import { BRAND } from "@/lib/brand";
import { destinationInterneSure } from "@/lib/security/redirects";

type ConfigurationUrlPublique = Pick<typeof BRAND, "urlPublique">;

export const ERREUR_CONFIGURATION_URL_AUTH =
  "La configuration de l’application ne permet pas d’envoyer cet e-mail. Réessayez plus tard.";

function normaliserOrigine(valeur: string | undefined | null): string | null {
  const candidate = valeur?.trim();
  if (!candidate) return null;
  // VERCEL_BRANCH_URL / VERCEL_PROJECT_PRODUCTION_URL sont fournis sans schéma.
  const avecSchema = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const url = new URL(avecSchema);
    return ["http:", "https:"].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * URL de base publique STABLE pour les liens e-mail Supabase Auth (callback de
 * confirmation, de récupération de mot de passe). Priorité :
 *
 *   1. NEXT_PUBLIC_APP_URL (override explicite ; en Production = https://app.elsatia.fr).
 *   2. Hors Production uniquement : une URL Vercel STABLE —
 *        - VERCEL_BRANCH_URL          : suit le dernier déploiement de la branche,
 *        - puis VERCEL_PROJECT_PRODUCTION_URL : domaine stable du projet Vercel.
 *      Jamais VERCEL_URL (URL de déploiement éphémère, non enregistrable dans la
 *      liste blanche Supabase « Redirect URLs »).
 *
 * Production reste isolée : quand VERCEL_ENV === "production", aucune URL Vercel
 * n'est dérivée — seul NEXT_PUBLIC_APP_URL compte, sinon `null` (comportement
 * historique : l'e-mail n'est pas envoyé et une erreur de configuration est
 * affichée).
 *
 * Fonction serveur uniquement (VERCEL_* ne sont pas exposés au navigateur).
 */
export function baseUrlPubliqueAuth(configuration: ConfigurationUrlPublique = BRAND): string | null {
  if (configuration.urlPublique) return configuration.urlPublique;
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return (
      normaliserOrigine(process.env.VERCEL_BRANCH_URL) ??
      normaliserOrigine(process.env.VERCEL_PROJECT_PRODUCTION_URL)
    );
  }
  return null;
}

export function construireUrlCallbackAuth(
  destination: string,
  configuration: ConfigurationUrlPublique = BRAND,
) {
  const base = baseUrlPubliqueAuth(configuration);
  if (!base) return null;

  const destinationSure = destinationInterneSure(destination, "/dashboard");
  const callback = new URL("/auth/callback", base);
  callback.searchParams.set("next", destinationSure);
  return callback.toString();
}

export function urlCallbackReinitialisation(configuration: ConfigurationUrlPublique = BRAND) {
  return construireUrlCallbackAuth("/nouveau-mot-de-passe", configuration);
}
