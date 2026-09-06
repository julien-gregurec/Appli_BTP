/**
 * Contrat SEO public d'ELSATIA Tools.
 *
 * Ce que ces tests protègent, dans l'ordre de ce qui casse le référencement en production :
 * une canonique absolue sur le domaine public (jamais un aperçu ni `localhost`), un titre et une
 * description sur chaque page, une carte de partage complète, un `robots.txt` et un `sitemap.xml`
 * cohérents entre eux, un `noindex` sur toute route qui n'a pas de valeur publique, et des données
 * structurées qui n'affirment rien d'invérifiable.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { activeTools, freeTools } from "./catalog";
import { SITE } from "./site";
import {
  absoluteUrl,
  breadcrumbJsonLd,
  CRAWLER_DISALLOWED_PATHS,
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  INDEXABLE_PATHS,
  jsonLdScript,
  OG_IMAGE,
  pageMetadata,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "./seo";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const PUBLIC_ORIGIN = SITE.defaultUrl;
/* Toute origine qui ne doit jamais fuiter dans une balise publique. */
const FOREIGN_HOSTS = ["localhost", "127.0.0.1", "vercel.app", "0.0.0.0", `:${SITE.localPort}`];

/** Chemins de route de chaque `page.tsx`, le segment dynamique des outils étant développé. */
function routeFiles(directory = APP_DIR): { route: string; source: string }[] {
  const out: { route: string; source: string }[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === "page.tsx") {
      const segments = relative(APP_DIR, directory).split(sep).filter(Boolean);
      out.push({ route: `/${segments.join("/")}`, source: readFileSync(full, "utf8") });
    }
  }
  return out;
}

const ROUTES = routeFiles();

describe("URL canonique", () => {
  it("est absolue, sur le domaine public, quelle que soit la page", () => {
    expect(absoluteUrl("/")).toBe(`${PUBLIC_ORIGIN}/`);
    expect(absoluteUrl("/outils/arche")).toBe(`${PUBLIC_ORIGIN}/outils/arche`);
    /* Un chemin sans barre de tête ne doit pas produire une URL concaténée de travers. */
    expect(absoluteUrl("outils/arche")).toBe(`${PUBLIC_ORIGIN}/outils/arche`);
  });

  it("suit NEXT_PUBLIC_TOOLS_URL et absorbe une barre finale", () => {
    const previous = process.env.NEXT_PUBLIC_TOOLS_URL;
    try {
      process.env.NEXT_PUBLIC_TOOLS_URL = "https://tools.elsatia.fr/";
      expect(absoluteUrl("/outils/arche")).toBe(`${PUBLIC_ORIGIN}/outils/arche`);
      expect(absoluteUrl("/")).toBe(`${PUBLIC_ORIGIN}/`);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_TOOLS_URL;
      else process.env.NEXT_PUBLIC_TOOLS_URL = previous;
    }
  });

  it("est posée sur chaque page, et égale à og:url", () => {
    for (const path of INDEXABLE_PATHS) {
      const metadata = pageMetadata({ title: path === "/" ? null : "Titre", description: "Description", path });
      expect(metadata.alternates?.canonical).toBe(absoluteUrl(path));
      expect(metadata.openGraph?.url).toBe(absoluteUrl(path));
    }
  });
});

describe("titre et description", () => {
  it("laisse l'accueil sur le titre par défaut, sans suffixe de marque doublé", () => {
    const home = pageMetadata({ title: null, description: DEFAULT_DESCRIPTION, path: "/" });
    expect(home.title).toBeUndefined();
    expect(home.openGraph?.title).toBe(DEFAULT_TITLE);
    expect(DEFAULT_TITLE.match(new RegExp(SITE.productName, "g"))).toHaveLength(1);
  });

  it("n'écrit jamais la marque dans un titre de page (le gabarit du layout s'en charge)", () => {
    for (const { route, source } of ROUTES) {
      for (const [, title] of source.matchAll(/title: "([^"]+)"/g)) {
        expect(`${route} → ${title}`).not.toMatch(new RegExp(SITE.productName));
      }
    }
  });

  it("donne une description non vide et raisonnable à chaque fiche outil", () => {
    for (const tool of activeTools) {
      expect(tool.seo.title.length).toBeGreaterThan(10);
      expect(tool.seo.description.length).toBeGreaterThan(40);
      expect(tool.seo.description.length).toBeLessThanOrEqual(170);
    }
  });

  it("dérive le nombre d'outils gratuits du catalogue au lieu de l'écrire en dur", () => {
    expect(DEFAULT_DESCRIPTION.startsWith(`${freeTools.length} `)).toBe(true);
  });
});

