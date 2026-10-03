// Contrôle du logo officiel ELSATIA et génération de ses déclinaisons.
//
//   node scripts/elsatia-logo.mjs            → contrôle + génération dans public/elsatia/genere/
//   node scripts/elsatia-logo.mjs --source <dossier>  → autre dossier source (tests)
//
// Fichiers sources attendus (voir docs/ELSATIA_IDENTITE.md) :
//   logo-officiel.svg   logo complet, vectoriel, fond transparent      (obligatoire)
//   symbole.svg         symbole seul, carré, fond transparent         (obligatoire)
//   logo-officiel-blanc.svg  version négative pour fonds sombres      (recommandé)
// Le script affiche aussi les couleurs dominantes du logo, pour recaler la
// palette provisoire de src/lib/elsatia/marque.ts.
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const i = process.argv.indexOf("--source");
const source = resolve(i > 0 ? process.argv[i + 1] : "public/elsatia");
const sortie = join(source, "genere");
const NUIT = { r: 7, g: 26, b: 61, alpha: 1 }; // fond provisoire (marque.ts)
const erreurs = [];
const avertissements = [];

const fichier = (nom) => join(source, nom);
for (const nom of ["logo-officiel.svg", "symbole.svg"]) if (!existsSync(fichier(nom))) erreurs.push(`fichier manquant : ${fichier(nom)}`);
if (!existsSync(fichier("logo-officiel-blanc.svg"))) avertissements.push("version négative logo-officiel-blanc.svg absente (recommandée pour les fonds bleu nuit)");
if (erreurs.length) {
  console.error(`Logo ELSATIA incomplet :\n- ${erreurs.join("\n- ")}`);
  process.exit(1);
}

const rendu = (nom, largeur) => sharp(fichier(nom), { density: 600 }).resize({ width: largeur });

const meta = await sharp(fichier("symbole.svg")).metadata();
const ratio = meta.width / meta.height;
if (ratio < 0.95 || ratio > 1.05) erreurs.push(`symbole.svg doit être carré (rapport actuel ${ratio.toFixed(2)})`);
const { channels, isOpaque } = await rendu("symbole.svg", 256).png().toBuffer().then((b) => sharp(b).stats());
if (isOpaque || channels.length < 4) avertissements.push("symbole.svg semble avoir un fond opaque : un fond transparent est attendu");
if (erreurs.length) {
  console.error(`Logo ELSATIA non conforme :\n- ${erreurs.join("\n- ")}`);
  process.exit(1);
}

// Couleurs dominantes (pixels opaques, quantification 4 bits par canal).
const { data } = await rendu("logo-officiel.svg", 160).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const compte = new Map();
for (let p = 0; p < data.length; p += 4) {
  if (data[p + 3] < 200) continue;
  const cle = [data[p], data[p + 1], data[p + 2]].map((v) => Math.round(v / 17) * 17);
  const hex = `#${cle.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  compte.set(hex, (compte.get(hex) ?? 0) + 1);
}
const total = [...compte.values()].reduce((a, b) => a + b, 0) || 1;
const dominantes = [...compte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

mkdirSync(sortie, { recursive: true });
const sur = async (nom, cote, echelle, fond) => {
  const interieur = Math.round(cote * echelle);
  const symbole = await rendu(nom, interieur).png().toBuffer();
  return sharp({ create: { width: cote, height: cote, channels: 4, background: fond } }).composite([{ input: symbole, gravity: "center" }]).png();
};
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const blanc = { r: 255, g: 255, b: 255, alpha: 1 };
const taches = [
  // Réseaux sociaux : avatar carré (Facebook 720+, Instagram 320+, LinkedIn 400).
  ["avatar-1080.png", () => sur("symbole.svg", 1080, 0.8, blanc)],
  ["avatar-linkedin-400.png", () => sur("symbole.svg", 400, 0.8, blanc)],
  // Navigateur / PWA.
  ["favicon-32.png", () => sur("symbole.svg", 32, 1, transparent)],
  ["icon-192.png", () => sur("symbole.svg", 192, 1, transparent)],
  ["icon-512.png", () => sur("symbole.svg", 512, 1, transparent)],
  ["icon-maskable-512.png", () => sur("symbole.svg", 512, 0.6, NUIT)],
  ["apple-touch-icon-180.png", () => sur("symbole.svg", 180, 0.72, NUIT)],
  // Logo matriciel de repli et carte de partage (Open Graph).
  ["logo-officiel-2048.png", () => rendu("logo-officiel.svg", 2048).png()],
  ["og-1200x630.png", async () => {
    const nom = existsSync(fichier("logo-officiel-blanc.svg")) ? "logo-officiel-blanc.svg" : "logo-officiel.svg";
    const logo = await rendu(nom, 720).png().toBuffer();
    return sharp({ create: { width: 1200, height: 630, channels: 4, background: NUIT } }).composite([{ input: logo, gravity: "center" }]).png();
  }],
];
for (const [nom, fabriquer] of taches) await (await fabriquer()).toFile(join(sortie, nom));

console.log(`Logo ELSATIA conforme. ${taches.length} déclinaisons générées dans ${sortie}`);
for (const a of avertissements) console.log(`! ${a}`);
console.log("Couleurs dominantes du logo (à reporter dans src/lib/elsatia/marque.ts et globals.css) :");
for (const [hex, n] of dominantes) console.log(`  ${hex}  ${((n / total) * 100).toFixed(1)} %`);
