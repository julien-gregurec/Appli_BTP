import { describe, expect, it } from "vitest";

import { construireJpegDemo } from "../demo/fixtures";
import {
  asDroneProjectId,
  asEntrepriseId,
  asMediaAssetId,
  asReconstructionJobId,
} from "@elsatia/drone-core";

import {
  assainirNomAffichage,
  construireRefArtefact,
  construireRefMedia,
  detecterTypeMedia,
  ErreurSecuriteMedia,
  validerMediaImporte,
} from "./entrees";

const ENTREPRISE = asEntrepriseId("11111111-1111-4111-8111-111111111111");
const PROJET = asDroneProjectId("22222222-2222-4222-8222-222222222222");
const MEDIA = asMediaAssetId("44444444-4444-4444-8444-000000000001");
const JOB = asReconstructionJobId("33333333-3333-4333-8333-333333333333");

const JPEG = construireJpegDemo();
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** Retourne le code métier de l'erreur levée — un message ne suffit pas à qualifier un refus. */
function codeRefus(action: () => unknown): string {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof ErreurSecuriteMedia) return erreur.code;
    throw erreur;
  }
  throw new Error("aucune erreur levée alors qu'un refus était attendu");
}

describe("sécurité des entrées média", () => {
  it("décide du type par les octets, pas par l'extension", () => {
    expect(detecterTypeMedia(JPEG)).toBe("image/jpeg");
    expect(detecterTypeMedia(PNG)).toBe("image/png");
    expect(detecterTypeMedia(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });

  it("refuse un exécutable déguisé en photo", () => {
    const elf = Uint8Array.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    expect(
      codeRefus(() =>
        validerMediaImporte({ contenu: elf, mimeDeclare: "image/jpeg", nomFichier: "photo.jpg" }),
      ),
    ).toBe("mime_non_supporte");
  });

  it("refuse un type déclaré incohérent avec le contenu", () => {
    expect(
      codeRefus(() =>
        validerMediaImporte({ contenu: PNG, mimeDeclare: "image/jpeg", nomFichier: "photo.jpg" }),
      ),
    ).toBe("mime_incoherent");
  });

  it("refuse un nom de fichier porteur d'un octet nul", () => {
    expect(
      codeRefus(() =>
        validerMediaImporte({
          contenu: JPEG,
          mimeDeclare: null,
          nomFichier: `photo${String.fromCharCode(0)}.jpg`,
        }),
      ),
    ).toBe("nom_dangereux");
  });

  it("neutralise les noms de fichiers hostiles pour l'affichage", () => {
    expect(assainirNomAffichage("../../etc/passwd")).toBe("passwd");
    expect(assainirNomAffichage("C:\\Windows\\System32\\cmd.exe")).toBe("cmd.exe");
    expect(assainirNomAffichage("...")).toBe("media");
  });

  it("génère des références qui ne contiennent aucune donnée client", () => {
    const valide = validerMediaImporte({
      contenu: JPEG,
      mimeDeclare: "image/jpeg",
      nomFichier: "../../../DJI_0001.JPG",
    });
    const ref = construireRefMedia({
      entrepriseId: ENTREPRISE,
      projetId: PROJET,
      mediaId: MEDIA,
      type: valide.type,
    });

    expect(valide.nomAffichage).toBe("DJI_0001.JPG");
    expect(ref.bucket).toBe("drone-medias");
    // L'entreprise reste le premier segment : contrainte des policies de stockage.
    expect(ref.path).toBe(`${ENTREPRISE}/${PROJET}/${MEDIA}.jpg`);
    expect(ref.path).not.toContain("DJI");
    expect(ref.path).not.toContain("..");
  });

  it("refuse un identifiant qui n'est pas un UUID du noyau", () => {
    expect(
      codeRefus(() =>
        construireRefMedia({
          entrepriseId: "../admin" as typeof ENTREPRISE,
          projetId: PROJET,
          mediaId: MEDIA,
          type: "image/jpeg",
        }),
      ),
    ).toBe("identifiant_invalide");

    expect(
      codeRefus(() => construireRefArtefact(ENTREPRISE, PROJET, JOB, "../../secret.laz")),
    ).toBe("chemin_invalide");
  });

  it("range les artefacts dans le bucket des résultats", () => {
    const ref = construireRefArtefact(ENTREPRISE, PROJET, JOB, "orthophoto.tif");

    expect(ref).toEqual({
      bucket: "drone-resultats",
      path: `${ENTREPRISE}/${PROJET}/${JOB}/orthophoto.tif`,
    });
  });

  it("refuse un contenu vide", () => {
    expect(
      codeRefus(() =>
        validerMediaImporte({ contenu: new Uint8Array(0), mimeDeclare: null, nomFichier: "x.jpg" }),
      ),
    ).toBe("media_vide");
  });
});
