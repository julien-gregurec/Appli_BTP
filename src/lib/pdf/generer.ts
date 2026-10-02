import "server-only";
import type { Browser } from "puppeteer-core";
import { cookiesPourUrl } from "./cookies";
import { creerFilePdf, DelaiPdfError as DelaiPdfErrorInterne, MARQUEUR_PROPRIETAIRE, SaturationPdfError as SaturationPdfErrorInterne, optionsDepuisEnv, type FilePdf, type NavigateurGere } from "./file-pdf";

// Next.js 16 interdit d'importer react-dom/server dans le code serveur de
// l'App Router ("render or return the content directly as a Server
// Component instead"). On ne rend donc plus DocumentImprimable manuellement :
// Chromium headless navigue vers la page /imprimer/... déjà rendue par le
// pipeline RSC normal de Next.js (la même page que verrait un utilisateur),
// puis l'imprime. Zéro rendu dupliqué, zéro contournement de la restriction.
//
// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 : chaque génération passe par une file (concurrence
// plafonnée, attente bornée, délai global, arrêt forcé, nettoyage garanti) — voir file-pdf.ts.

export { AnnulationPdfError, DelaiPdfError, SaturationPdfError } from "./file-pdf";

export async function lancerNavigateur(signal: AbortSignal): Promise<NavigateurGere<Browser>> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const { launch } = await import("puppeteer-core");
  const navigateur = await launch({
    args: [...chromium.args, `${MARQUEUR_PROPRIETAIRE}${process.pid}`],
    executablePath: process.env.PDF_CHROMIUM_EXECUTABLE || (await chromium.executablePath()),
    headless: true,
    // Transport par tube : si le processus Node meurt sans nettoyer (SIGKILL, OOM), le tube se
    // ferme et Chromium s'arrête de lui-même au lieu de rester rattaché à init.
    pipe: true,
    // Arrêt du processus géré par la file (gestionnaire 'exit' unique, en plus de celui de
    // puppeteer) : pas de gestionnaires SIGINT/SIGTERM/SIGHUP par lancement, qui
    // s'empileraient sur le processus et retarderaient l'arrêt de Next.
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    signal,
  });
  return { navigateur, pid: navigateur.process()?.pid ?? null, fermer: () => navigateur.close() };
}

// Une seule file par processus, même si le module est évalué dans plusieurs bundles (routes).
const CLE = Symbol.for("elsatia.pdf.file");
type Global = typeof globalThis & { [CLE]?: FilePdf<Browser> };
export function filePdf(): FilePdf<Browser> {
  const global = globalThis as Global;
  if (!global[CLE]) {
    const file = creerFilePdf<Browser>(lancerNavigateur, optionsDepuisEnv());
    global[CLE] = file;
    // Arrêt du serveur (process.exit après SIGTERM/SIGINT, fin normale) : tout Chromium encore
    // vivant est tué de façon synchrone. Un arrêt brutal (SIGKILL) est couvert par le tube et
    // par le balayage des orphelins au lancement suivant.
    process.once("exit", () => file.tuerTout());
  }
  return global[CLE];
}

export function etatFilePdf() {
  return filePdf().etat();
}

export async function genererPdfDepuisUrl(url: string, cookieHeader?: string | null, options: { signal?: AbortSignal } = {}): Promise<Buffer> {
  const file = filePdf();
  const { dureeMaxMs } = file.etat().options;
  return file.executer(async (navigateur, signal) => {
    const page = await navigateur.newPage();
    page.setDefaultTimeout(dureeMaxMs);
    if (cookieHeader) {
      const cookies = cookiesPourUrl(cookieHeader, url);
      if (cookies.length > 0) await page.setCookie(...cookies);
    }
    const reponse = await page.goto(url, { waitUntil: "load", signal });
    if (!reponse || !reponse.ok()) throw new Error(`Document introuvable (${reponse?.status() ?? "pas de réponse"})`);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      timeout: dureeMaxMs,
    });
    return Buffer.from(pdf);
  }, options.signal);
}

export function nomFichierPdf(estFacture: boolean, numero: string): string {
  const base = (numero || "document").replace(/[^a-zA-Z0-9-]/g, "-");
  return `${estFacture ? "facture" : "devis"}-${base}.pdf`;
}

/**
 * Réponse d'erreur d'une route PDF : 503 + Retry-After quand la file est saturée (le client peut
 * réessayer), 504 sur délai, sinon le statut d'échec historique de la route.
 */
export function reponseErreurPdf(erreur: unknown, statutEchec: number, messageEchec: string): Response {
  if (erreur instanceof SaturationPdfErrorInterne) {
    return Response.json({ error: erreur.message }, { status: 503, headers: { "Retry-After": "10", "Cache-Control": "no-store" } });
  }
  if (erreur instanceof DelaiPdfErrorInterne) {
    return Response.json({ error: "Génération du PDF trop longue, réessayez" }, { status: 504, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ error: messageEchec }, { status: statutEchec });
}
