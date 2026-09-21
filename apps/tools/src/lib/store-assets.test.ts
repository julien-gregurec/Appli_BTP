/**
 * Garde des visuels de fiche Store versionnés (`scripts/generate-store-assets.mjs`).
 *
 * Ces deux fichiers ne sont jamais servis par l'application : ils se televersent a la main dans
 * Google Play Console. Personne ne les regarde donc au quotidien, et une derive n'y serait vue
 * qu'au moment du depot — c'est-a-dire trop tard. Ces tests verrouillent les trois choses que la
 * console refuse : des dimensions autres que celles qu'elle impose, un fichier qui ne correspond
 * plus a son generateur, et un visuel principal qui deborde de son cadre.
 *
 * Ils verrouillent aussi le parti editorial : le visuel reste un visuel de MARQUE. Les quatre
 * coins doivent rester sur le fond, ce qui exclut mecaniquement une capture d'ecran collee, un
 * cadre parasite ou un bandeau de texte plein cadre.
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURE_GRAPHIC, PLAY_ICON, STORE_DIR, WORDS, buildStrokeLayers, rasterizeFeatureGraphic } from "../../scripts/generate-store-assets.mjs";
import { NAVY, rasterize } from "../../scripts/generate-icons.mjs";
import { wordWidth } from "../../scripts/generate-og-image.mjs";

/** Lecture minimale : l'encodeur n'écrit qu'un IHDR, un IDAT et des lignes en filtre « None ». */
function decodePng(file: string) {
  const png = readFileSync(join(STORE_DIR, file));
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

describe("icône de fiche Google Play", () => {
  const decoded = decodePng(PLAY_ICON.file);

  it("respecte le format imposé par Play Console : 512 × 512, sans canal alpha", () => {
    expect([decoded.width, decoded.height]).toEqual([512, 512]);
    /*
     * Play accepte un PNG 32 bits, mais la fiche compose l'icone sur un fond clair OU sombre selon
     * le theme du visiteur : un coin transparent y apparaitrait comme un artefact. Type couleur 2
     * = RGB sans alpha, donc opaque par construction.
     */
    expect(decoded.colorType).toBe(2);
    expect(decoded.bytes).toBeLessThan(1024 * 1024);
  });

  it("est exactement l'identité existante, sans retouche", () => {
    expect(decoded.pixels.equals(rasterize(PLAY_ICON.size, PLAY_ICON.scale))).toBe(true);
  });
});

describe("visuel principal Google Play", () => {
  const decoded = decodePng(FEATURE_GRAPHIC.file);

  it("respecte la dimension imposée, qui n'admet aucune alternative", () => {
    expect([FEATURE_GRAPHIC.width, FEATURE_GRAPHIC.height]).toEqual([1024, 500]);
    expect([decoded.width, decoded.height]).toEqual([1024, 500]);
    expect(decoded.colorType).toBe(2);
    expect(decoded.bytes).toBeLessThan(15 * 1024 * 1024);
  });

  it("correspond exactement au rendu du générateur", () => {
    expect(decoded.pixels.equals(rasterizeFeatureGraphic())).toBe(true);
  });

  it("garde les quatre coins sur le fond de marque : pas de capture, pas de bord parasite", () => {
    const corner = (x: number, y: number) => [...decoded.pixels.subarray((y * FEATURE_GRAPHIC.width + x) * 3, (y * FEATURE_GRAPHIC.width + x) * 3 + 3)];
    for (const [x, y] of [[0, 0], [FEATURE_GRAPHIC.width - 1, 0], [0, FEATURE_GRAPHIC.height - 1], [FEATURE_GRAPHIC.width - 1, FEATURE_GRAPHIC.height - 1]]) {
      expect(corner(x, y)).toEqual(NAVY);
    }
  });

  it("laisse une marge de recadrage : Play rogne le visuel selon le contexte d'affichage", () => {
    for (const { word, x, y, em, tracking, half } of WORDS) {
      expect(x - half).toBeGreaterThan(64);
      expect(x + wordWidth(word, tracking) * em + half).toBeLessThan(FEATURE_GRAPHIC.width - 64);
      expect(y - half).toBeGreaterThan(64);
      expect(y + em + half).toBeLessThan(FEATURE_GRAPHIC.height - 64);
    }
  });

  /*
   * Le filigrane est volontairement rogné : seule son amorce entre dans le cadre, comme sur
   * l'image Open Graph. Ce débordement est un parti graphique, pas une erreur — mais il doit
   * rester confiné au coin bas droit. Un trait qui sortirait par le HAUT ou par la GAUCHE serait,
   * lui, le signe d'une coordonnée qui a dérivé, et emporterait le bloc de marque avec elle.
   */
  it("ne laisse déborder que le filigrane, et seulement par le coin bas droit", () => {
    for (const layer of buildStrokeLayers()) {
      const [left, top, right, bottom] = layer.box;
      expect(left).toBeGreaterThan(0);
      expect(top).toBeGreaterThan(0);
      /* Débordement borné : une amorce de motif, jamais une figure entière posée hors cadre. */
      expect(right).toBeLessThan(FEATURE_GRAPHIC.width * 1.2);
      expect(bottom).toBeLessThan(FEATURE_GRAPHIC.height * 1.2);
    }
  });
});
