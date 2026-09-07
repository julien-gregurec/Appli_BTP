import { describe, expect, it } from "vitest";

import { asReconstructionJobId, type EngineSubmission } from "@elsatia/drone-core";

import { ecrireParametres, PARAMETRES_PROTOTYPE_DEFAUT } from "../moteur/base";
import { creerMoteurDemo } from "../moteur/demo";
import { convertirEnCredits, TarificationPrematureeError } from "../couts/estimation";
import {
  creerReleve,
  executerBenchmark,
  JEUX_BENCHMARK,
  resumerMesure,
  TAILLES_JEU,
  type MesureBenchmark,
} from "./mesure";

const SOUMISSION: EngineSubmission = {
  job_id: asReconstructionJobId("33333333-3333-4333-8333-333333333333"),
  input_urls: Array.from(
    { length: 40 },
    (_, index) => `https://stockage.test/media-${index}.jpg?sig=x`,
  ),
  parameters: ecrireParametres(PARAMETRES_PROTOTYPE_DEFAUT),
};

function mesureFactice(jeu: (typeof TAILLES_JEU)[number], reelle: boolean): MesureBenchmark {
  return {
    jeu,
    moteur: "odm",
    moteurVersion: "3.5.0",
    machine: "machine de test",
    photos: 40,
    megapixelsTotal: 480,
    tempsS: 1200,
    ramPicMo: 8000,
    vramPicMo: null,
    disquePicMo: 12_000,
    sortieMo: 400,
    executeLe: "2026-09-07T12:00:00.000Z",
    reelle,
    notes: null,
  };
}

describe("jeux de benchmark", () => {
  it("décrit trois tailles, sans jamais présenter une source comme acquise", () => {
    expect(Object.keys(JEUX_BENCHMARK)).toEqual(["small", "medium", "large"]);
    for (const jeu of Object.values(JEUX_BENCHMARK)) {
      expect(jeu.photosCible).toBeGreaterThan(0);
      expect(jeu.licenceSource).toContain("à confirmer");
    }
  });
});

describe("harnais de mesure", () => {
  it("déroule un travail complet et relève les indicateurs disponibles", async () => {
    const moteur = creerMoteurDemo({ dureeS: 900 });
    const mesure = await executerBenchmark(
      moteur,
      {
        jeu: "small",
        soumission: SOUMISSION,
        megapixelsTotal: 480,
        machine: "moteur de démonstration, aucun GPU",
        reelle: false,
        sortieMo: 128,
      },
      {
        maintenantMs: () => 0,
        ramMo: () => 1234,
        vramMo: () => null,
        disqueMo: () => null,
      },
      // Le moteur de démonstration n'avance que si on le lui demande.
      () => {
        for (const travail of moteur.travaux()) {
          moteur.avancer(travail.handle.engine_job_id);
        }
      },
    );

    expect(mesure.moteur).toBe("demo");
    expect(mesure.photos).toBe(40);
    expect(mesure.tempsS).toBe(900);
    expect(mesure.ramPicMo).toBe(1234);
    // Non mesurable depuis Node : le champ reste vide plutôt que faux.
    expect(mesure.vramPicMo).toBeNull();
    expect(mesure.sortieMo).toBe(128);
    expect(mesure.reelle).toBe(false);
  });

  it("note le statut atteint quand le travail ne va pas au bout", async () => {
    const moteur = creerMoteurDemo({ echouerAEtape: 1 });
    const mesure = await executerBenchmark(
      moteur,
      {
        jeu: "small",
        soumission: SOUMISSION,
        megapixelsTotal: 480,
        machine: "moteur de démonstration",
        reelle: false,
        maxIterations: 10,
      },
      { maintenantMs: () => 0, ramMo: () => null, vramMo: () => null, disqueMo: () => null },
      () => {
        for (const travail of moteur.travaux()) moteur.avancer(travail.handle.engine_job_id);
      },
    );

    expect(mesure.notes).toContain("failed");
    expect(mesure.sortieMo).toBeNull();
  });

  it("calcule des indicateurs dérivés lisibles", () => {
    const synthese = resumerMesure(mesureFactice("medium", true));

    expect(synthese.secondesParPhoto).toBe(30);
    expect(synthese.secondesParMegapixel).toBeCloseTo(2.5, 6);
    expect(synthese.megaoctetsSortieParPhoto).toBe(10);
  });
});

describe("relevé", () => {
  it("n'est complet que si les trois jeux ont été mesurés pour de vrai", () => {
    const releve = creerReleve();
    releve.ajouter(mesureFactice("small", true));
    releve.ajouter(mesureFactice("medium", true));
    expect(releve.complet()).toBe(false);

    releve.ajouter(mesureFactice("large", false));
    expect(releve.complet()).toBe(false);

    releve.ajouter(mesureFactice("large", true));
    expect(releve.complet()).toBe(true);
    expect(JSON.parse(releve.exporterJson()).mesures).toHaveLength(4);
  });

  it("un relevé issu du moteur de démonstration ne peut pas fonder un tarif", () => {
    const releve = creerReleve();
    for (const jeu of TAILLES_JEU) releve.ajouter(mesureFactice(jeu, false));

    expect(releve.complet()).toBe(false);
    expect(() =>
      convertirEnCredits(
        { gpuCentimes: 1, stockageCentimes: 1, egressCentimes: 1, totalCentimes: 3, detail: [] },
        {
          mesuresReelles: releve.complet(),
          echantillons: releve.mesures().length,
          centimesParCredit: 10,
        },
      ),
    ).toThrowError(TarificationPrematureeError);
  });
});
