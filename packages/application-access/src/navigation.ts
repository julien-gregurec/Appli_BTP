/**
 * Navigation inter-applications ELSATIA tenant compte de l'environnement
 * (ELSATIA_SATELLITES_PREVIEW_READINESS_V2, constat A-08).
 *
 * Contrat, identique pour Gestion Pro, Colors, Tools et Réserves :
 *
 *   LOCAL      → une cible locale (localhost, 127.0.0.1, [::1]) uniquement ;
 *   PREVIEW    → une cible https qui n'est JAMAIS un hôte de Production ELSATIA ;
 *   PRODUCTION → une cible https sur un hôte canonique ELSATIA (`elsatia.fr` et ses
 *                sous-domaines) uniquement.
 *
 * Toute cible qui ne respecte pas la règle de son environnement est ÉCARTÉE (`null`) : le
 * lien n'est pas affiché. On préfère un lien absent à une Preview qui bascule en silence vers
 * la Production — ou à une Production qui enverrait vers une Preview. Un environnement
 * inconnu ou non déclaré sur un déploiement ne produit aucun lien (fail closed).
 *
 * Seules exceptions, VOULUES et documentées, qui ne passent pas par ce module : les pages
 * publiques du site vitrine (`https://elsatia.fr/…` : mentions légales, CGU, confidentialité,
 * contact). Elles n'existent qu'en Production, ne portent ni session ni donnée, et sont
 * identiques quel que soit l'environnement d'origine.
 */

export const ENVIRONNEMENTS_NAVIGATION = ["local", "preview", "production"] as const;
export type EnvironnementNavigation = (typeof ENVIRONNEMENTS_NAVIGATION)[number];

/** Domaine canonique de Production : lui et ses sous-domaines sont des hôtes de Production. */
export const DOMAINE_PRODUCTION_ELSATIA = "elsatia.fr";

/** Origines canoniques de Production des applications (référence documentaire et repli Tools). */
export const ORIGINES_PRODUCTION_ELSATIA = {
  gestion_pro: "https://app.elsatia.fr",
  colors: "https://colors.elsatia.fr",
  tools: "https://tools.elsatia.fr",
  reserves: "https://reserves.elsatia.fr",
  studio: "https://studio.elsatia.fr",
} as const;

const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function estHoteProductionElsatia(hote: string): boolean {
  const h = hote.toLowerCase().replace(/\.$/, "");
  return h === DOMAINE_PRODUCTION_ELSATIA || h.endsWith(`.${DOMAINE_PRODUCTION_ELSATIA}`);
}

export function estHoteLocal(hote: string): boolean {
  return HOTES_LOCAUX.has(hote.toLowerCase());
}

/**
 * Lecture STRICTE d'un indicateur d'environnement : `local`, `preview` ou `production`,
 * sinon `null`. Aucune valeur inconnue n'est ramenée à un environnement par défaut.
 */
export function environnementNavigationStrict(valeur: string | null | undefined): EnvironnementNavigation | null {
  const v = (valeur ?? "").trim();
  return (ENVIRONNEMENTS_NAVIGATION as readonly string[]).includes(v) ? (v as EnvironnementNavigation) : null;
}

/**
 * Environnement de navigation d'une application serveur qui suit `ELSATIA_APPLICATION_ENV`
 * (Gestion Pro, Colors, Réserves).
 *
 * - valeur reconnue → elle ;
 * - valeur présente mais inconnue → `null` (fail closed) ;
 * - absente sur un poste de développement → `local` (confort historique, inchangé) ;
 * - absente sur un déploiement Vercel (`VERCEL_ENV` présent) → `null` : un déploiement qui ne
 *   se déclare pas ne propose aucun lien plutôt que des liens locaux ou de Production. Le
 *   preflight du manifeste refuse déjà ce déploiement en Preview et en Production.
 */
export function environnementNavigationServeur(
  env: { ELSATIA_APPLICATION_ENV?: string; VERCEL_ENV?: string } = {
    ELSATIA_APPLICATION_ENV: process.env.ELSATIA_APPLICATION_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  },
): EnvironnementNavigation | null {
  const declare = (env.ELSATIA_APPLICATION_ENV ?? "").trim();
  if (declare) return environnementNavigationStrict(declare);
  return (env.VERCEL_ENV ?? "").trim() ? null : "local";
}

/**
 * Valide une cible de navigation pour un environnement. Retourne l'URL normalisée, ou `null`
 * si elle ne doit pas être proposée. Refuse en tout environnement : schéma autre que http(s)
 * (`javascript:`, `data:`…), identifiants embarqués, URL relative ou illisible.
 */
export function urlNavigationSure(
  brute: string | null | undefined,
  environnement: EnvironnementNavigation | null,
): string | null {
  if (!environnement || typeof brute !== "string" || !brute.trim()) return null;
  let url: URL;
  try {
    url = new URL(brute.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const hote = url.hostname;
  if (environnement === "local") {
    if (!estHoteLocal(hote)) return null;
  } else {
    if (url.protocol !== "https:") return null;
    if (estHoteLocal(hote)) return null;
    const production = estHoteProductionElsatia(hote);
    if (environnement === "preview" && production) return null;
    if (environnement === "production" && !production) return null;
  }
  return url.toString().replace(/\/$/, "");
}

export type UrlsCatalogue = {
  urlLocale: string | null;
  urlPreview: string | null;
  urlProduction: string | null;
};

/** URL d'une application du catalogue pour l'environnement, validée (jamais d'inter-environnement). */
export function urlApplicationPourEnvironnement(
  application: UrlsCatalogue,
  environnement: EnvironnementNavigation | null,
): string | null {
  if (!environnement) return null;
  const brute = environnement === "production"
    ? application.urlProduction
    : environnement === "preview"
      ? application.urlPreview
      : application.urlLocale;
  return urlNavigationSure(brute, environnement);
}
