import "server-only";
import type { Browser } from "puppeteer-core";

// Moteur documentaire canonique d'ELSATIA, repris tel quel de Gestion Pro
// (`src/lib/pdf/generer.ts`) : Chromium headless NAVIGUE vers une page déjà rendue par le
// pipeline RSC, puis l'imprime. Aucun rendu dupliqué, aucune mise en page à maintenir en
// double, et surtout : la page imprimée est celle que l'utilisateur peut ouvrir lui-même,
// donc soumise aux mêmes contrôles d'accès.
async function lancerNavigateur(): Promise<Browser> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const { launch } = await import("puppeteer-core");
  return launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export async function genererPdfDepuisUrl(
  url: string,
  cookieHeader?: string | null,
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
      printBackground: true,
      margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
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
