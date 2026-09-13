import { existsSync } from "node:fs";
import "server-only";
import type { Browser, Page, PDFOptions } from "puppeteer-core";

// Next.js 16 interdit d'importer react-dom/server dans le code serveur de
// l'App Router ("render or return the content directly as a Server
// Component instead"). On ne rend donc plus DocumentImprimable manuellement :
// Chromium headless navigue vers la page /imprimer/... déjà rendue par le
// pipeline RSC normal de Next.js (la même page que verrait un utilisateur),
// puis l'imprime. Zéro rendu dupliqué, zéro contournement de la restriction.
//
// Deux moteurs de présentation cohabitent :
//  - moteur 1 (DocumentImprimable) : Chromium découpe lui-même les pages, avec
//    des marges de 10 mm. Options d'impression INCHANGÉES.
//  - moteur 2 (DocumentA4) : les pages sont décidées à partir des données
//    (src/lib/devis/pagination.ts), chaque `<section class="doc-a4__page">`
//    mesure exactement 210 × 297 mm et dessine son propre pied « Page x / n ».
//    Chromium doit donc imprimer SANS marge et SANS pied, au format déclaré par
//    la CSS (`@page{size:A4;margin:0}`), et REFUSER d'imprimer une page dont le
//    contenu déborde : une facture tronquée ne doit jamais sortir.

export type MoteurPdf = 1 | 2;

export type OptionsGenerationPdf = {
  /** Moteur de présentation de la page imprimée ; 1 par défaut (documents historiques). */
  moteur?: MoteurPdf;
};