describe("carte de partage", () => {
  const metadata = pageMetadata({ title: "Titre", description: "Description", path: "/outils/arche" });

  it("publie une image Open Graph complète", () => {
    /* `OpenGraph` est une union discriminée par `type` : on compare la forme sérialisée. */
    const openGraph = JSON.parse(JSON.stringify(metadata.openGraph)) as Record<string, unknown>;
    expect(openGraph.images).toEqual([
      { url: OG_IMAGE.path, width: 1200, height: 630, alt: OG_IMAGE.alt, type: "image/png" },
    ]);
    expect(openGraph.siteName).toBe(SITE.productName);
    expect(openGraph.locale).toBe("fr_FR");
    expect(openGraph.type).toBe("website");
  });

  it("publie une carte Twitter large, sans revendiquer de compte", () => {
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: [OG_IMAGE.path] });
    expect(metadata.twitter).not.toHaveProperty("site");
    expect(metadata.twitter).not.toHaveProperty("creator");
  });

  it("répète og:image sur chaque page, car un segment enfant remplace l'objet openGraph du layout", () => {
    const layout = readFileSync(join(APP_DIR, "layout.tsx"), "utf8");
    expect(layout).toContain("OG_IMAGE");
    expect(pageMetadata({ title: "X", description: "Y", path: "/compte", index: false }).openGraph?.images).toHaveLength(1);
  });
});

describe("indexation", () => {
  it("n'indexe que l'accueil et les fiches outil actives", () => {
    expect(INDEXABLE_PATHS).toEqual(["/", ...activeTools.map((tool) => `/outils/${tool.slug}`)]);
  });

  it("pose robots noindex sur les pages sans valeur publique", () => {
    const metadata = pageMetadata({ title: "Compte", description: "…", path: "/compte", index: false });
    expect(metadata.robots).toMatchObject({ index: false, nocache: true });
    /* `follow: true` : la page est refusée à l'index, pas retirée du maillage interne. */
    expect(metadata.robots).toMatchObject({ follow: true });
  });

  it("laisse une page indexable sans directive robots restrictive", () => {
    expect(pageMetadata({ title: "T", description: "D", path: "/outils/arche" }).robots).toBeUndefined();
  });

  it("oblige chaque route à déclarer son intention d'indexation", () => {
    for (const { route, source } of ROUTES) {
      const isDynamicTool = route === "/outils/[id]";
      const indexable = isDynamicTool || INDEXABLE_PATHS.includes(route);
      const refusesIndex = source.includes("index: false");
      expect(`${route} refuse l'index: ${refusesIndex}`).toBe(`${route} refuse l'index: ${!indexable}`);
    }
  });

  /*
   * FINAL-PREPILOT-CONSOLIDATION-V1 — garde-fou de non-régression.
   *
   * Les routes Atelier arrivées avec le lot Workshop (`/atelier/tracer`, `/atelier/modeles`)
   * avaient été écrites AVANT ce module SEO : elles posaient leur `robots` à la main, avec
   * `follow: false`. Elles refusaient donc au robot de suivre leurs liens internes, à rebours
   * de la règle que ce module porte (crawl ouvert, indexation refusée) — et sans qu'aucun test
   * ne le voie, `index: false` étant présent dans les deux écritures.
   *
   * La règle est donc rendue structurelle : une page non indexable passe par `pageMetadata`.
   * Les seules dispensées sont les recettes internes, refusées au crawl : ce sont des culs-de-sac
   * assumés, et leur `follow: false` est cohérent avec leur `Disallow`.
   */
  it("fait passer toute page non indexable par `pageMetadata`, jamais par un robots écrit à la main", () => {
    for (const { route, source } of ROUTES) {
      if (route === "/outils/[id]" || INDEXABLE_PATHS.includes(route)) continue;
      if ((CRAWLER_DISALLOWED_PATHS as readonly string[]).includes(route)) continue;
      expect(`${route} utilise pageMetadata: ${source.includes("pageMetadata(")}`).toBe(
        `${route} utilise pageMetadata: true`,
      );
      expect(`${route} écrit robots à la main: ${/\brobots:\s*\{/.test(source)}`).toBe(
        `${route} écrit robots à la main: false`,
      );
    }
  });

  it("balaie bien toutes les routes de l'application, pas un sous-ensemble", () => {
    const routes = ROUTES.map(({ route }) => route);
    expect(routes).toEqual(expect.arrayContaining(["/", "/outils/[id]", ...CRAWLER_DISALLOWED_PATHS]));
    /* Chaque chemin refusé au crawl correspond à une page réelle : pas de règle robots fantôme. */
    for (const preview of CRAWLER_DISALLOWED_PATHS) expect(routes).toContain(preview);
    expect(routes.length).toBeGreaterThanOrEqual(INDEXABLE_PATHS.length === 0 ? 0 : 13);
  });
});

