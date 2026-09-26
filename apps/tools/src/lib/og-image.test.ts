/**
 * Garde de l'image Open Graph versionnée (`scripts/generate-og-image.mjs`).
 *
 * Une carte de partage cassée ne se voit pas depuis l'application : elle ne se voit que dans le
 * message déjà envoyé. Ces tests vérifient donc que le fichier commité est bien celui que produit
 * le générateur, aux dimensions annoncées dans les métadonnées, et que le visuel reste un visuel
 * de marque — aucune capture d'interface, aucune donnée.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { OG, WORDS, buildStrokeLayers, rasterizeOgImage, wordWidth } from "../../scripts/generate-og-image.mjs";
import { NAVY } from "../../scripts/generate-icons.mjs";
import { OG_IMAGE } from "./seo";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");

/** Lecture minimale : l'encodeur n'écrit qu'un IHDR, un IDAT et des lignes en filtre « None ». */
function decodePng(file: string) {
  const png = readFileSync(join(PUBLIC_DIR, file));
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const idatLength = png.readUInt32BE(33);
  const raw = inflateSync(png.subarray(41, 41 + idatLength));
  const pixels = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    expect(raw[row * (width * 3 + 1)]).toBe(0);
    raw.copy(pixels, row * width * 3, row * (width * 3 + 1) + 1, (row + 1) * (width * 3 + 1));
  }
  return { width, height, colorType: png[25], bytes: png.length, pixels };
}

describe("image Open Graph", () => {
  const decoded = decodePng(OG.file);

  it("est servie au format annoncé par les métadonnées", () => {
    expect(OG_IMAGE.path).toBe(`/${OG.file}`);
    expect([OG_IMAGE.width, OG_IMAGE.height]).toEqual([OG.width, OG.height]);
    expect([decoded.width, decoded.height]).toEqual([OG.width, OG.height]);
    /* Type couleur 2 : RGB sans canal alpha, donc opaque — les aperçus ne composent pas d'alpha. */
    expect(decoded.colorType).toBe(2);
  });

  it("reste légère : une carte de partage ne doit pas retarder l'aperçu", () => {
    expect(decoded.bytes).toBeLessThan(300 * 1024);
  });

  it("correspond exactement au rendu du générateur", () => {
    expect(decoded.pixels.equals(rasterizeOgImage())).toBe(true);
  });

  it("garde les quatre coins sur le fond de marque : pas de capture, pas de bord parasite", () => {
    const corner = (x: number, y: number) => [...decoded.pixels.subarray((y * OG.width + x) * 3, (y * OG.width + x) * 3 + 3)];
    for (const [x, y] of [[0, 0], [OG.width - 1, 0], [0, OG.height - 1], [OG.width - 1, OG.height - 1]]) {
      expect(corner(x, y)).toEqual(NAVY);
    }
  });

  it("tient la composition dans le cadre, sans mot qui déborde", () => {
    for (const { word, x, em, tracking } of WORDS) {
      expect(x + wordWidth(word, tracking) * em).toBeLessThan(OG.width - 100);
    }
    for (const layer of buildStrokeLayers()) {
      const [left, top, right, bottom] = layer.box;
      expect(left).toBeGreaterThan(-OG.width);
      expect(right).toBeLessThan(OG.width + 200);
      expect(top).toBeGreaterThan(-OG.height);
      expect(bottom).toBeLessThan(OG.height + 200);
    }
  });
});
