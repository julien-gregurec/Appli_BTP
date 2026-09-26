/*
 * Generateur de l'image Open Graph publique d'ELSATIA Tools — sans dependance externe.
 *
 * Pourquoi : les cartes de partage (Open Graph / Twitter) exigent un visuel 1200x630 servi en
 * absolu. Aucune capture d'ecran n'est utilisee : une capture vieillit, ment sur l'etat reel du
 * produit et peut laisser fuiter des donnees. Le visuel se limite donc a la marque : la tuile du
 * logo (meme geometrie que `public/icon.svg`, via `generate-icons.mjs`) et le nom du produit
 * trace au trait. Aucune fausse interface, aucun chiffre, aucun element utilisateur.
 *
 * Rendu : rasterisation directe de primitives (tuile arrondie, segments a bouts ronds) avec
 * sur-echantillonnage, puis encodage PNG 8 bits RGB par `encodePng` de `generate-icons.mjs`.
 * Aucune police n'est chargee : les lettres necessaires (E L S A T I O) sont decrites au trait,
 * ce qui garde la sortie deterministe d'une machine a l'autre.
 *
 * Usage : node scripts/generate-og-image.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AMBER, CREAM, NAVY, blend, distanceToSegment, encodePng, rasterize } from "./generate-icons.mjs";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Dimensions canoniques d'une carte Open Graph « summary_large_image » (ratio 1.91:1). */
export const OG = { file: "og-tools.png", width: 1200, height: 630 };

/* Tuile du logo : meme composition que `icon.svg`, arrondi proportionnel (rx 112 sur 512). */
const TILE = { x: 100, y: 185, size: 260, radius: (112 / 512) * 260 };

/*
 * Alphabet au trait, limite aux sept lettres de « ELSATIA TOOLS ». Repere par glyphe : x de 0 a
 * `width`, y de 0 (hauteur de capitale) a 1 (ligne de base), en cadratins. Chaque `stroke` est une
 * polyligne rendue a bouts ronds, comme les traits de `icon.svg`.
 */
function arcStroke(cx, cy, rx, ry, fromDegrees, toDegrees, steps = 40) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = ((fromDegrees + ((toDegrees - fromDegrees) * index) / steps) * Math.PI) / 180;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
  });
}

const ellipseStroke = (cx, cy, rx, ry, steps = 48) => arcStroke(cx, cy, rx, ry, 0, 360, steps);

export const GLYPHS = {
  E: { width: 0.62, strokes: [[[0.06, 0], [0.06, 1]], [[0.06, 0], [0.60, 0]], [[0.06, 0.5], [0.52, 0.5]], [[0.06, 1], [0.60, 1]]] },
  L: { width: 0.58, strokes: [[[0.06, 0], [0.06, 1]], [[0.06, 1], [0.56, 1]]] },
  /* Deux arcs tangents (bol haut ouvert en bas a droite, bol bas ouvert en haut a gauche). */
  S: { width: 0.62, strokes: [[...arcStroke(0.315, 0.26, 0.245, 0.245, -35, -280, 26), ...arcStroke(0.315, 0.74, 0.245, 0.245, -77, 145, 26)]] },
  A: { width: 0.70, strokes: [[[0.04, 1], [0.35, 0]], [[0.35, 0], [0.66, 1]], [[0.155, 0.63], [0.545, 0.63]]] },
  T: { width: 0.66, strokes: [[[0.03, 0.02], [0.63, 0.02]], [[0.33, 0.02], [0.33, 1]]] },
  I: { width: 0.26, strokes: [[[0.13, 0], [0.13, 1]]] },
  O: { width: 0.74, strokes: [ellipseStroke(0.37, 0.5, 0.31, 0.5)] },
};

/** Largeur d'un mot en cadratins, interlettrage compris. Sert aussi a verifier la mise en page. */
export function wordWidth(word, tracking) {
  return [...word].reduce((total, letter) => total + GLYPHS[letter].width, 0) + tracking * (word.length - 1);
}

/*
 * Deux mots, deux roles : « ELSATIA » porte la marque (creme, trait fin, interlettrage large),
 * « TOOLS » porte le produit (ambre, trait plein). Les positions sont figees en pixels : le bloc
 * est centre verticalement et aligne a gauche sur la tuile.
 */
const TEXT_X = TILE.x + TILE.size + 72;
export const WORDS = [
  { word: "ELSATIA", x: TEXT_X, y: 156, em: 110, tracking: 0.18, half: 5.5, color: CREAM, alpha: 1 },
  { word: "TOOLS", x: TEXT_X, y: 310, em: 165, tracking: 0.08, half: 10, color: AMBER, alpha: 1 },
];

/*
 * Filigrane geometrique : un cercle et une equerre 3-4-5, les deux figures que les outils gratuits
 * tracent reellement. Volontairement tres discret (12 %) et confine au coin bas droit, hors du
 * bloc de texte.
 */
const WATERMARK = {
  color: CREAM,
  alpha: 0.14,
  half: 3,
  strokes: [ellipseStroke(1160, 620, 120, 120), [[1020, 610], [1150, 610], [1020, 512.5], [1020, 610]]],
};

/** Segments absolus (repere pixel) de toutes les couches au trait, chacun avec sa boite englobante. */
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

/** Couverture de la tuile arrondie au point (x, y) : 1 dedans, 0 dehors, sans anticrenelage. */
function insideRoundedTile(x, y) {
  const { x: left, y: top, size, radius } = TILE;
  const dx = Math.max(left + radius - x, 0, x - (left + size - radius));
  const dy = Math.max(top + radius - y, 0, y - (top + size - radius));
  if (x < left || y < top || x > left + size || y > top + size) return false;
  return Math.hypot(dx, dy) <= radius;
}

export function rasterizeOgImage(samples = 3) {
  const { width, height } = OG;
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
  const png = encodePng(rasterizeOgImage(), OG.width, OG.height);
  writeFileSync(join(APP_DIR, "public", OG.file), png);
  console.log(`[og] ${OG.file} — ${OG.width}x${OG.height}, ${Math.round(png.length / 1024)} ko`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
