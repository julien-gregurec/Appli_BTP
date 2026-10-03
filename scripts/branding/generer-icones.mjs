// Génère toutes les déclinaisons d'icônes ELSATIA depuis les fichiers maîtres.
//
// Entrée  : public/branding/source/elsatia-<app>-icon.(svg|png)  (carré, ≥ 1024 px)
//           public/branding/source/marques.json                  (couleur de fond par app)
// Sortie  : public/branding/<app>/elsatia-<app>-icon-<taille>.png, -maskable-<taille>.png,
//           favicon.ico (16/32/48) et output/branding/planche.html (contrôle visuel local).
//
// Le script ne dessine rien : il redimensionne les maîtres officiels. Une application
// sans fichier maître est ignorée et signalée, jamais remplacée par une icône inventée.
//
// Usage : npm run branding:icones [-- --source <dossier>] [-- --sortie <dossier>]
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RACINE = path.resolve(import.meta.dirname, "../..");
const arg = (nom, defaut) => {
  const i = process.argv.indexOf(nom);
  return i > -1 ? path.resolve(process.argv[i + 1]) : defaut;
};
const SOURCE = arg("--source", path.join(RACINE, "public/branding/source"));
const SORTIE = arg("--sortie", path.join(RACINE, "public/branding"));
const PLANCHE = arg("--planche", path.join(RACINE, "output/branding"));

export const APPLICATIONS = ["elsatia", "gestion-pro", "tools", "colors", "studio", "reserves"];
export const TAILLES = [16, 24, 32, 48, 64, 128, 180, 192, 256, 512, 1024];
export const TAILLES_MASKABLE = [192, 512];
export const TAILLES_FAVICON = [16, 32, 48];
// Zone de sécurité maskable (W3C) : cercle de 80 % du côté. Le symbole y est inscrit.
export const ZONE_MASKABLE = 0.8;

// Fichier ICO : en-tête + répertoire + images PNG brutes (format accepté depuis Vista).
export function construireIco(pngs) {
  const entete = Buffer.alloc(6 + 16 * pngs.length);
  entete.writeUInt16LE(0, 0);
  entete.writeUInt16LE(1, 2);
  entete.writeUInt16LE(pngs.length, 4);
  let decalage = entete.length;
  pngs.forEach(({ taille, donnees }, i) => {
    const o = 6 + 16 * i;
    entete.writeUInt8(taille >= 256 ? 0 : taille, o);
    entete.writeUInt8(taille >= 256 ? 0 : taille, o + 1);
    entete.writeUInt16LE(1, o + 4);
    entete.writeUInt16LE(32, o + 6);
    entete.writeUInt32LE(donnees.length, o + 8);
    entete.writeUInt32LE(decalage, o + 12);
    decalage += donnees.length;
  });
  return Buffer.concat([entete, ...pngs.map((p) => p.donnees)]);
}

async function lireMarques() {
  try {
    return JSON.parse(await readFile(path.join(SOURCE, "marques.json"), "utf8"));
  } catch {
    return {};
  }
}

async function genererApplication(app, fichier, fond) {
  const dossier = path.join(SORTIE, app);
  await mkdir(dossier, { recursive: true });
  const maitre = await readFile(fichier);
  const meta = await sharp(maitre).metadata();
  if (meta.format !== "svg" && Math.min(meta.width ?? 0, meta.height ?? 0) < 1024) {
    console.warn(`  ⚠ ${app} : maître ${meta.width}×${meta.height} < 1024 px, les grandes tailles seront floues`);
  }
  const rendre = (taille) =>
    sharp(maitre, { density: 600 }).resize(taille, taille, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

  const fichiers = [];
  for (const taille of TAILLES) {
    const nom = `elsatia-${app}-icon-${taille}.png`;
    await writeFile(path.join(dossier, nom), await rendre(taille));
    fichiers.push(nom);
  }
  for (const taille of TAILLES_MASKABLE) {
    const interieur = Math.round(taille * ZONE_MASKABLE);
    const nom = `elsatia-${app}-icon-maskable-${taille}.png`;
    const image = await sharp({ create: { width: taille, height: taille, channels: 4, background: fond } })
      .composite([{ input: await rendre(interieur), gravity: "center" }])
      .png()
      .toBuffer();
    await writeFile(path.join(dossier, nom), image);
    fichiers.push(nom);
  }
  const ico = construireIco(await Promise.all(TAILLES_FAVICON.map(async (taille) => ({ taille, donnees: await rendre(taille) }))));
  await writeFile(path.join(dossier, "favicon.ico"), ico);
  fichiers.push("favicon.ico");
  return fichiers;
}

function planche(resultats) {
  const relatif = path.relative(PLANCHE, SORTIE).split(path.sep).join("/");
  const ligne = (app, fond) => `<tr style="background:${fond}"><th>${app}</th>${[16, 24, 32, 48, 64, 192, 512]
    .map((t) => `<td><img src="${relatif}/${app}/elsatia-${app}-icon-${t}.png" width="${Math.min(t, 192)}" height="${Math.min(t, 192)}" alt=""></td>`)
    .join("")}<td><img src="${relatif}/${app}/elsatia-${app}-icon-maskable-192.png" width="96" height="96" style="border-radius:50%" alt=""></td></tr>`;
  const lignes = resultats.flatMap(({ app }) => [ligne(app, "#ffffff"), ligne(app, "#0d1b2a")]).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>Planche ELSATIA</title>
<style>body{font:14px system-ui;margin:24px}td,th{padding:8px;text-align:center}th{color:#888}</style>
<h1>Contrôle visuel — famille d'icônes ELSATIA</h1>
<table><tr><th></th><th>16</th><th>24</th><th>32</th><th>48</th><th>64</th><th>192</th><th>512 (réduit)</th><th>maskable</th></tr>
${lignes}</table>`;
}

async function main() {
  const presents = new Set(await readdir(SOURCE).catch(() => []));
  const marques = await lireMarques();
  const resultats = [];
  for (const app of APPLICATIONS) {
    const fichier = [`elsatia-${app}-icon.svg`, `elsatia-${app}-icon.png`].find((nom) => presents.has(nom));
    if (!fichier) {
      console.log(`  – ${app} : aucun fichier maître, ignoré`);
      continue;
    }
    const fond = marques[app]?.fond ?? "#0d1b2a";
    const fichiers = await genererApplication(app, path.join(SOURCE, fichier), fond);
    console.log(`  ✓ ${app} : ${fichiers.length} fichiers`);
    resultats.push({ app, fichiers });
  }
  if (!resultats.length) {
    console.error("Aucun fichier maître trouvé dans", SOURCE);
    process.exitCode = 1;
    return;
  }
  await mkdir(PLANCHE, { recursive: true });
  await writeFile(path.join(PLANCHE, "planche.html"), planche(resultats));
  console.log(`Planche de contrôle : ${path.join(PLANCHE, "planche.html")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) await main();
