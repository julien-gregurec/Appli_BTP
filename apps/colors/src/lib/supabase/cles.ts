/**
 * Point de lecture unique des deux variables publiques du plan de données Supabase.
 *
 * Colors les lisait auparavant en trois endroits, avec des `!` qui promettaient une valeur que
 * rien ne garantissait. Les regrouper ici a deux effets concrets : le nom des variables
 * n'apparaît qu'à un seul endroit du code applicatif — la convention peut donc changer sans
 * chasse au `grep` —, et l'absence produit une erreur qui dit ce qui manque, au lieu du
 * « supabaseUrl is required » du SDK.
 *
 * La convention est `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, sans repli sur l'ancien
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Ce n'est pas un choix cosmétique : les clés JWT legacy
 * (`anon` et `service_role`) ont été désactivées ensemble au niveau du projet Supabase lors de
 * SECURITY-CREDENTIALS-V1B/V1C. Une valeur portée par l'ancien nom n'authentifierait plus rien,
 * et l'accepter en secours transformerait une panne d'authentification en démarrage silencieux.
 * Gestion Pro (`src/lib/supabase/keys.ts`) et Tools appliquent la même règle.
 *
 * Ces lectures sont figées par Next au moment du build : ce que le déploiement embarque est la
 * valeur présente à ce moment-là, pas au démarrage du serveur. La garde
 * `scripts/verify-public-env.mjs` est le pendant de cette contrainte — elle refuse un build
 * publié à qui il manque l'une de ces variables.
 */

/**
 * Origine Supabase telle qu'elle est configurée, sans exigence.
 *
 * Réservée à la CSP : `construireCspColors` sait se passer de l'origine et se replier sur une
 * politique plus stricte. Faire échouer le proxy sur cette lecture retirerait ses en-têtes de
 * sécurité à toute l'application au lieu de lui retirer une seule origine d'images.
 */
export function urlSupabaseConfiguree(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Origine Supabase exigée : sans elle, aucun client ne peut être construit. */
export function urlSupabase(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Configuration Supabase incomplète : NEXT_PUBLIC_SUPABASE_URL absente");
  return url;
}

/** Clé publique du client Supabase. Aucun repli sur l'ancien nom : voir l'en-tête du module. */
export function clePubliqueSupabase(): string {
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!cle) throw new Error("Configuration Supabase incomplète : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente");
  return cle;
}
