/**
 * URL de la page d'impression que Chromium visite avec le cookie de session de
 * l'appelant.
 *
 * L'origine est CELLE QUI EST CONFIGURÉE (`NEXT_PUBLIC_APP_URL`), jamais celle de
 * la requête : `request.url` est composée à partir de l'en-tête `Host` (ou
 * `X-Forwarded-Host`), et l'utiliser laissait l'appelant choisir vers quel serveur
 * le navigateur authentifié navigue (SSRF, contenu restitué dans le PDF). Même règle
 * que le partage public (`urlImpressionPartage`) et que l'export PDF de Réserves.
 */
export function urlImpressionInterne(chemin: string, origineConfiguree: string | null): string | null {
  if (!origineConfiguree || !chemin.startsWith("/") || chemin.startsWith("//")) return null;
  const url = new URL(chemin, origineConfiguree);
  return url.origin === new URL(origineConfiguree).origin ? url.toString() : null;
}
