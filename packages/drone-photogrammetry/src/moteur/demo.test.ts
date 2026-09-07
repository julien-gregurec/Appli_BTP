import { describe, expect, it } from "vitest";

import { asReconstructionJobId, type EngineSubmission } from "@elsatia/drone-core";

import { ecrireParametres, PARAMETRES_PROTOTYPE_DEFAUT } from "./base";
import { creerMoteurDemo, ETAPES_DEMO } from "./demo";
import { verifierCompletude } from "../sortie/normalisation";

const SOUMISSION: EngineSubmission = {
  job_id: asReconstructionJobId("33333333-3333-4333-8333-333333333333"),
  input_urls: [1, 2, 3, 4, 5].map((index) => `https://stockage.test/media-${index}.jpg?sig=x`),
  parameters: ecrireParametres(PARAMETRES_PROTOTYPE_DEFAUT),
};

describe("moteur de démonstration", () => {
  it("déroule un cycle complet sans GPU ni horloge réelle", async () => {
    const moteur = creerMoteurDemo();
    const handle = await moteur.submit(SOUMISSION);

    expect((await moteur.poll(handle)).status).toBe("queued");

    moteur.avancer(handle.engine_job_id);
    const enCours = await moteur.poll(handle);
    expect(enCours.status).toBe("processing");
    expect(enCours.percent).toBe(Math.round((1 / ETAPES_DEMO.length) * 100));
    expect(enCours.stage).toBe(ETAPES_DEMO[1]);

    moteur.deroulerJusquAuBout(handle.engine_job_id);
    const fini = await moteur.poll(handle);
    expect(fini.status).toBe("completed");
    expect(fini.percent).toBe(100);
    expect(moteur.logs(handle.engine_job_id).length).toBeGreaterThan(ETAPES_DEMO.length);
  });

  it("se décrit conformément au noyau", () => {
    const descripteur = creerMoteurDemo().describe();

    expect(descripteur.engine).toBe("demo");
    expect(descripteur.supports_gpu).toBe(false);
    expect(descripteur.supported_parameters).toContain("mesh_quality");
  });

  it("produit les artefacts demandés, et ceux-là seulement", async () => {
    const moteur = creerMoteurDemo();
    const handle = await moteur.submit({
      ...SOUMISSION,
      parameters: ecrireParametres({ ...PARAMETRES_PROTOTYPE_DEFAUT, produce_dsm: false }),
    });
    moteur.deroulerJusquAuBout(handle.engine_job_id);

    const outcome = await moteur.fetchOutcome(handle);

    expect(outcome.artifacts.point_cloud).not.toBeNull();
    expect(outcome.artifacts.mesh).not.toBeNull();
    expect(outcome.artifacts.digital_surface_model).toBeNull();
    expect(outcome.quality_metrics.calibrated_cameras_count).toBe(5);
    expect(verifierCompletude(outcome.artifacts, {
      ...PARAMETRES_PROTOTYPE_DEFAUT,
      produce_dsm: false,
    })).toEqual([]);
  });

  it("conserve message, logs et artefacts partiels en cas d'échec (§21)", async () => {
    const moteur = creerMoteurDemo({
      echouerAEtape: 2,
      messageEchec: "Dense reconstruction failed: not enough memory",
    });
    const handle = await moteur.submit(SOUMISSION);
    moteur.deroulerJusquAuBout(handle.engine_job_id);

    const avancement = await moteur.poll(handle);
    expect(avancement.status).toBe("failed");
    expect(avancement.error_category).toBe("engine_failure");
    expect(avancement.error_message).toContain("not enough memory");

    const erreur = await moteur.fetchOutcome(handle).catch((cause: unknown) => cause);
    expect(erreur).toMatchObject({ category: "engine_failure", retryable: true });
    expect((erreur as { partialArtifacts: { point_cloud: unknown } }).partialArtifacts.point_cloud)
      .not.toBeNull();
  });

  it("annule un travail en cours et refuse ensuite le résultat", async () => {
    const moteur = creerMoteurDemo();
    const handle = await moteur.submit(SOUMISSION);
    moteur.avancer(handle.engine_job_id);
    await moteur.cancel(handle);

    expect((await moteur.poll(handle)).status).toBe("cancelled");
    await expect(moteur.fetchOutcome(handle)).rejects.toMatchObject({
      category: "cancelled_by_user",
    });
    // Un travail annulé n'avance plus.
    moteur.deroulerJusquAuBout(handle.engine_job_id);
    expect((await moteur.poll(handle)).status).toBe("cancelled");
  });

  it("applique les mêmes gardes d'entrée qu'un moteur réel", async () => {
    const moteur = creerMoteurDemo();

    await expect(
      moteur.submit({ ...SOUMISSION, input_urls: ["https://stockage.test/a.jpg"] }),
    ).rejects.toMatchObject({ category: "input_insufficient" });
    await expect(
      moteur.submit({ ...SOUMISSION, parameters: { mesh_quality: "ultra" } }),
    ).rejects.toMatchObject({ category: "input_insufficient" });
    await expect(
      moteur.submit({ ...SOUMISSION, parameters: { inconnu: 1 } }),
    ).rejects.toMatchObject({ category: "input_insufficient" });
  });
});
