/**
 * Génère les écrans de lancement iOS (« splash screens »).
 *
 * Pourquoi ce script existe. Android sait fabriquer son écran de lancement seul, à partir
 * de `background_color` et des icônes du manifeste. iOS, non : sans balises
 * `apple-touch-startup-image`, une PWA installée affiche un RECTANGLE BLANC pendant tout
 * le démarrage. Sur un téléphone de chantier qui n'est pas un modèle récent, cela dure
 * assez longtemps pour qu'on croie l'application plantée et qu'on la relance.
 *
 * iOS choisit l'image par une media query qui doit correspondre EXACTEMENT aux dimensions
 * logiques et à la densité de l'appareil. Une taille manquante, et c'est le blanc qui
 * revient — d'où cette liste explicite plutôt qu'une image unique redimensionnée.
 *
 * Les images sont versées au dépôt : elles sont déterministes, légères (fond uni + logo),
 * et les regénérer à chaque build ferait dépendre le build de `sharp`.
 *
 * Usage : node scripts/mobile/generer-ecrans-lancement.mjs
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const FOND = "#0d1b2a";
const SORTIE = "public/ecrans-lancement";
const SOURCE_LOGO = "public/icons/icon-512.png";

/** [largeur logique, hauteur logique, densité] — portrait. */
const APPAREILS = [
  [375, 667, 2, "iPhone SE, 8"],
  [414, 736, 3, "iPhone 8 Plus"],
  [375, 812, 3, "iPhone X, XS, 11 Pro"],
  [414, 896, 2, "iPhone XR, 11"],
  [414, 896, 3, "iPhone XS Max, 11 Pro Max"],
  [390, 844, 3, "iPhone 12, 13, 14"],
  [428, 926, 3, "iPhone 12/13 Pro Max, 14 Plus"],
  [393, 852, 3, "iPhone 14 Pro, 15, 16"],
  [430, 932, 3, "iPhone 14/15/16 Pro Max"],
  [810, 1080, 2, "iPad 10.2"],
  [834, 1194, 2, "iPad Pro 11"],
  [1024, 1366, 2, "iPad Pro 12.9"],
];

await mkdir(SORTIE, { recursive: true });

const liens = [];
for (const [largeur, hauteur, densite, modele] of APPAREILS) {
  const px = largeur * densite;
  const py = hauteur * densite;
  // Le logo occupe un tiers de la plus petite dimension : lisible sans dominer,
  // et identique en proportion du téléphone à la tablette.
  const cote = Math.round(Math.min(px, py) / 3);
  const logo = await sharp(SOURCE_LOGO).resize(cote, cote, { fit: "contain" }).png().toBuffer();

  const nom = `lancement-${largeur}x${hauteur}@${densite}x.png`;
  await sharp({ create: { width: px, height: py, channels: 4, background: FOND } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(join(SORTIE, nom));

  liens.push(
    `        {/* ${modele} */}\n` +
    `        <link rel="apple-touch-startup-image" href="/ecrans-lancement/${nom}"\n` +
    `          media="(device-width: ${largeur}px) and (device-height: ${hauteur}px) and (-webkit-device-pixel-ratio: ${densite}) and (orientation: portrait)" />`,
  );
  console.log(`${nom.padEnd(34)} ${px}×${py}  ${modele}`);
}

await writeFile(join(SORTIE, "liens.txt"), liens.join("\n") + "\n", "utf8");
console.log(`\n${APPAREILS.length} écrans générés. Balises dans ${SORTIE}/liens.txt`);
