import { ORIGINES_PRODUCTION_ELSATIA, urlNavigationSure, type EnvironnementNavigation } from "@elsatia/application-access";

export const SITE = {
  productName: "ELSATIA Tools",
  shortName: "Tools",
  tagline: "La boîte à outils numérique du chantier.",
  defaultUrl: "https://tools.elsatia.fr",
  localPort: 3020,
} as const;

export const APP_ENVIRONMENTS = ["local", "preview", "production", "native-dev", "native-production"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/**
 * Pages publiques du site vitrine ELSATIA (mentions légales, CGU, confidentialité, contact) :
 * liens VOLONTAIREMENT identiques dans tous les environnements — ces pages n'existent qu'en
 * Production, ne portent ni session ni donnée. `accountDeletion` est l'URL déclarée aux stores
 * (Apple/Google), pas un lien de navigation. Les liens vers les APPLICATIONS (Gestion Pro,
 * Colors, création de compte) ne sont PAS ici : voir `elsatiaAppUrls` (A-08).
 */
export const EXTERNAL_URLS = {
  elsatia: "https://elsatia.fr",
  legalNotice: "https://elsatia.fr/mentions-legales",
  privacy: "https://elsatia.fr/confidentialite",
  terms: "https://elsatia.fr/cgu",
  support: "https://elsatia.fr/contact",
  accountDeletion: "https://tools.elsatia.fr/suppression-compte",
} as const;

/** Liens juridiques et de marque affichés en pied de page public. Les pages sont hébergées par le site ELSATIA : Tools n'en héberge aucune copie. */
export const PUBLIC_LEGAL_LINKS = [
  { href: EXTERNAL_URLS.legalNotice, label: "Mentions légales" },
  { href: EXTERNAL_URLS.privacy, label: "Confidentialité" },
  { href: EXTERNAL_URLS.terms, label: "CGU" },
  { href: EXTERNAL_URLS.support, label: "Contact" },
  { href: EXTERNAL_URLS.elsatia, label: "ELSATIA" },
] as const;

export function getPublicUrl() {
  return process.env.NEXT_PUBLIC_TOOLS_URL ?? SITE.defaultUrl;
}

/**
 * Posture de sécurité : absente ou inconnue vaut `production` (la plus stricte). Conservé pour
 * la garde de build et les en-têtes ; la NAVIGATION, elle, utilise `resolveToolsEnv`, strict.
 */
export function getAppEnvironment(value = process.env.NEXT_PUBLIC_TOOLS_ENV): AppEnvironment {
  return APP_ENVIRONMENTS.includes(value as AppEnvironment) ? value as AppEnvironment : "production";
}

/**
 * Lecture STRICTE de `NEXT_PUBLIC_TOOLS_ENV` (TOOLS_ENV, ELSATIA_SATELLITES_PREVIEW_READINESS_V2).
 * Absente → `production` (contrat historique : un build qui ne se déclare pas est traité comme
 * publié, et `scripts/verify-public-env.mjs` refuse tout build Vercel Preview qui ne déclare pas
 * `preview`). Présente mais inconnue → `null` : fail closed, aucun lien inter-applications, et la
 * garde de build refuse ce build quel que soit le mode.
 */
export function resolveToolsEnv(value = process.env.NEXT_PUBLIC_TOOLS_ENV): AppEnvironment | null {
  const trimmed = value?.trim();
  if (!trimmed) return "production";
  return APP_ENVIRONMENTS.includes(trimmed as AppEnvironment) ? trimmed as AppEnvironment : null;
}

/** Environnement de navigation inter-applications (les modes natifs sont projetés). */
export function navigationEnvironment(value = process.env.NEXT_PUBLIC_TOOLS_ENV): EnvironnementNavigation | null {
  const mode = resolveToolsEnv(value);
  if (mode === "local" || mode === "native-dev") return "local";
  if (mode === "preview") return "preview";
  if (mode === "production" || mode === "native-production") return "production";
  return null;
}

/** Origines locales de développement (package.json des applications : GP 3000, Colors 3010). */
export const LOCAL_ELSATIA_URLS = { gestionPro: "http://localhost:3000", colors: "http://localhost:3010" } as const;

export type ElsatiaAppUrls = {
  environment: EnvironnementNavigation | null;
  gestionPro: string | null;
  colors: string | null;
  accountCreation: string | null;
};

/**
 * Liens Tools → Gestion Pro / Colors (A-08) :
 *   LOCAL      → variable déclarée si locale, sinon localhost ;
 *   PREVIEW    → `NEXT_PUBLIC_TOOLS_GESTION_PRO_URL` / `NEXT_PUBLIC_TOOLS_COLORS_URL` uniquement,
 *                jamais un hôte `*.elsatia.fr` ; absentes → lien masqué ;
 *   PRODUCTION → variable déclarée si canonique, sinon origine canonique ELSATIA.
 * Toute URL incohérente avec l'environnement est écartée (`null` = lien non affiché).
 * Lectures littérales `process.env.NEXT_PUBLIC_*` : figées au build par Next.
 */
export function elsatiaAppUrls(options: { env?: string; gestionPro?: string; colors?: string } = {
  env: process.env.NEXT_PUBLIC_TOOLS_ENV,
  gestionPro: process.env.NEXT_PUBLIC_TOOLS_GESTION_PRO_URL,
  colors: process.env.NEXT_PUBLIC_TOOLS_COLORS_URL,
}): ElsatiaAppUrls {
  const environment = navigationEnvironment(options.env);
  const pick = (declared: string | undefined, local: string, production: string) => {
    const brute = declared?.trim() || (environment === "local" ? local : environment === "production" ? production : null);
    return urlNavigationSure(brute, environment);
  };
  const gestionPro = pick(options.gestionPro, LOCAL_ELSATIA_URLS.gestionPro, ORIGINES_PRODUCTION_ELSATIA.gestion_pro);
  const colors = pick(options.colors, LOCAL_ELSATIA_URLS.colors, ORIGINES_PRODUCTION_ELSATIA.colors);
  return { environment, gestionPro, colors, accountCreation: gestionPro ? `${gestionPro}/signup` : null };
}

export function isNativeBuild(value = process.env.NEXT_PUBLIC_TOOLS_RUNTIME) {
  return value === "native";
}
