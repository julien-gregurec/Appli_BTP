import { describe, expect, it } from "vitest";

import { asReconstructionJobId, type EngineSubmission } from "@elsatia/drone-core";

import { ecrireParametres, PARAMETRES_PROTOTYPE_DEFAUT } from "./base";
import {
  CONFIG_METASHAPE_NON_ACQUISE,
  creerAdaptateurMetashape,
  verifierConfigMetashape,
  type ConfigMetashape,
} from "./metashape";

const SOUMISSION: EngineSubmission = {
  job_id: asReconstructionJobId("33333333-3333-4333-8333-333333333333"),
  input_urls: [1, 2, 3].map((index) => `https://stockage.test/media-${index}.jpg?sig=x`),
  parameters: ecrireParametres(PARAMETRES_PROTOTYPE_DEFAUT),
};

const CONFIG_COMPLETE: ConfigMetashape = {
  cheminBinaire: "/opt/metashape/metashape",
  serveurLicence: "licences.interne:5053",
  typeLicence: "service_provider_pay_per_use",
  repertoireProjets: "/var/lib/metashape",
  gpuActive: true,
  version: "2.2.0",
};

describe("adaptateur Metashape", () => {
  it("énumère précisément ce qui manque aujourd'hui", () => {
    expect(verifierConfigMetashape(CONFIG_METASHAPE_NON_ACQUISE)).toEqual([
      "licence Service Provider",
      "serveur de licences",
      "binaire metashape",
      "répertoire de projets",
      "version du moteur",
    ]);
    expect(verifierConfigMetashape(CONFIG_COMPLETE)).toEqual([]);
  });

  it("se décrit comme moteur du noyau même sans licence", () => {
    const descripteur = creerAdaptateurMetashape().describe();

    expect(descripteur.engine).toBe("metashape");
    expect(descripteur.version).toBe("non-licencie");
    expect(descripteur.supports_gpu).toBe(false);
  });

  it("refuse bruyamment tant que la licence n'est pas acquise", async () => {
    const moteur = creerAdaptateurMetashape();

    await expect(moteur.submit(SOUMISSION)).rejects.toThrowError(/licence Service Provider/);
    await expect(
      moteur.poll({ engine_job_id: "x", submitted_at: "2026-09-07T09:00:00.000Z" }),
    ).rejects.toThrowError(/non exploitable/);
  });

  it("distingue « non licencié » de « non implémenté »", async () => {
    const moteur = creerAdaptateurMetashape(CONFIG_COMPLETE);

    expect(moteur.describe().version).toBe("2.2.0");
    await expect(moteur.submit(SOUMISSION)).rejects.toThrowError(/non implémenté/);
  });
});
