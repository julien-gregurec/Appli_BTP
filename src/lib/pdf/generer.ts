import "server-only";
import type { Browser } from "puppeteer-core";

// Next.js 16 interdit d'importer react-dom/server dans le code serveur de
// l'App Router ("render or return the content directly as a Server
// Component instead"). On ne rend donc plus DocumentImprimable manuellement :
// Chromium headless navigue vers la page /imprimer/... déjà rendue par le
// pipeline RSC normal de Next.js (la même page que verrait un utilisateur),
// puis l'imprime. Zéro rendu dupliqué, zéro contournement de la restriction.

async function lancerNavigateur(): Promise<Browser> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const { launch } = await import("puppeteer-core");
  return launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}

export async function genererPdfDepuisUrl(url: string, cookieHeader?: string | null): Promise<Buffer> {
  const navigateur = await lancerNavigateur();
  try {
    const page = await navigateur.newPage();
    if (cookieHeader) await page.setExtraHTTPHeaders({ cookie: cookieHeader });
    const reponse = await page.goto(url, { waitUntil: "load" });
    if (!reponse || !reponse.ok()) throw new Error(`Document introuvable (${reponse?.status() ?? "pas de réponse"})`);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await navigateur.close();
  }
}

export function nomFichierPdf(estFacture: boolean, numero: string): string {
  const base = (numero || "document").replace(/[^a-zA-Z0-9-]/g, "-");
  return `${estFacture ? "facture" : "devis"}-${base}.pdf`;
}
