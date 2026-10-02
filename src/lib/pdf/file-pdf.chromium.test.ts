import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnnulationPdfError, chromiumsOrphelins, creerFilePdf, DelaiPdfError, MARQUEUR_PROPRIETAIRE, type OptionsFilePdf } from "./file-pdf";
import { lancerNavigateur } from "./generer";

// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 — file PDF sur un VRAI Chromium (celui de production,
// @sparticuz/chromium, mêmes drapeaux que generer.ts). Opt-in : PDF_CHROMIUM_TESTS=1 (Linux, ~1 min).
// Chaque scénario vérifie qu'aucun Chromium marqué ne survit (balayage de /proc).
const actif = process.env.PDF_CHROMIUM_TESTS === "1";
const RACINE = join(__dirname, "..", "..", "..");
const attendre = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Processus Chromium marqués par un propriétaire donné (pid Node). */
function chromiumsDe(proprietaire: number): number[] {
  return readdirSync("/proc").filter((nom) => /^\d+$/.test(nom)).filter((nom) => {
    try {
      return readFileSync(`/proc/${nom}/cmdline`, "utf8").split("\0").includes(`${MARQUEUR_PROPRIETAIRE}${proprietaire}`);
    } catch {
      return false;
    }
  }).map(Number);
}
const vivant = (pid: number) => { try { process.kill(pid, 0); return !readFileSync(`/proc/${pid}/stat`, "utf8").includes(") Z "); } catch { return false; } };
async function attendreQue(condition: () => boolean, ms: number) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { if (condition()) return true; await attendre(100); }
  return condition();
}

