/*
 * Generateur des visuels de fiche Store d'ELSATIA Tools — sans dependance externe.
 *
 * Pourquoi ce script existe : Google Play exige deux visuels que le depot ne contenait pas,
 * l'icone de fiche `512x512` et le visuel principal `1024x500`. Les produire a la main ouvrirait
 * la porte a une identite graphique parallele ; les produire par capture d'ecran donnerait un
 * visuel qui vieillit, ment sur l'etat reel du produit et peut laisser fuiter une donnee.
 *
 * Le parti est donc le meme que `generate-og-image.mjs` : STRICTEMENT la marque existante. Toute
 * la geometrie vient de `public/icon.svg` via `generate-icons.mjs`, et les lettres viennent de
 * l'alphabet au trait deja utilise pour l'image Open Graph. Ce script n'introduit aucune couleur,
 * aucune forme et aucun mot qui ne soient deja dans le depot.
 *
 * Ce qu'il ne fait pas, et ne doit jamais faire : aucune fausse interface, aucune capture d'ecran
 * incrustee, aucun chiffre commercial, aucune promesse de fonction. Le reglement Google Play
 * interdit un visuel principal trompeur, et un chiffre invente serait invérifiable.
 *
 * Sortie : `native-assets/store/` — hors `public/`, car ces fichiers se televersent dans Play
 * Console et n'ont rien a faire dans le bundle servi aux utilisateurs.
 *
 * Usage : node scripts/generate-store-assets.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AMBER, CREAM, NAVY, blend, distanceToSegment, encodePng, rasterize } from "./generate-icons.mjs";
import { GLYPHS } from "./generate-og-image.mjs";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const STORE_DIR = join(APP_DIR, "native-assets", "store");

/*
 * Icone de fiche Google Play. Play accepte un PNG 32 bits, mais l'opacite est preferable : la
 * fiche compose l'icone sur des fonds clairs et sombres selon le theme du Play Store, et un coin
 * transparent y apparaitrait comme un artefact. `scale: 1` reproduit exactement la composition de
 * `icon.svg`, fond plein au lieu du carre arrondi — Play applique lui-meme l'arrondi.
 */
export const PLAY_ICON = { file: "play-icon-512.png", size: 512, scale: 1 };

/* Visuel principal Google Play : dimensions imposees, sans alternative. */
export const FEATURE_GRAPHIC = { file: "play-feature-graphic-1024x500.png", width: 1024, height: 500 };

/*
 * Composition du visuel principal. Google recadre le visuel principal selon le contexte
 * d'affichage : la zone reellement sure est la bande centrale. La tuile et le bloc de texte sont
 * donc centres verticalement, et rien d'informatif ne s'approche des bords.
 */
const TILE = { x: 96, y: 118, size: 264, radius: (112 / 512) * 264 };
const TEXT_X = TILE.x + TILE.size + 76;

/*
 * Deux mots, memes roles que sur l'image Open Graph : « ELSATIA » porte la marque (creme, trait
 * fin, interlettrage large), « TOOLS » porte le produit (ambre, trait plein). Aucun slogan n'est
 * incruste : un texte grave dans le visuel ne se traduit pas et se perime avec la fiche.
 */
export const WORDS = [
  { word: "ELSATIA", x: TEXT_X, y: 150, em: 86, tracking: 0.18, half: 4.5, color: CREAM, alpha: 1 },
  { word: "TOOLS", x: TEXT_X, y: 268, em: 128, tracking: 0.08, half: 8, color: AMBER, alpha: 1 },
];

/*
 * Filigrane : le cercle et l'equerre 3-4-5, les deux figures que les outils gratuits tracent
 * reellement. Meme parti que l'image Open Graph, tres discret et confine au coin bas droit, hors
 * du bloc de texte. C'est la seule illustration, et elle ne represente rien de faux.
 */
const WATERMARK = {
  color: CREAM,
  alpha: 0.13,
  half: 2.5,
  strokes: [
    Array.from({ length: 49 }, (_, index) => {
      const angle = ((index * 360) / 48) * (Math.PI / 180);
      return [944 + 104 * Math.cos(angle), 470 + 104 * Math.sin(angle)];
    }),
    [[818, 462], [922, 462], [818, 384], [818, 462]],
  ],
};