describe("robots.txt", () => {
  const output = robots();

  it("pointe le sitemap sur le domaine public", () => {
    expect(output.sitemap).toBe(`${PUBLIC_ORIGIN}/sitemap.xml`);
  });

  it("laisse le crawl ouvert et ne refuse que les recettes internes", () => {
    const rules = Array.isArray(output.rules) ? output.rules[0] : output.rules;
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual([...CRAWLER_DISALLOWED_PATHS]);
    /* Les espaces personnels restent crawlables : sinon leur `noindex` ne serait jamais lu. */
    for (const personal of ["/compte", "/projets", "/atelier", "/suppression-compte"]) {
      expect(rules.disallow).not.toContain(personal);
    }
  });
});

describe("sitemap.xml", () => {
  const entries = sitemap();

  it("liste exactement les pages indexables, en URL absolue", () => {
    expect(entries.map((entry) => entry.url)).toEqual(INDEXABLE_PATHS.map((path) => absoluteUrl(path)));
  });

  it("n'annonce aucune page portant noindex", () => {
    const noindexRoutes = ROUTES.filter(({ source }) => source.includes("index: false")).map(({ route }) => absoluteUrl(route));
    for (const url of entries.map((entry) => entry.url)) expect(noindexRoutes).not.toContain(url);
  });
});

describe("données structurées", () => {
  it("décrit le site et son éditeur sans rien inventer", () => {
    const site = websiteJsonLd();
    expect(site["@type"]).toBe("WebSite");
    expect(site.url).toBe(absoluteUrl("/"));
    expect(site.publisher).toMatchObject({ "@type": "Organization", name: "ELSATIA" });
  });

  it("ne publie ni prix, ni note, ni avis, ni audience, ni disponibilité store", () => {
    const application = softwareApplicationJsonLd() as Record<string, unknown>;
    for (const forbidden of ["offers", "price", "aggregateRating", "review", "ratingValue", "interactionStatistic", "downloadUrl", "installUrl"]) {
      expect(application).not.toHaveProperty(forbidden);
    }
    expect(application.operatingSystem).toBe("Web");
    /* La liste des fonctions suit le catalogue : elle ne peut pas décrire un outil retiré. */
    expect(application.featureList).toEqual(freeTools.map((tool) => tool.name));
  });

  it("construit un fil d'Ariane en URL absolues", () => {
    const trail = breadcrumbJsonLd([{ name: "Accueil", path: "/" }, { name: "Arche", path: "/outils/arche" }]);
    expect(trail.itemListElement.map((step) => step.item)).toEqual([absoluteUrl("/"), absoluteUrl("/outils/arche")]);
    expect(trail.itemListElement.map((step) => step.position)).toEqual([1, 2]);
  });

  it("neutralise `<` à la sérialisation, pour qu'aucun contenu ne referme le script", () => {
    expect(jsonLdScript({ name: "<script>alert(1)</script>" })).not.toContain("<");
    expect(JSON.parse(jsonLdScript({ name: "<b>" })).name).toBe("<b>");
  });
});

describe("aucune origine étrangère publiée", () => {
  it("ne laisse fuir ni aperçu, ni localhost, dans les métadonnées ou les données structurées", () => {
    const payload = JSON.stringify([
      ...INDEXABLE_PATHS.map((path) => pageMetadata({ title: "T", description: "D", path })),
      robots(),
      sitemap(),
      websiteJsonLd(),
      softwareApplicationJsonLd(),
    ]);
    for (const host of FOREIGN_HOSTS) expect(payload).not.toContain(host);
    for (const [, url] of payload.matchAll(/"(https?:\/\/[^"]+)"/g)) {
      /* Seules deux origines sont légitimes : le domaine public et le site institutionnel. */
      expect(url.startsWith(PUBLIC_ORIGIN) || url.startsWith("https://elsatia.fr") || url.startsWith("https://schema.org")).toBe(true);
    }
  });
});
