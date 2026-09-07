import { describe, expect, it } from "vitest";

import type { StorageObjectRef } from "@elsatia/drone-core";

import { PARAMETRES_PROTOTYPE_DEFAUT } from "../moteur/base";
import {
  composerArtefacts,
  deduireChampArtefact,
  detecterFormat,
  detecterFormatParEntete,
  extraireMetriquesOdm,
  verifierCompletude,
} from "./normalisation";

function octets(texte: string): Uint8Array {
  return Uint8Array.from([...texte].map((caractere) => caractere.charCodeAt(0)));
}

function ref(nom: string): StorageObjectRef {
  return { bucket: "drone-resultats", path: `entreprise/projet/${nom}` };
}

describe("détection de format", () => {
  it("reconnaît les signatures GLB, PLY, LAS, GeoTIFF, PNG, JPEG, PDF et ZIP", () => {
    expect(detecterFormatParEntete(octets("glTF"))).toBe("glb");
    expect(detecterFormatParEntete(octets("ply1"))).toBe("ply");
    expect(detecterFormatParEntete(octets("LASF"))).toBe("laz");
    expect(detecterFormatParEntete(Uint8Array.from([0x49, 0x49, 0x2a, 0x00]))).toBe("geotiff");
    expect(detecterFormatParEntete(Uint8Array.from([0x4d, 0x4d, 0x00, 0x2a]))).toBe("geotiff");
    expect(detecterFormatParEntete(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe("png");
    expect(detecterFormatParEntete(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detecterFormatParEntete(octets("%PDF"))).toBe("pdf");
    expect(detecterFormatParEntete(octets("PK.."))).toBe("zip");
    expect(detecterFormatParEntete(octets("????"))).toBeNull();
  });

  it("fait primer les octets sur l'extension, sauf pour distinguer LAS de LAZ", () => {
    expect(detecterFormat("modele.obj", octets("glTF"))).toBe("glb");
    expect(detecterFormat("nuage.las", octets("LASF"))).toBe("las");
    expect(detecterFormat("nuage.laz", octets("LASF"))).toBe("laz");
    expect(detecterFormat("inconnu.xyz")).toBe("inconnu");
  });
});

describe("déduction d'emplacement", () => {
  it("traduit la nomenclature ODM vers les emplacements du noyau", () => {
    expect(deduireChampArtefact("odm_orthophoto/odm_orthophoto.tif")).toBe("orthophoto");
    expect(deduireChampArtefact("odm_dem/dsm.tif")).toBe("digital_surface_model");
    expect(deduireChampArtefact("odm_georeferencing/odm_georeferenced_model.laz")).toBe(
      "point_cloud",
    );
    expect(deduireChampArtefact("odm_texturing/odm_textured_model_geo.obj")).toBe("mesh");
    expect(deduireChampArtefact("textured_model.zip")).toBe("mesh");
    expect(deduireChampArtefact("odm_texturing/texture_0.png")).toBe("texture");
    expect(deduireChampArtefact("web/lightweight.glb")).toBe("lightweight_glb");
    expect(deduireChampArtefact("opensfm/tracks.csv")).toBeNull();
    expect(deduireChampArtefact("odm_report/stats.json")).toBeNull();
  });
});

describe("composition des artefacts", () => {
  it("remplit les emplacements connus et laisse les autres à null", () => {
    const artefacts = composerArtefacts([
      { champ: "orthophoto", ref: ref("ortho.tif") },
      { champ: "point_cloud", ref: ref("nuage.laz") },
    ]);

    expect(artefacts.orthophoto?.path).toContain("ortho.tif");
    expect(artefacts.point_cloud?.path).toContain("nuage.laz");
    expect(artefacts.mesh).toBeNull();
    expect(artefacts.lightweight_glb).toBeNull();
  });

  it("n'écrase pas silencieusement un emplacement déjà pourvu", () => {
    const artefacts = composerArtefacts([
      { champ: "mesh", ref: ref("premier.obj") },
      { champ: "mesh", ref: ref("second.obj") },
    ]);

    expect(artefacts.mesh?.path).toContain("premier.obj");
  });

  it("liste les emplacements demandés mais absents", () => {
    const artefacts = composerArtefacts([{ champ: "orthophoto", ref: ref("ortho.tif") }]);

    expect(verifierCompletude(artefacts, PARAMETRES_PROTOTYPE_DEFAUT)).toEqual([
      "point_cloud",
      "mesh",
      "digital_surface_model",
    ]);
    expect(
      verifierCompletude(artefacts, {
        ...PARAMETRES_PROTOTYPE_DEFAUT,
        produce_point_cloud: false,
        produce_mesh: false,
        produce_dsm: false,
      }),
    ).toEqual([]);
  });
});

describe("métriques ODM", () => {
  it("lit ce qui existe, convertit le GSD en mm/px et laisse le reste à null", () => {
    const metriques = extraireMetriquesOdm(
      {
        reconstruction_statistics: { reconstructed_shots_count: 118 },
        processing_statistics: { average_gsd: 1.8 },
      },
      120,
    );

    expect(metriques.calibrated_cameras_count).toBe(118);
    expect(metriques.input_images_count).toBe(120);
    expect(metriques.ground_sampling_distance_mm_px).toBeCloseTo(18, 6);
    expect(metriques.retained_images_ratio).toBeCloseTo(118 / 120, 6);
    expect(metriques.reprojection_error_px).toBeNull();
    expect(metriques.control_point_error_m).toBeNull();
    // Le mode de positionnement ne se devine pas : il reste inconnu.
    expect(metriques.source_accuracy).toBeNull();
  });

  it("ne s'effondre pas sur un JSON inattendu", () => {
    expect(extraireMetriquesOdm("pas un objet", 10).calibrated_cameras_count).toBeNull();
    expect(extraireMetriquesOdm(null, 10).ground_sampling_distance_mm_px).toBeNull();
    expect(
      extraireMetriquesOdm({ processing_statistics: { average_gsd: "1.8" } }, 10)
        .ground_sampling_distance_mm_px,
    ).toBeNull();
    expect(extraireMetriquesOdm({}, null).retained_images_ratio).toBeNull();
  });
});
