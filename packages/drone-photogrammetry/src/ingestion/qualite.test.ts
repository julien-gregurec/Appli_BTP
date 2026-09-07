import { describe, expect, it } from "vitest";

import { construireJpegDemo } from "../demo/fixtures";
import { calculerSha256 } from "./empreinte";
import { lireExifJpeg } from "./exif";
import {
  controlerQualite,
  mesurerNettete,
  versQualityFlags,
  type MediaAnalyse,
} from "./qualite";

function analyser(mediaId: string, jpeg: Uint8Array, nettete: number | null = null): MediaAnalyse {
  return {
    mediaId,
    sha256: calculerSha256(jpeg),
    octets: jpeg.length,
    type: "image/jpeg",
    exif: lireExifJpeg(jpeg),
    nettete,
  };
}

function jeuNominal(nombre: number): MediaAnalyse[] {
  return Array.from({ length: nombre }, (_, index) =>
    analyser(
      `media-${index}`,
      construireJpegDemo({
        latitude: 48.5 + index * 0.0001,
        longitude: 7.7 + index * 0.0001,
        remplissage: [index],
      }),
    ),
  );
}

describe("contrôle qualité", () => {
  it("valide un jeu nominal sans blocage", () => {
    const rapport = controlerQualite(jeuNominal(10));

    expect(rapport.blocages).toEqual([]);
    expect(rapport.resume.rejetes).toBe(0);
    expect(rapport.resume.partGeolocalisee).toBe(1);
    // La netteté n'est pas mesurée : elle est signalée indéterminée, jamais devinée.
    expect(rapport.medias[0].anomalies).toContain("nettete_indeterminee");
    expect(rapport.medias[0].verdict).toBe("exploitable");
  });

  it("signale l'EXIF absent, le GPS absent, la focale et l'horodatage manquants", () => {
    const medias = jeuNominal(9);
    medias.push(analyser("media-sans-exif", construireJpegDemo({ avecExif: false })));

    const rapport = controlerQualite(medias);
    const sansExif = rapport.medias.find((media) => media.mediaId === "media-sans-exif");

    expect(sansExif?.anomalies).toEqual(
      expect.arrayContaining(["exif_absent", "gps_absent", "focale_absente", "horodatage_absent"]),
    );
    expect(sansExif?.verdict).toBe("douteux");
  });

  it("signale une image géolocalisée sans position comme douteuse, pas comme rejetée", () => {
    const medias = jeuNominal(9);
    medias.push(
      analyser("media-sans-gps", construireJpegDemo({ latitude: null, longitude: null })),
    );

    const rapport = controlerQualite(medias);
    const sansGps = rapport.medias.find((media) => media.mediaId === "media-sans-gps");

    expect(sansGps?.anomalies).toContain("gps_absent");
    expect(sansGps?.anomalies).not.toContain("exif_absent");
    expect(sansGps?.verdict).toBe("douteux");
  });

  it("rejette les doublons exacts en conservant le lien vers l'original", () => {
    const medias = jeuNominal(9);
    const original = medias[0];
    medias.push({ ...original, mediaId: "media-copie" });

    const rapport = controlerQualite(medias);
    const copie = rapport.medias.find((media) => media.mediaId === "media-copie");

    expect(copie?.verdict).toBe("rejete");
    expect(copie?.anomalies).toContain("doublon_exact");
    expect(copie?.doublonDe).toBe("media-0");
    expect(rapport.resume.rejetes).toBe(1);
  });

  it("rejette une image sous le seuil de résolution", () => {
    const medias = jeuNominal(9);
    medias.push(
      analyser("media-petit", construireJpegDemo({ largeur: 1024, hauteur: 768, remplissage: [9] })),
    );

    const rapport = controlerQualite(medias);
    const petit = rapport.medias.find((media) => media.mediaId === "media-petit");

    expect(petit?.megapixels).toBeCloseTo(0.786, 2);
    expect(petit?.verdict).toBe("rejete");
  });

  it("ne conclut au flou que si une mesure de netteté est fournie", () => {
    const flou = analyser("media-flou", construireJpegDemo({ remplissage: [99] }), 12);
    const net = analyser("media-net", construireJpegDemo({ remplissage: [98] }), 900);

    const sansSeuil = controlerQualite([flou, net]);
    expect(sansSeuil.medias[0].anomalies).not.toContain("flou_probable");

    const avecSeuil = controlerQualite([flou, net], {
      megapixelsMin: 3,
      netteteMin: 100,
      partGeolocaliseeMin: 0.8,
      imagesMin: 2,
    });
    expect(avecSeuil.medias[0].anomalies).toContain("flou_probable");
    expect(avecSeuil.medias[0].verdict).toBe("douteux");
    expect(avecSeuil.medias[1].anomalies).not.toContain("flou_probable");
  });

  it("bloque un jeu trop pauvre ou insuffisamment géolocalisé", () => {
    const troisImages = controlerQualite(jeuNominal(3));
    expect(troisImages.blocages[0]).toContain("minimum de 8");

    const sansGps = Array.from({ length: 10 }, (_, index) =>
      analyser(
        `media-${index}`,
        construireJpegDemo({ latitude: null, longitude: null, remplissage: [index] }),
      ),
    );
    const rapport = controlerQualite(sansGps);
    expect(rapport.resume.partGeolocalisee).toBe(0);
    expect(rapport.blocages.join(" ")).toContain("échelle métrique");
  });
});

describe("mesure de netteté", () => {
  it("distingue une image plate d'une image contrastée", () => {
    const plate = new Uint8Array(64).fill(128);
    const contrastee = Uint8Array.from(
      Array.from({ length: 64 }, (_, index) => ((index % 2) + (index % 3)) * 80),
    );

    expect(mesurerNettete(plate, 8, 8)).toBe(0);
    expect(mesurerNettete(contrastee, 8, 8)).toBeGreaterThan(0);
  });

  it("retourne 0 sur une image trop petite pour un laplacien", () => {
    expect(mesurerNettete(new Uint8Array(4), 2, 2)).toBe(0);
  });
});

describe("traduction vers les drapeaux du noyau", () => {
  it("marque un doublon comme inutilisable et conserve le lien vers l'original", () => {
    const medias = jeuNominal(9);
    medias.push({ ...medias[0], mediaId: "media-copie" });
    const rapport = controlerQualite(medias);
    const copie = rapport.medias.find((media) => media.mediaId === "media-copie")!;

    expect(versQualityFlags(copie, null)).toEqual({
      blur_score: null,
      exposure_score: null,
      duplicate_of: "media-0",
      usable: false,
    });
  });

  it("laisse un média douteux utilisable : la décision reste à l'utilisateur", () => {
    const medias = jeuNominal(9);
    medias.push(analyser("media-sans-gps", construireJpegDemo({ latitude: null, longitude: null })));
    const rapport = controlerQualite(medias);
    const douteux = rapport.medias.find((media) => media.mediaId === "media-sans-gps")!;

    const drapeaux = versQualityFlags(douteux, 42);
    expect(drapeaux.usable).toBe(true);
    expect(drapeaux.blur_score).toBe(42);
    expect(drapeaux.duplicate_of).toBeNull();
  });
});
