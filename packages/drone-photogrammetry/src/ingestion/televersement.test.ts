import { describe, expect, it } from "vitest";

import type { StorageObjectRef } from "@elsatia/drone-core";

import { calculerSha256 } from "./empreinte";
import {
  cheminEcriture,
  creerEcrivainMemoire,
  creerGestionnaireTeleversement,
  ErreurTeleversement,
} from "./televersement";

const CONTENU = Uint8Array.from(Array.from({ length: 2500 }, (_, index) => index % 251));
const REF: StorageObjectRef = {
  bucket: "drone-medias",
  path: "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/media.jpg",
};
const CHEMIN = cheminEcriture(REF);

function ouvrirSession(tailleBloc = 1000, sha256Attendu: string | null = calculerSha256(CONTENU)) {
  const ecrivain = creerEcrivainMemoire();
  const gestionnaire = creerGestionnaireTeleversement(ecrivain);
  gestionnaire.ouvrir({
    sessionId: "session-1",
    ref: REF,
    tailleTotale: CONTENU.length,
    tailleBloc,
    sha256Attendu,
  });
  return { ecrivain, gestionnaire };
}

async function envoyerBlocs(
  gestionnaire: ReturnType<typeof creerGestionnaireTeleversement>,
  tailleBloc: number,
  jusquA = CONTENU.length,
) {
  for (let offset = 0; offset < jusquA; offset += tailleBloc) {
    await gestionnaire.televerserBloc(
      "session-1",
      offset,
      CONTENU.subarray(offset, Math.min(offset + tailleBloc, CONTENU.length)),
    );
  }
}

describe("téléversement par morceaux", () => {
  it("reconstitue le fichier et vérifie l'empreinte annoncée", async () => {
    const { ecrivain, gestionnaire } = ouvrirSession();
    await envoyerBlocs(gestionnaire, 1000);
    const resultat = await gestionnaire.terminer("session-1");

    expect(resultat.ref).toEqual(REF);
    expect(resultat.octets).toBe(CONTENU.length);
    expect(resultat.sha256).toBe(calculerSha256(CONTENU));
    expect(await ecrivain.lire(CHEMIN)).toEqual(CONTENU);
    expect(gestionnaire.etat("session-1").statut).toBe("terminee");
  });

  it("reprend après coupure à l'offset connu", async () => {
    const { gestionnaire } = ouvrirSession();
    await envoyerBlocs(gestionnaire, 1000, 1000);

    expect(gestionnaire.etat("session-1").offset).toBe(1000);

    await envoyerBlocs(gestionnaire, 1000, CONTENU.length);
    await expect(gestionnaire.terminer("session-1")).resolves.toMatchObject({
      octets: CONTENU.length,
    });
  });

  it("ignore le rejeu d'un bloc déjà écrit", async () => {
    const { gestionnaire } = ouvrirSession();
    await gestionnaire.televerserBloc("session-1", 0, CONTENU.subarray(0, 1000));
    const offsetApresRejeu = await gestionnaire.televerserBloc(
      "session-1",
      0,
      CONTENU.subarray(0, 1000),
    );

    expect(offsetApresRejeu).toBe(1000);
  });

  it("refuse un bloc hors séquence", async () => {
    const { gestionnaire } = ouvrirSession();
    await expect(
      gestionnaire.televerserBloc("session-1", 500, CONTENU.subarray(500, 1500)),
    ).rejects.toMatchObject({ code: "offset_incoherent" });
  });

  it("refuse un dépassement de la taille annoncée", async () => {
    const { gestionnaire } = ouvrirSession();
    await envoyerBlocs(gestionnaire, 1000);
    await expect(
      gestionnaire.televerserBloc("session-1", CONTENU.length, Uint8Array.from([1, 2, 3])),
    ).rejects.toMatchObject({ code: "depassement_taille" });
  });

  it("refuse une clôture avant réception complète", async () => {
    const { gestionnaire } = ouvrirSession();
    await envoyerBlocs(gestionnaire, 1000, 1000);
    await expect(gestionnaire.terminer("session-1")).rejects.toMatchObject({
      code: "taille_incomplete",
    });
  });

  it("détecte une corruption par comparaison d'empreinte", async () => {
    const { gestionnaire } = ouvrirSession(1000, "0".repeat(64));
    await envoyerBlocs(gestionnaire, 1000);
    await expect(gestionnaire.terminer("session-1")).rejects.toMatchObject({
      code: "empreinte_incoherente",
    });
    // Le fichier reste en place : la reprise reste possible, l'incident est traçable.
    expect(gestionnaire.etat("session-1").statut).toBe("ouverte");
  });

  it("supprime le fichier partiel à l'abandon", async () => {
    const { ecrivain, gestionnaire } = ouvrirSession();
    await envoyerBlocs(gestionnaire, 1000, 1000);
    await gestionnaire.abandonner("session-1");

    expect(gestionnaire.etat("session-1").statut).toBe("abandonnee");
    expect(ecrivain.fichiers().has(CHEMIN)).toBe(false);
    await expect(
      gestionnaire.televerserBloc("session-1", 1000, CONTENU.subarray(1000, 2000)),
    ).rejects.toBeInstanceOf(ErreurTeleversement);
  });
});