async function lancerNavigateur(): Promise<Browser> {
  const { launch } = await import("puppeteer-core");

  // Échappatoire de DÉVELOPPEMENT et de RECETTE, jamais de production (même
  // correctif que apps/reserves/src/lib/pdf/generer.ts).
  //
  // `@sparticuz/chromium` embarque un binaire Linux, taillé pour le runtime
  // serverless où l'application est déployée. Sur un poste macOS ou Windows, ce
  // binaire s'extrait sans erreur mais ne peut pas s'exécuter : rien du document
  // imprimé n'est alors vérifiable localement.
  //
  // Cette variable désigne donc un Chromium DÉJÀ présent sur le poste. Elle n'est
  // lue que si elle est explicitement définie : sur le runtime de déploiement, où
  // elle ne l'est pas, le chemin ci-dessous est strictement celui d'avant.
  const local = process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
  if (local) {
    return launch({
      executablePath: local,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }

  // Vercel n'expose `VERCEL=1` à l'exécution que si « Automatically expose System Environment
  // Variables » est coché sur le projet. Sans cet indice, `@sparticuz/chromium` se croit sur Amazon
  // Linux 2, n'extrait pas ses bibliothèques AL2023 et Chromium échoue (`libnspr4.so` introuvable —
  // constaté sur la preview, Node 24). Une fonction Vercel en Node ≥ 20 tourne toujours sur AL2023 :
  // on le dit explicitement, uniquement dans une fonction serverless (arborescence `/var/task`) qui
  // n'a reçu aucun indice. La détection se fait à l'import du module, d'où l'ordre.
  if (!process.env.AWS_EXECUTION_ENV && !process.env.AWS_LAMBDA_JS_RUNTIME && !process.env.VERCEL && existsSync("/var/task")) {
    process.env.AWS_LAMBDA_JS_RUNTIME = `nodejs${process.versions.node.split(".")[0]}.x`;
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export type CookiePourUrl = { name: string; value: string; url: string };

/**
 * Découpe un en-tête `Cookie` en cookies nommés, PORTÉS PAR UNE URL.
 *
 * L'implémentation précédente passait l'en-tête `Cookie` entier à
 * `page.setExtraHTTPHeaders()`, ce qui l'attache à TOUTES les requêtes émises par
 * la page — y compris celles qui partent vers une autre origine (le logo hébergé
 * sur Supabase, par exemple). Le jeton de session de l'utilisateur partait donc,
 * à chaque tirage, vers une origine tierce qui n'a aucune raison de le recevoir.
 *
 * En posant les cookies dans le magasin de Chromium avec l'URL du document, on
 * retrouve le comportement d'un navigateur ordinaire : ils ne sont émis QUE vers
 * cette origine.
 *
 * La valeur n'est pas retaillée : un cookie Supabase est du base64 et contient
 * des « = ». Seul le PREMIER sépare le nom de la valeur. Un morceau vide, sans
 * « = » ou sans nom est ignoré.
 */
export function cookiesPourUrl(enTete: string, url: string): CookiePourUrl[] {
  return enTete
    .split(";")
    .map((morceau) => morceau.trim())
    .filter((morceau) => morceau !== "")
    .map((morceau) => {
      const separateur = morceau.indexOf("=");
      if (separateur <= 0) return null;
      return {
        name: morceau.slice(0, separateur),
        value: morceau.slice(separateur + 1),
        url,
      };
    })
    .filter((cookie): cookie is CookiePourUrl => cookie !== null);
}

/**
 * Options `page.pdf()` de chaque moteur. Une fonction (et non une constante
 * partagée) : chaque impression reçoit son propre objet.
 */
export function optionsPdf(moteur: MoteurPdf): PDFOptions {
  if (moteur === 2) {
    return {
      // Le format vient de la CSS (`@page{size:A4;margin:0}`) ; « A4 » ne sert
      // que de repli si la feuille de style n'en déclarait pas.
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      // La page v2 dessine elle-même « Page x / n ».
      displayHeaderFooter: false,
    };
  }
  // Moteur 1 : strictement les options historiques.
  return {
    format: "A4",
    printBackground: true,
    margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
  };
}

/**
 * Contrôle de débordement du moteur 2, exécuté DANS la page par Chromium
 * (`page.evaluate`). Renvoie le numéro de chaque page A4 dont le contenu dépasse
 * la hauteur disponible.
 *
 * Écrite sans aucune dépendance ni capture de portée : Puppeteer la sérialise
 * (`toString()`) pour l'exécuter dans le navigateur. `racine` n'est passée que
 * par les tests ; dans la page, c'est `document`.
 */
export function pagesEnDebordement(racine?: ParentNode): number[] {
  const r = racine || document;
  const pages = r.querySelectorAll(".doc-a4__page");
  const numeros: number[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const contenu = page.querySelector(".doc-a4__contenu");
    if (contenu && contenu.scrollHeight > contenu.clientHeight + 1) {
      numeros.push(Number(page.getAttribute("data-page")) || i + 1);
    }
  }
  return numeros;
}

export function messageDebordement(numeros: number[]): string {
  return `Mise en page à corriger : débordement page(s) ${numeros.join(", ")}`;
}

async function imprimer(page: Page, moteur: MoteurPdf): Promise<Buffer> {
  if (moteur === 2) {
    // Les hauteurs ne sont définitives qu'une fois les polices chargées.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const debordements = await page.evaluate(pagesEnDebordement);
    if (debordements.length > 0) throw new Error(messageDebordement(debordements));
  }
  const pdf = await page.pdf(optionsPdf(moteur));
  return Buffer.from(pdf);
}

export async function genererPdfDepuisUrl(
  url: string,
  cookieHeader?: string | null,
  options: OptionsGenerationPdf = {},
): Promise<Buffer> {
  const navigateur = await lancerNavigateur();
  try {
    const page = await navigateur.newPage();
    // Le cookie de session de la requête entrante est réémis : Chromium est donc
    // authentifié EXACTEMENT comme l'appelant, jamais davantage — et seulement
    // vers l'origine du document, jamais vers les ressources tierces qu'il charge.
    if (cookieHeader) {
      const cookies = cookiesPourUrl(cookieHeader, url);
      if (cookies.length > 0) await page.setCookie(...cookies);
    }
    const reponse = await page.goto(url, { waitUntil: "load" });
    if (!reponse || !reponse.ok()) throw new Error(`Document introuvable (${reponse?.status() ?? "pas de réponse"})`);
    return await imprimer(page, options.moteur ?? 1);
  } finally {
    await navigateur.close();
  }
}

/**
 * Imprime un document HTML complet, sans navigation ni cookie. Sert à la preuve
 * « aperçu = PDF » (le HTML rendu par DocumentA4 est imprimé tel quel) ; le code
 * de l'App Router, lui, passe par `genererPdfDepuisUrl`.
 */
export async function genererPdfDepuisHtml(html: string, options: OptionsGenerationPdf = {}): Promise<Buffer> {
  const navigateur = await lancerNavigateur();
  try {
    const page = await navigateur.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await imprimer(page, options.moteur ?? 1);
  } finally {
    await navigateur.close();
  }
}

export function nomFichierPdf(estFacture: boolean, numero: string): string {
  const base = (numero || "document").replace(/[^a-zA-Z0-9-]/g, "-");
  return `${estFacture ? "facture" : "devis"}-${base}.pdf`;
}
