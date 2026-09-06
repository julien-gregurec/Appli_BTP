/*
 * Generateur d'icones PWA opaques ELSATIA Tools — sans dependance externe.
 *
 * Pourquoi : `icon-192.png` et `icon-512.png` sont des carres arrondis a coins TRANSPARENTS.
 * iOS compose un `apple-touch-icon` sur du noir (coins noirs autour du logo) et Android recadre
 * une icone `maskable` avec un masque qui peut aller jusqu'au carre plein (coins vides). Les deux
 * usages exigent un fond « full-bleed » opaque, que ce script produit a partir de la SEULE
 * geometrie du logo ELSATIA existant (`public/icon.svg`) — aucun nouveau parti graphique.
 *
 * Rendu : rasterisation directe des primitives (polygone de l'E, capsules du trait et des fleches)
 * avec sur-echantillonnage 4x4, puis encodage PNG 8 bits RGB via `node:zlib`. Deterministe.
 *
 * Usage : node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Couleurs et coordonnees reprises telles quelles de `public/icon.svg` (viewBox 0 0 512 512). */
export const AMBER = [0xf5, 0xaa, 0x22];
const NAVY = [0x17, 0x2c, 0x3b];
const CREAM = [0xff, 0xf7, 0xe4];
/* `M130 116h252v64H200v44h154v62H200v46h188v64H130V116Z` */
export const E_POLYGON = [[130, 116], [382, 116], [382, 180], [200, 180], [200, 224], [354, 224], [354, 286], [200, 286], [200, 332], [388, 332], [388, 396], [130, 396]];
/* `M348 88v336`, stroke-width 20, opacity .88 */
const RULE = { segments: [[[348, 88], [348, 424]]], half: 10, color: CREAM, alpha: 0.88 };
/* `m326 126 22-38 22 38` et `M326 386 22 38 22-38`, stroke-width 16 */
const ARROWS = { segments: [[[326, 126], [348, 88]], [[348, 88], [370, 126]], [[326, 386], [348, 424]], [[348, 424], [370, 386]]], half: 8, color: CREAM, alpha: 1 };

/* Les fragments de `icon.svg` dont ce script depend : un test verifie qu'ils n'ont pas derive. */
export const SVG_SIGNATURES = ["M130 116h252v64H200v44h154v62H200v46h188v64H130V116Z", "M348 88v336", "m326 126 22-38 22 38M326 386l22 38 22-38"];

function insidePolygon(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(x, y, [[ax, ay], [bx, by]]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

function blend(base, color, alpha) {
  return [0, 1, 2].map((channel) => base[channel] + (color[channel] - base[channel]) * alpha);
}

/*
 * `scale` : facteur applique au logo autour du centre. 1 reproduit la composition de `icon.svg`
 * (fond plein au lieu du carre arrondi) ; une valeur < 1 recule le logo dans la zone de securite
 * exigee par les icones maskable (cercle centre de 80 % du cote).
 */
export function rasterize(size, scale, samples = 4) {
  const pixels = Buffer.alloc(size * size * 3);
  const step = 1 / samples;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const accumulator = [0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          /* Repasse du pixel vers le repere SVG : inverse de px = size/2 + (x - 256) * k. */
          const k = (size / 512) * scale;
          const x = 256 + (px + (sx + 0.5) * step - size / 2) / k;
          const y = 256 + (py + (sy + 0.5) * step - size / 2) / k;
          let color = AMBER;
          if (insidePolygon(E_POLYGON, x, y)) color = NAVY;
          for (const layer of [RULE, ARROWS]) {
            if (layer.segments.some((segment) => distanceToSegment(x, y, segment) <= layer.half)) color = blend(color, layer.color, layer.alpha);
          }
          accumulator[0] += color[0];
          accumulator[1] += color[1];
          accumulator[2] += color[2];
        }
      }
      const offset = (py * size + px) * 3;
      for (let channel = 0; channel < 3; channel += 1) pixels[offset + channel] = Math.round(accumulator[channel] / (samples * samples));
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; /* profondeur 8 bits */
  header[9] = 2; /* type couleur 2 : RGB sans alpha, donc opaque par construction */
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let row = 0; row < size; row += 1) {
    raw[row * (size * 3 + 1)] = 0; /* filtre None : sortie stable et lisible */
    pixels.copy(raw, row * (size * 3 + 1) + 1, row * size * 3, (row + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* `apple-touch-icon` : iOS applique lui-meme l'arrondi, on lui donne la composition d'origine. */
/* `icon-maskable-512` : recul a 72 % pour tenir tres largement dans le cercle de securite 80 %. */
export const ICONS = [
  { file: "apple-touch-icon.png", size: 180, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, scale: 0.72 },
];

function main() {
  const svg = readFileSync(join(APP_DIR, "public", "icon.svg"), "utf8");
  for (const signature of SVG_SIGNATURES) {
    if (!svg.includes(signature)) throw new Error(`icon.svg a change : le trace « ${signature} » n'y est plus, regenerer la geometrie du script`);
  }
  for (const icon of ICONS) {
    const png = encodePng(rasterize(icon.size, icon.scale), icon.size);
    writeFileSync(join(APP_DIR, "public", icon.file), png);
    console.log(`[icons] ${icon.file} — ${icon.size}px, ${Math.round(png.length / 1024)} ko`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
