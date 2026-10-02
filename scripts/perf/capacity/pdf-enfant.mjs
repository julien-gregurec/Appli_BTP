// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 — processus « serveur » minimal pour les tests d'arrêt.
//
// Reproduit exactement le montage de src/lib/pdf/generer.ts (même file, mêmes options de
// lancement : tube, marqueur propriétaire, pas de gestionnaires de signaux puppeteer, gestionnaire
// 'exit' unique) et, comme `next start`, sort par process.exit() sur SIGTERM/SIGINT. Lance une
// génération qui ne se termine jamais (page qui ne répond pas), écrit « PRET <pid chromium> » sur
// stdout, puis attend d'être arrêté par le test (SIGTERM ou SIGKILL).
//
// Usage : node --experimental-strip-types pdf-enfant.mjs <url-qui-ne-repond-pas>
// Contre-preuve : ANCIEN_MONTAGE=1 lance Chromium comme avant (WebSocket, sans tube ni marqueur).
import chromium from "@sparticuz/chromium";
import { launch } from "puppeteer-core";
import { creerFilePdf, MARQUEUR_PROPRIETAIRE } from "../../../src/lib/pdf/file-pdf.ts";

const url = process.argv[2];
const file = creerFilePdf(async (signal) => {
  const navigateur = await launch({
    args: process.env.ANCIEN_MONTAGE ? [...chromium.args, "--elsatia-contre-preuve"] : [...chromium.args, `${MARQUEUR_PROPRIETAIRE}${process.pid}`],
    executablePath: process.env.PDF_CHROMIUM_EXECUTABLE || (await chromium.executablePath()),
    headless: true,
    pipe: !process.env.ANCIEN_MONTAGE,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    signal,
  });
  const pid = navigateur.process()?.pid ?? null;
  process.stdout.write(`PRET ${pid}\n`);
  return { navigateur, pid, fermer: () => navigateur.close() };
}, { concurrence: 2, fileMax: 2, attenteMaxMs: 60_000, dureeMaxMs: 120_000, delaiFermetureMs: 3_000 }, () => undefined);

process.once("exit", () => file.tuerTout());
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => process.exit(0));

file.executer(async (navigateur) => {
  const page = await navigateur.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 0 });
}).catch(() => undefined);
setInterval(() => undefined, 1_000);
