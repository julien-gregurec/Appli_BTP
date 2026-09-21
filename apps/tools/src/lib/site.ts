export const SITE = {
  productName: "ELSATIA Tools",
  shortName: "Tools",
  tagline: "La boîte à outils numérique du chantier.",
  defaultUrl: "https://tools.elsatia.fr",
  localPort: 3020,
} as const;

export const APP_ENVIRONMENTS = ["local", "preview", "production", "native-dev", "native-production"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export const EXTERNAL_URLS = {
  elsatia: "https://elsatia.fr",
  gestionPro: "https://app.elsatia.fr",
  colors: "https://colors.elsatia.fr",
  legalNotice: "https://elsatia.fr/mentions-legales",
  privacy: "https://elsatia.fr/confidentialite",
  terms: "https://elsatia.fr/cgu",
  support: "https://elsatia.fr/contact",
  accountCreation: "https://app.elsatia.fr/signup",
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

export function getAppEnvironment(value = process.env.NEXT_PUBLIC_TOOLS_ENV): AppEnvironment {
  return APP_ENVIRONMENTS.includes(value as AppEnvironment) ? value as AppEnvironment : "production";
}

export function isNativeBuild(value = process.env.NEXT_PUBLIC_TOOLS_RUNTIME) {
  return value === "native";
}
