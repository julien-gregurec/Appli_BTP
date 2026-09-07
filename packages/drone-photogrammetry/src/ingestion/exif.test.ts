import { describe, expect, it } from "vitest";

import { construireJpegDemo } from "../demo/fixtures";
import { lireDimensionsJpeg, lireExifJpeg } from "./exif";

describe("lecture EXIF", () => {
  it("lit appareil, focale, orientation, dimensions, horodatage et GPS", () => {
    const jpeg = construireJpegDemo({
      largeur: 4000,
      hauteur: 3000,
      marque: "DJI",
      modele: "FC3582",
      focaleMm: 6.7,
      priseLe: "2026:09:07 10:12:33",
      latitude: 48.5734,
      longitude: 7.7521,
      altitudeM: 142.5,
      orientation: 1,
    });

    const exif = lireExifJpeg(jpeg);

    expect(exif).not.toBeNull();
    expect(exif?.marque).toBe("DJI");
    expect(exif?.modele).toBe("FC3582");
    expect(exif?.focaleMm).toBeCloseTo(6.7, 2);
    expect(exif?.orientation).toBe(1);
    expect(exif?.largeurPx).toBe(4000);
    expect(exif?.hauteurPx).toBe(3000);
    expect(exif?.priseLe).toBe("2026-09-07T10:12:33");
    expect(exif?.latitude).toBeCloseTo(48.5734, 3);
    expect(exif?.longitude).toBeCloseTo(7.7521, 3);
    expect(exif?.altitudeM).toBeCloseTo(142.5, 1);
    expect(exif?.brut.Model).toBe("FC3582");
  });

  it("gère l'hémisphère sud et l'ouest par les références GPS", () => {
    const jpeg = construireJpegDemo({ latitude: -33.8688, longitude: -70.6693, altitudeM: -5 });
    const exif = lireExifJpeg(jpeg);

    expect(exif?.latitude).toBeLessThan(0);
    expect(exif?.longitude).toBeLessThan(0);
    expect(exif?.altitudeM).toBeCloseTo(-5, 1);
  });

  it("retourne les dimensions du SOF quand l'EXIF est absent", () => {
    const jpeg = construireJpegDemo({ avecExif: false, largeur: 1024, hauteur: 768 });
    const exif = lireExifJpeg(jpeg);

    expect(exif?.latitude).toBeNull();
    expect(exif?.marque).toBeNull();
    expect(exif?.largeurPx).toBe(1024);
    expect(lireDimensionsJpeg(jpeg)).toEqual({ largeur: 1024, hauteur: 768 });
  });

  it("omet le bloc GPS quand la position est absente", () => {
    const jpeg = construireJpegDemo({ latitude: null, longitude: null, altitudeM: null });
    const exif = lireExifJpeg(jpeg);

    expect(exif?.modele).toBe("FC3582");
    expect(exif?.latitude).toBeNull();
    expect(exif?.longitude).toBeNull();
  });

  it("ne casse pas sur un contenu qui n'est pas un JPEG", () => {
    expect(lireExifJpeg(Uint8Array.from([1, 2, 3, 4, 5]))).toBeNull();
  });
});