/** Segments absolus (repere pixel) des couches au trait, chacun avec sa boite englobante. */
export function buildStrokeLayers() {
  const layers = [];
  const push = (points, { half, color, alpha }) => {
    for (let index = 0; index < points.length - 1; index += 1) {
      const segment = [points[index], points[index + 1]];
      const [[ax, ay], [bx, by]] = segment;
      layers.push({ segment, half, color, alpha, box: [Math.min(ax, bx) - half, Math.min(ay, by) - half, Math.max(ax, bx) + half, Math.max(ay, by) + half] });
    }
  };
  for (const stroke of WATERMARK.strokes) push(stroke, WATERMARK);
  for (const { word, x, y, em, tracking, half, color, alpha } of WORDS) {
    let pen = x;
    for (const letter of word) {
      const glyph = GLYPHS[letter];
      for (const stroke of glyph.strokes) push(stroke.map(([gx, gy]) => [pen + gx * em, y + gy * em]), { half, color, alpha });
      pen += (glyph.width + tracking) * em;
    }
  }
  return layers;
}

/** Couverture de la tuile arrondie au point (x, y) : 1 dedans, 0 dehors. */
function insideRoundedTile(x, y) {
  const { x: left, y: top, size, radius } = TILE;
  const dx = Math.max(left + radius - x, 0, x - (left + size - radius));
  const dy = Math.max(top + radius - y, 0, y - (top + size - radius));
  if (x < left || y < top || x > left + size || y > top + size) return false;
  return Math.hypot(dx, dy) <= radius;
}

export function rasterizeFeatureGraphic(samples = 3) {
  const { width, height } = FEATURE_GRAPHIC;
  const layers = buildStrokeLayers();
  /* Le logo est rasterise une seule fois par le generateur d'icones, puis colle dans la tuile. */
  const tile = rasterize(TILE.size, 1);
  const pixels = Buffer.alloc(width * height * 3);
  const step = 1 / samples;

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      /* Filtrage par boite englobante au niveau du pixel : evite de tester chaque trait 9 fois. */
      const candidates = layers.filter((layer) => px + 1 >= layer.box[0] && py + 1 >= layer.box[1] && px <= layer.box[2] && py <= layer.box[3]);
      const accumulator = [0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = px + (sx + 0.5) * step;
          const y = py + (sy + 0.5) * step;
          let color = NAVY;
          if (insideRoundedTile(x, y)) {
            const offset = ((Math.min(TILE.size - 1, Math.floor(y - TILE.y)) * TILE.size) + Math.min(TILE.size - 1, Math.floor(x - TILE.x))) * 3;
            color = [tile[offset], tile[offset + 1], tile[offset + 2]];
          }
          for (const layer of candidates) {
            if (distanceToSegment(x, y, layer.segment) <= layer.half) color = blend(color, layer.color, layer.alpha);
          }
          accumulator[0] += color[0];
          accumulator[1] += color[1];
          accumulator[2] += color[2];
        }
      }
      const offset = (py * width + px) * 3;
      for (let channel = 0; channel < 3; channel += 1) pixels[offset + channel] = Math.round(accumulator[channel] / (samples * samples));
    }
  }
  return pixels;
}

function main() {
  mkdirSync(STORE_DIR, { recursive: true });

  const icon = encodePng(rasterize(PLAY_ICON.size, PLAY_ICON.scale), PLAY_ICON.size);
  writeFileSync(join(STORE_DIR, PLAY_ICON.file), icon);
  console.log(`[store] ${PLAY_ICON.file} — ${PLAY_ICON.size}x${PLAY_ICON.size}, ${Math.round(icon.length / 1024)} ko`);

  const feature = encodePng(rasterizeFeatureGraphic(), FEATURE_GRAPHIC.width, FEATURE_GRAPHIC.height);
  writeFileSync(join(STORE_DIR, FEATURE_GRAPHIC.file), feature);
  console.log(`[store] ${FEATURE_GRAPHIC.file} — ${FEATURE_GRAPHIC.width}x${FEATURE_GRAPHIC.height}, ${Math.round(feature.length / 1024)} ko`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
