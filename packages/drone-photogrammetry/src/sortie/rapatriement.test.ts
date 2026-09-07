import { describe, expect, it } from "vitest";

import { calculerSha256 } from "../ingestion/empreinte";
import { cheminEcriture, creerEcrivainMemoire } from "../ingestion/televersement";
import { rapatrierArtefacts } from "./rapatriement";
import type { AssetMoteur } from "./normalisation";

const TIFF = Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 1, 2, 3, 4]);
const LAS = Uint8Array.from([0x4c, 0x41, 0x53, 0x46, 1, 2, 3, 4]);

const ASSETS: AssetMoteur[] = [
  { nom: "orthophoto.tif", url: "http://nodeodm.test/ortho", octets: null },
  { nom: "georeferenced_model.laz", url: "http://nodeodm.test/nuage", octets: null },
  { nom: "dsm.tif", url: "http://nodeodm.test/dsm", octets: null },
  { nom: "opensfm/tracks.csv", url: "http://nodeodm.test/tracks", octets: null },
];

function telechargeurStub(absents: string[] = []) {
  return async (url: string): Promise<Uint8Array | null> => {
    if (absents.some((motif) => url.includes(motif))) return null;
    return url.includes("nuage") ? LAS : TIFF;
  };
}

describe("rapatriement des artefacts", () => {
  it("écrit les fichiers au stockage et retourne des références, pas des URL", async () => {
    const ecrivain = creerEcrivainMemoire();
    const resultat = await rapatrierArtefacts({
      assets: ASSETS,
      telechargeur: telechargeurStub(),
      ecrivain,
      destination: ({ champ }) => ({
        bucket: "drone-resultats",
        path: `entreprise/projet/${champ}`,
      }),
    });

    expect(resultat.artefacts.orthophoto).toEqual({
      bucket: "drone-resultats",
      path: "entreprise/projet/orthophoto",
    });
    expect(JSON.stringify(resultat.artefacts)).not.toContain("nodeodm.test");
    expect(await ecrivain.lire(cheminEcriture(resultat.artefacts.point_cloud!))).toEqual(LAS);
  });

  it("confirme le format par les octets reçus et empreinte chaque fichier", async () => {
    const resultat = await rapatrierArtefacts({
      assets: ASSETS,
      telechargeur: telechargeurStub(),
      ecrivain: creerEcrivainMemoire(),
      destination: ({ champ }) => ({ bucket: "drone-resultats", path: `e/p/${champ}` }),
    });

    const nuage = resultat.manifeste.find((artefact) => artefact.champ === "point_cloud");
    expect(nuage?.format).toBe("laz");
    expect(nuage?.sha256).toBe(calculerSha256(LAS));
    expect(nuage?.octets).toBe(LAS.length);
  });

  it("ignore les fichiers de travail du moteur et signale les absents", async () => {
    const resultat = await rapatrierArtefacts({
      assets: ASSETS,
      telechargeur: telechargeurStub(["dsm"]),
      ecrivain: creerEcrivainMemoire(),
      destination: ({ champ }) => ({ bucket: "drone-resultats", path: `e/p/${champ}` }),
    });

    expect(resultat.ignores).toEqual(["opensfm/tracks.csv"]);
    expect(resultat.absents).toEqual(["dsm.tif"]);
    expect(resultat.artefacts.digital_surface_model).toBeNull();
  });
});