let serveur: Server;
let base = "";
beforeAll(async () => {
  if (!actif) return;
  serveur = createServer((requete, reponse) => {
    if (requete.url === "/lent") return; // ne répond jamais
    reponse.writeHead(200, { "content-type": "text/html" });
    reponse.end(`<html><body><h1>Devis</h1>${"<p>ligne</p>".repeat(500)}</body></html>`);
  });
  await new Promise<void>((resolve) => serveur.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});
afterAll(() => serveur?.close());

function file(options: Partial<OptionsFilePdf> = {}) {
  return creerFilePdf<Browser>(lancerNavigateur, { concurrence: 2, fileMax: 10, attenteMaxMs: 30_000, dureeMaxMs: 20_000, delaiFermetureMs: 3_000, ...options }, () => undefined);
}
const imprimer = (url: string) => async (navigateur: Browser, signal: AbortSignal) => {
  const page = await navigateur.newPage();
  const reponse = await page.goto(url, { waitUntil: "load", signal });
  if (!reponse?.ok()) throw new Error(`HTTP ${reponse?.status()}`);
  return Buffer.from(await page.pdf({ format: "A4" }));
};

describe.skipIf(!actif)("file PDF — vrai Chromium", { timeout: 120_000 }, () => {
  it("succès : PDF valide, aucun Chromium restant", async () => {
    const f = file();
    const pdf = await f.executer(imprimer(`${base}/ok`));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(chromiumsDe(process.pid)).toEqual([]);
    expect(f.etat().compteurs).toMatchObject({ succes: 1, tuesForce: 0 });
  });

  it("concurrence réelle plafonnée à 2 navigateurs pour 6 PDF simultanés", async () => {
    const f = file({ concurrence: 2 });
    let max = 0;
    const sonde = setInterval(() => { max = Math.max(max, chromiumsDe(process.pid).length); }, 50);
    const pdfs = await Promise.all(Array.from({ length: 6 }, () => f.executer(imprimer(`${base}/ok`))));
    clearInterval(sonde);
    expect(pdfs.every((pdf) => pdf.length > 1000)).toBe(true);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(2);
    expect(chromiumsDe(process.pid)).toEqual([]);
  });

  it("délai : page qui ne répond pas → DelaiPdfError, Chromium tué", async () => {
    const f = file({ dureeMaxMs: 3_000 });
    await expect(f.executer(imprimer(`${base}/lent`))).rejects.toBeInstanceOf(DelaiPdfError);
    expect(await attendreQue(() => chromiumsDe(process.pid).length === 0, 5_000)).toBe(true);
    expect(f.etat()).toMatchObject({ actifs: 0, navigateursVivants: 0 });
  });

  it("échec de navigation (connexion refusée) : erreur, Chromium fermé", async () => {
    const f = file();
    const libre = createServer();
    await new Promise<void>((resolve) => libre.listen(0, "127.0.0.1", resolve));
    const port = (libre.address() as AddressInfo).port;
    await new Promise((resolve) => libre.close(resolve));
    await expect(f.executer(imprimer(`http://127.0.0.1:${port}/ferme`))).rejects.toThrow(/ERR_CONNECTION_REFUSED/);
    expect(chromiumsDe(process.pid)).toEqual([]);
    expect(f.etat().compteurs.echec).toBe(1);
  });

  it("crash du navigateur (SIGKILL externe pendant la génération) : erreur, place rendue, aucun reste", async () => {
    const f = file();
    const enCours = f.executer(imprimer(`${base}/lent`));
    expect(await attendreQue(() => chromiumsDe(process.pid).length > 0, 15_000)).toBe(true);
    for (const pid of chromiumsDe(process.pid)) process.kill(pid, "SIGKILL");
    await expect(enCours).rejects.toThrow();
    expect(await attendreQue(() => chromiumsDe(process.pid).length === 0, 5_000)).toBe(true);
    expect(f.etat()).toMatchObject({ actifs: 0, navigateursVivants: 0 });
    // La file reste utilisable après un crash.
    await expect(f.executer(imprimer(`${base}/ok`))).resolves.toBeInstanceOf(Buffer);
  });

  it("annulation par l'appelant (client déconnecté) : AnnulationPdfError, Chromium tué", async () => {
    const f = file();
    const controleur = new AbortController();
    const enCours = f.executer(imprimer(`${base}/lent`), controleur.signal);
    expect(await attendreQue(() => chromiumsDe(process.pid).length > 0, 15_000)).toBe(true);
    controleur.abort();
    await expect(enCours).rejects.toBeInstanceOf(AnnulationPdfError);
    expect(await attendreQue(() => chromiumsDe(process.pid).length === 0, 5_000)).toBe(true);
  });

  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    it(`arrêt du serveur (${signal}) pendant une génération : aucun Chromium orphelin`, async () => {
      const enfant = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", join(RACINE, "scripts/perf/capacity/pdf-enfant.mjs"), `${base}/lent`], { cwd: RACINE, stdio: ["ignore", "pipe", "inherit"] });
      const pidChromium = await new Promise<number>((resolve, reject) => {
        enfant.stdout!.on("data", (morceau: Buffer) => { const m = /PRET (\d+)/.exec(morceau.toString()); if (m) resolve(Number(m[1])); });
        enfant.once("exit", () => reject(new Error("enfant terminé avant le lancement")));
      });
      expect(vivant(pidChromium)).toBe(true);
      const fin = new Promise((resolve) => enfant.once("exit", resolve));
      enfant.kill(signal);
      await fin;
      // SIGTERM : gestionnaire 'exit' (SIGKILL du groupe). SIGKILL : le tube se ferme, Chromium
      // s'arrête seul ; à défaut, le balayage des orphelins (propriétaire mort) le retrouve.
      const arreteSeul = await attendreQue(() => !vivant(pidChromium) && chromiumsDe(enfant.pid!).filter(vivant).length === 0, 10_000);
      if (!arreteSeul) {
        expect(chromiumsOrphelins()).toContain(pidChromium);
        for (const pid of chromiumsOrphelins()) process.kill(-pid, "SIGKILL");
      }
      console.info(`[pdf] arrêt ${signal} : Chromium ${arreteSeul ? "arrêté sans intervention" : "retrouvé par le balayage des orphelins"}`);
      expect(await attendreQue(() => chromiumsDe(enfant.pid!).filter(vivant).length === 0, 5_000)).toBe(true);
      expect(arreteSeul).toBe(true);
    });
  }
});
