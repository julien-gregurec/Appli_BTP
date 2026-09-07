import "server-only";
import type { Browser } from "puppeteer-core";

// Moteur documentaire canonique d'ELSATIA, repris tel quel de Gestion Pro
// (`src/lib/pdf/generer.ts`) : Chromium headless NAVIGUE vers une page déjà rendue par le
// pipeline RSC, puis l'imprime. Aucun rendu dupliqué, aucune mise en page à maintenir en
// double, et surtout : la page imprimée est celle que l'utilisateur peut ouvrir lui-même,
// donc soumise aux mêmes contrôles d'accès.
async function lancerNavigateur(): Promise<Browser> {
  const { launch } = await import("puppeteer-core");

  // Échappatoire de DÉVELOPPEMENT et de RECETTE, jamais de production.
  //
  // `@sparticuz/chromium` embarque un binaire Linux, taillé pour le runtime serverless
  // où l'application est déployée. Sur un poste macOS ou Windows, ce binaire s'extrait
  // sans erreur mais ne peut pas s'exécuter : la génération échoue alors en 502, et rien
  // du document imprimé n'est vérifiable localement — ni l'orientation, ni la pagination,
  // ni la non-coupure des fiches.
  //
  // Cette variable désigne donc un Chromium DÉJÀ présent sur le poste. Elle n'est lue que
  // si elle est explicitement définie : sur le runtime de déploiement, où elle ne l'est
  // pas, le chemin ci-dessous est strictement celui d'avant.
  const local = process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
  if (local) {
    return launch({
      executablePath: local,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }

  const chromium = (await import("@sparticuz/chromium")).default;
  return launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export type OptionsPdf = {
  paysage?: boolean;
  /** Titre répété en pied de page. Sur un tirage agrafé, il dit de quoi sont ces pages. */
  pied?: string | null;
};

/**
 * Pied de page Chromium.
 *
 * La pagination ne peut pas venir de la CSS : Chromium n'implémente pas les boîtes de
 * marge des médias paginés (`@bottom-center`), et un `counter(page)` y reste vide. Elle
 * passe donc par le gabarit d'en-tête/pied de puppeteer, seul endroit où `pageNumber` et
 * `totalPages` sont renseignés. Les styles y sont inline : ce fragment est rendu dans un
 * document isolé, qui n'hérite d'aucune feuille de style de la page.
 */
function gabaritPied(pied: string | null | undefined): string {
  const echappe = (pied ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  return `<div style="width:100%;font-size:8px;color:#555;padding:0 10mm;
      font-family:-apple-system,Segoe UI,Roboto,sans-serif;
      display:flex;justify-content:space-between;">
      <span>${echappe}</span>
      <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>`;
}

export async function genererPdfDepuisUrl(
  url: string,
  cookieHeader?: string | null,
  options: OptionsPdf = {},
): Promise<Buffer> {
  const navigateur = await lancerNavigateur();
  try {
    const page = await navigateur.newPage();
    // Le cookie de session de la requête entrante est réémis : Chromium est donc
    // authentifié EXACTEMENT comme l'appelant, jamais davantage.
    if (cookieHeader) await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    const reponse = await page.goto(url, { waitUntil: "networkidle0" });
    if (!reponse || !reponse.ok()) {
      throw new Error(`Document introuvable (${reponse?.status() ?? "pas de réponse"})`);
    }
    const pdf = await page.pdf({
      format: "A4",
      landscape: options.paysage === true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: gabaritPied(options.pied),
      // La marge basse loge le pied paginé ; sans elle, il chevaucherait le contenu.
      margin: { top: "12mm", right: "10mm", bottom: "16mm", left: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await navigateur.close();
  }
}

/** Nom de fichier sûr : jamais d'accent ni de séparateur venu d'une saisie utilisateur. */
export function nomFichierChantier(chantier: string, entreprise: string | null): string {
  const assainir = (valeur: string) =>
    valeur.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  const base = entreprise
    ? `reserves-${assainir(chantier)}-${assainir(entreprise)}`
    : `reserves-${assainir(chantier)}`;
  return `${base}.pdf`;
}
