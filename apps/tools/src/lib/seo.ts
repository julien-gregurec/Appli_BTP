/**
 * Métadonnées publiques d'ELSATIA Tools (tools.elsatia.fr).
 *
 * Un seul module décide de ce qui est indexable, de l'URL canonique, de la carte de partage et
 * des données structurées. Les pages n'écrivent plus de balise à la main : elles décrivent leur
 * intention (`pageMetadata`) et le module produit un objet `Metadata` complet.
 *
 * Deux règles tiennent tout le reste :
 *
 * 1. **L'URL canonique est toujours absolue et toujours celle du domaine public.** Elle dérive de
 *    `getPublicUrl()` (`NEXT_PUBLIC_TOOLS_URL`, sinon `https://tools.elsatia.fr`), jamais de
 *    l'hôte de la requête : une préproduction Vercel ou un `localhost` ne doit jamais se
 *    canonicaliser lui-même. Le build natif (Capacitor) émet les mêmes balises, inertes dans une
 *    WebView.
 * 2. **Rien n'est affirmé qui ne soit vérifiable.** Pas de note, pas d'avis, pas de nombre
 *    d'utilisateurs, pas de prix (l'offre Pro n'est pas commercialement ouverte), pas de
 *    disponibilité App Store / Google Play. Les seuls chiffres publiés sont dérivés du catalogue.
 */
import type { Metadata } from "next";
import { activeTools, freeTools } from "./catalog";
import { EXTERNAL_URLS, getPublicUrl, SITE } from "./site";

/** Carte de partage : visuel de marque produit par `scripts/generate-og-image.mjs`. */
export const OG_IMAGE = {
  path: "/og-tools.png",
  width: 1200,
  height: 630,
  alt: `Logo ${SITE.productName} sur fond bleu nuit`,
  type: "image/png",
} as const;

export const OG_LOCALE = "fr_FR";
export const TITLE_TEMPLATE = `%s | ${SITE.productName}`;
export const DEFAULT_TITLE = `${SITE.productName} — ${SITE.tagline.replace(/\.$/, "")}`;

/*
 * Le nombre d'outils gratuits n'est jamais écrit en dur : il se déduit du catalogue, donc il ne
 * peut pas mentir après l'ajout ou le retrait d'un outil.
 */
export const DEFAULT_DESCRIPTION = `${freeTools.length} calculateurs et tracés BTP gratuits, sans compte et utilisables hors connexion : équerrage, pentes, surfaces, répartitions, cercles et arches.`;

/** Robots des pages publiques mais non indexables (espaces personnels, écrans techniques). */
export const NOINDEX = { index: false, follow: true, nocache: true } as const;

/**
 * Chemins refusés au robot dans `robots.txt`.
 *
 * Uniquement des routes de recette internes, sans lien entrant : les interdire au crawl ne coûte
 * rien. Les espaces personnels (`/compte`, `/projets`, `/atelier`…) en sont volontairement
 * absents : ils sont liés depuis la navigation, et une URL interdite au crawl peut malgré tout
 * être indexée « à l'aveugle ». Leur `noindex` dans le HTML ne vaut que si le robot peut le lire,
 * donc on autorise le crawl et on refuse l'indexation.
 */
export const CRAWLER_DISALLOWED_PATHS = [
  "/atelier-preview",
  "/atelier-free-preview",
  "/atelier-export-preview",
  "/atelier-viewport-preview",
  "/conseils-preview",
  "/outils/traces-preview",
] as const;

/** Les seules pages qu'ELSATIA Tools demande à indexer : l'accueil et les fiches outil actives. */
export const INDEXABLE_PATHS: readonly string[] = [
  "/",
  ...activeTools.map((tool) => `/outils/${tool.slug}`),
];

/** URL absolue sur le domaine public, à partir d'un chemin racine (`/`, `/outils/arche`). */
export function absoluteUrl(path = "/"): string {
  const origin = getPublicUrl().replace(/\/+$/, "");
  if (path === "/" || path === "") return `${origin}/`;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Titre tel qu'il apparaîtra dans l'onglet, gabarit du layout appliqué. Le `null` est l'accueil. */
export function resolvedTitle(title: string | null): string {
  return title === null ? DEFAULT_TITLE : TITLE_TEMPLATE.replace("%s", title);
}

export type PageSeo = {
  /** Titre court, sans la marque : le gabarit `%s | ELSATIA Tools` l'ajoute. `null` = accueil. */
  title: string | null;
  description: string;
  /** Chemin racine de la page, qui devient l'URL canonique et `og:url`. */
  path: string;
  /** `false` pour les pages publiques sans valeur d'indexation (espaces personnels, techniques). */
  index?: boolean;
};

/**
 * Métadonnées complètes d'une page.
 *
 * `openGraph` et `twitter` sont toujours écrits en entier : dans l'App Router, un segment enfant
 * qui définit `openGraph` **remplace** celui du layout au lieu de le compléter. Un objet partiel
 * ferait donc disparaître `og:image` ou `og:site_name` sur cette page-là.
 */
export function pageMetadata({ title, description, path, index = true }: PageSeo): Metadata {
  const fullTitle = resolvedTitle(title);
  const url = absoluteUrl(path);
  return {
    ...(title === null ? {} : { title }),
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: OG_LOCALE,
      siteName: SITE.productName,
      url,
      title: fullTitle,
      description,
      images: [{ url: OG_IMAGE.path, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: OG_IMAGE.alt, type: OG_IMAGE.type }],
    },
    twitter: {
      // Pas de `site` ni de `creator` : aucun compte X officiel ELSATIA n'est ouvert à ce jour,
      // et pointer un identifiant non détenu attribuerait la marque à un tiers.
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [OG_IMAGE.path],
    },
    ...(index ? {} : { robots: NOINDEX }),
  };
}

/* ------------------------------------------------------------------ données structurées ---- */

/** JSON-LD sérialisé pour un `<script type="application/ld+json">`, `<` neutralisé (XSS). */
export function jsonLdScript(payload: object): string {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

const ORGANIZATION = { "@type": "Organization", name: "ELSATIA", url: EXTERNAL_URLS.elsatia } as const;

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.productName,
    url: absoluteUrl("/"),
    description: DEFAULT_DESCRIPTION,
    inLanguage: "fr-FR",
    publisher: ORGANIZATION,
  };
}

/**
 * L'application elle-même.
 *
 * `offers` est volontairement absent : le socle est gratuit mais l'offre Pro n'est pas
 * commercialement ouverte, et publier un prix — même 0 — décrirait une offre qui n'existe pas.
 * Pas d'`aggregateRating`, de `review` ni d'`interactionStatistic` : aucune donnée réelle.
 * `operatingSystem` reste « Web » tant qu'aucune application n'est publiée sur les stores.
 */
export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.productName,
    url: absoluteUrl("/"),
    description: DEFAULT_DESCRIPTION,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    inLanguage: "fr-FR",
    publisher: ORGANIZATION,
    /* Liste dérivée du catalogue : elle suit les outils réellement gratuits, sans recopie. */
    featureList: freeTools.map((tool) => tool.name),
  };
}

export function breadcrumbJsonLd(trail: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      item: absoluteUrl(step.path),
    })),
  };
}
