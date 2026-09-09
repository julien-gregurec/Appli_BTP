/*
 * Génération des icônes PNG d'ELSATIA Colors à partir des sources SVG.
 *
 * Pourquoi des PNG alors que le manifeste déclarait déjà des SVG : Chrome sait
 * lire une icône SVG `sizes="any"`, mais iOS ne le sait pas. Un « Sur l'écran
 * d'accueil » depuis Safari, sans `apple-touch-icon` PNG, produit une vignette
 * générée automatiquement — une capture de la page — au lieu de l'icône de
 * l'application. Pour un outil de terrain destiné à vivre sur l'écran d'accueil
 * d'un téléphone, c'est la première chose que l'on voit.
 *
 * Les SVG restent déclarés en tête du manifeste : ils restent nets à toute
 * taille là où ils sont compris. Les PNG sont le repli, pas le remplacement.
 *
 * Ce script est exécuté à la main après une modification des SVG, et non au
 * build : les icônes sont des fichiers versionnés, et un build ne doit pas
 * produire de fichiers qui divergent silencieusement de ce qui est en dépôt.
 *
 *     node scripts/generer-icones.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const racine = fileURLToPath(new URL("../public/icons/", import.meta.url));

/** `apple-touch-icon` est opaque et sans transparence : iOS applique son propre masque. */
const CIBLES = [
  { source: "colors-icon.svg", sortie: "colors-icon-192.png", taille: 192 },
  { source: "colors-icon.svg", sortie: "colors-icon-512.png", taille: 512 },
  { source: "colors-maskable.svg", sortie: "colors-maskable-512.png", taille: 512 },
  { source: "colors-icon.svg", sortie: "colors-apple-touch.png", taille: 180 },
];

for (const cible of CIBLES) {
  const svg = readFileSync(`${racine}${cible.source}`);
  const png = await sharp(svg, { density: 384 })
    .resize(cible.taille, cible.taille, { fit: "contain", background: { r: 68, g: 38, b: 77, alpha: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(`${racine}${cible.sortie}`, png);
  console.log(`${cible.sortie} — ${cible.taille}px, ${png.length} octets`);
}
