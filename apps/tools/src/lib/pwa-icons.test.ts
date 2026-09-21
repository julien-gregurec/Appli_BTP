/**
 * Garde des icones PWA opaques (`scripts/generate-icons.mjs`).
 *
 * Deux exigences distinctes, toutes deux impossibles a tenir avec `icon-512.png` (coins
 * transparents) : iOS compose un `apple-touch-icon` sur du noir, et Android recadre une icone
 * `maskable` avec un masque pouvant aller jusqu'au carre plein. Ces tests verifient que les
 * fichiers versionnes sont bien « full-bleed », que le contenu de l'icone maskable tient dans la
 * zone de securite normalisee (cercle centre de 80 % du cote), et que la geometrie du logo n'a pas
 * derive par rapport a `public/icon.svg`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { AMBER, ICONS, SVG_SIGNATURES, encodePng, rasterize } from "../../scripts/generate-icons.mjs";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");

/** Lecture minimale : l'encodeur n'ecrit qu'un IHDR, un IDAT et des lignes en filtre « None ». */
function decodePng(file: string) {
  const png = readFileSync(join(PUBLIC_DIR, file));
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  const idatLength = png.readUInt32BE(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  const pixels = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    expect(raw[row * (width * 3 + 1)]).toBe(0);
    raw.copy(pixels, row * width * 3, row * (width * 3 + 1) + 1, (row + 1) * (width * 3 + 1));
  }
  return { width, height, colorType, pixels };
}

const pixelAt = (pixels: Buffer, size: number, x: number, y: number) => [...pixels.subarray((y * size + x) * 3, (y * size + x) * 3 + 3)];

describe("icones PWA — geometrie et conformite", () => {
  it("reste alignee sur le trace de icon.svg", () => {
    const svg = readFileSync(join(PUBLIC_DIR, "icon.svg"), "utf8");
    for (const signature of SVG_SIGNATURES) expect(svg).toContain(signature);
  });

  it("produit un PNG opaque, sans canal alpha", () => {
    const png = encodePng(rasterize(16, 1, 1), 16);
    expect(png.readUInt32BE(16)).toBe(16);
    expect(png[25]).toBe(2);
  });

  it("garde le contenu de l'icone maskable dans le cercle de securite de 80 %", () => {
    const size = 512;
    const pixels = rasterize(size, ICONS.find((icon) => icon.file === "icon-maskable-512.png")!.scale);
    const radius = size * 0.4;
    let outside = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= radius) continue;
        if (pixelAt(pixels, size, x, y).every((channel, index) => channel === AMBER[index])) continue;
        outside += 1;
      }
    }
    expect(outside).toBe(0);
  });

  it("remplit les coins jusqu'au bord (full-bleed) et dessine bien le logo", () => {
    const size = 180;
    const pixels = rasterize(size, 1);
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) expect(pixelAt(pixels, size, x, y)).toEqual(AMBER);
    /* Plein milieu de la barre verticale de l'E : navy, donc le trace est bien rasterise. */
    expect(pixelAt(pixels, size, Math.round((160 / 512) * size), Math.round((256 / 512) * size))).toEqual([0x17, 0x2c, 0x3b]);
  });
});

describe("icones PWA — fichiers versionnes", () => {
  for (const icon of ICONS) {
    it(`${icon.file} correspond exactement au rendu du generateur`, () => {
      const decoded = decodePng(icon.file);
      expect([decoded.width, decoded.height, decoded.colorType]).toEqual([icon.size, icon.size, 2]);
      expect(decoded.pixels.equals(rasterize(icon.size, icon.scale))).toBe(true);
    });
  }
});
