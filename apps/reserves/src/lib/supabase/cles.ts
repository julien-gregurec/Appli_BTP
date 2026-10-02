/**
 * Point de lecture unique des variables publiques Supabase de Réserves (A-07,
 * ELSATIA_SATELLITES_PREVIEW_READINESS_V2).
 *
 * Nom canonique : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, comme Gestion Pro, Colors, Tools et
 * Studio. Réserves lisait jusqu'ici le seul nom hérité `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 *
 * Migration COMPATIBLE (plan du manifeste `config/env-manifest.json`, F-SUPABASE-PUBLIC-KEY-NAME) :
 * le nom canonique est lu en priorité ; l'alias hérité reste accepté en repli pendant la
 * transition, pour qu'aucun environnement déjà configuré (Preview ou Production) ne perde son
 * authentification au déploiement de ce code. Dans les deux cas la VALEUR attendue est une clé
 * publishable `sb_publishable_…` : les clés JWT legacy sont désactivées côté projet. La garde
 * `scripts/verify-public-env.mjs` signale l'usage de l'alias et refuse deux valeurs divergentes.
 * Étape suivante, hors de ce lot : retirer l'alias une fois tous les projets Vercel migrés.
 *
 * Les lectures sont littérales (`process.env.NOM`) pour que Next les inline au build.
 */

/** Origine Supabase telle qu'elle est configurée, sans exigence (CSP, mode sûr). */
export function urlSupabaseConfiguree(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || undefined;
}

/** Origine Supabase exigée : sans elle, aucun client ne peut être construit. */
export function urlSupabase(): string {
  const url = urlSupabaseConfiguree();
  if (!url) throw new Error("Configuration Supabase incomplète : NEXT_PUBLIC_SUPABASE_URL absente");
  return url;
}

/**
 * Clé publique telle qu'elle est configurée, sans exigence. Réservée au mode sûr (proxy, santé) :
 * une absence y signifie « état d'incident inconnu », jamais une panne du proxy.
 */
export function clePubliqueSupabaseConfiguree(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined;
}

/** Clé publique exigée (nom canonique, repli transitoire sur l'alias hérité). */
export function clePubliqueSupabase(): string {
  const cle = clePubliqueSupabaseConfiguree();
  if (!cle) throw new Error("Configuration Supabase incomplète : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente");
  return cle;
}
