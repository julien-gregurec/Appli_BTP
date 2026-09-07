/**
 * §17 du brief prototype — preuve de substitution de moteur.
 *
 * Le « client » de ce test est une fonction qui ne connaît que le port
 * `ReconstructionEngineAdapter` du noyau : elle ne cite ni ODM, ni Metashape, ni
 * le moteur de démonstration. Le même code, inchangé, pilote trois moteurs.
 */

import { describe, expect, it } from "vitest";

import {
  asDroneProjectId,
  asEntrepriseId,
  asMediaAssetId,
  asReconstructionJobId,
  type EngineDescriptor,
  type EngineJobHandle,
  type EngineOutcome,
  type EngineProgress,
  type ReconstructionEngineAdapter,
} from "@elsatia/drone-core";

import { creerFileReconstruction } from "../file/file-locale";
import { ecrireParametres, PARAMETRES_PROTOTYPE_DEFAUT } from "./base";
import { creerMoteurDemo } from "./demo";
import { creerAdaptateurMetashape } from "./metashape";
import { creerAdaptateurOdm, type TransportNodeOdm } from "./odm";
import { creerEcrivainMemoire } from "../ingestion/televersement";
import { verifierCompletude } from "../sortie/normalisation";

const ENTREPRISE = asEntrepriseId("11111111-1111-4111-8111-111111111111");
const PROJET = asDroneProjectId("22222222-2222-4222-8222-222222222222");
const JOB = asReconstructionJobId("33333333-3333-4333-8333-333333333333");
const MEDIAS = [1, 2, 3, 4].map((index) =>
  asMediaAssetId(`44444444-4444-4444-8444-${index.toString().padStart(12, "0")}`),
);

/**
 * LE CLIENT. Aucune connaissance d'un moteur particulier : le port et la file,
 * rien d'autre. C'est ce corps de fonction qui ne doit pas bouger d'une ligne
 * quand ODM est remplacé par Metashape.
 */
async function lancerReconstruction(
  moteur: ReconstructionEngineAdapter,
  avancer: (handle: EngineJobHandle) => void,
) {
  const file = creerFileReconstruction({ moteur });
  await file.soumettre({
    jobId: JOB,
    entrepriseId: ENTREPRISE,
    projetId: PROJET,
    inputSet: MEDIAS,
    inputUrls: MEDIAS.map((media) => `https://stockage.test/${media}.jpg?sig=x`),
    parameters: ecrireParametres(PARAMETRES_PROTOTYPE_DEFAUT),
  });
  await file.demarrerProchain();

  let travail = file.lire(JOB);
  for (let index = 0; index < 20 && travail.statut === "processing"; index += 1) {
    if (travail.handle !== null) avancer(travail.handle);
    travail = await file.rafraichir(JOB);
  }
  return travail;
}

/** Faux moteur tiers : vocabulaire, artefacts et formats différents d'ODM. */
function creerMoteurTiers(): ReconstructionEngineAdapter {
  const images = new Map<string, number>();
  return {
    describe(): EngineDescriptor {
      return {
        engine: "metashape",
        version: "9.9",
        supports_gpu: true,
        supported_parameters: ["mesh_quality"],
      };
    },
    async submit(submission): Promise<EngineJobHandle> {
      images.set("psx-1", submission.input_urls.length);
      return { engine_job_id: "psx-1", submitted_at: "2026-09-07T09:00:00.000Z" };
    },
    async poll(): Promise<EngineProgress> {
      return {
        status: "completed",
        percent: 100,
        stage: null,
        error_category: null,
        error_message: null,
      };
    },
    async cancel(): Promise<void> {},
    async fetchOutcome(): Promise<EngineOutcome> {
      return {
        artifacts: {
          point_cloud: { bucket: "drone-resultats", path: "psx/dense.las" },
          mesh: { bucket: "drone-resultats", path: "psx/model.obj" },
          texture: { bucket: "drone-resultats", path: "psx/tex.jpg" },
          orthophoto: { bucket: "drone-resultats", path: "psx/ortho.tif" },
          digital_surface_model: { bucket: "drone-resultats", path: "psx/dem.tif" },
          lightweight_glb: null,
        },
        quality_metrics: {
          reprojection_error_px: 0.3,
          ground_sampling_distance_mm_px: 15,
          control_point_error_m: null,
          source_accuracy: "gnss_standard",
          calibrated_cameras_count: images.get("psx-1") ?? 0,
          input_images_count: images.get("psx-1") ?? 0,
          retained_images_ratio: 1,
        },
        duration_s: 1200,
        estimated_cost_cents: null,
      };
    },
  };
}

/** NodeODM minimal : la tâche est terminée dès la première interrogation. */
function creerTransportTermine(): TransportNodeOdm {
  return {
    async postJson(chemin: string) {
      return { statut: 200, corps: chemin === "/task/new/init" ? { uuid: "uuid-1" } : {} };
    },
    async postFichiers() {
      return { statut: 200, corps: {} };
    },
    async get(chemin: string) {
      if (chemin.endsWith("/info")) {
        return {
          statut: 200,
          corps: { imagesCount: 4, progress: 100, processingTime: 600_000, status: { code: 40 } },
        };
      }
      return { statut: 200, corps: [] };
    },
    uriTelechargement(uuid: string, asset: string) {
      return `http://nodeodm.test/task/${uuid}/download/${asset}`;
    },
    async telechargerUrl() {
      return Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    },
  };
}

describe("substitution de moteur (§17)", () => {
  it("le même code client pilote le moteur de démonstration, ODM et un moteur tiers", async () => {
    const demo = creerMoteurDemo();
    const surDemo = await lancerReconstruction(demo, (handle) =>
      demo.avancer(handle.engine_job_id),
    );

    const odm = creerAdaptateurOdm({
      transport: creerTransportTermine(),
      ecrivain: creerEcrivainMemoire(),
      lireMedia: async () => Uint8Array.from([0xff, 0xd8, 0xff]),
      destination: ({ champ }) => ({ bucket: "drone-resultats", path: `odm/${champ}` }),
      moteurVersion: "3.5.0",
    });
    const surOdm = await lancerReconstruction(odm, () => {});

    const surTiers = await lancerReconstruction(creerMoteurTiers(), () => {});

    for (const travail of [surDemo, surOdm, surTiers]) {
      expect(travail.statut).toBe("completed");
      expect(travail.outcome).not.toBeNull();
      // Chaque moteur livre en plus ce qui lui est propre ; ce qui est garanti
      // au client, ce sont les emplacements demandés.
      expect(verifierCompletude(travail.outcome!.artifacts, PARAMETRES_PROTOTYPE_DEFAUT)).toEqual([]);
    }

    expect(surDemo.engine).toBe("demo");
    expect(surOdm.engine).toBe("odm");
    expect(surTiers.engine).toBe("metashape");
    // Trois moteurs, trois clés d'idempotence distinctes pour le même jeu.
    expect(new Set([surDemo, surOdm, surTiers].map((t) => t.idempotencyKey)).size).toBe(3);
  });

  it("remplacer un moteur par Metashape ne touche pas au code client", async () => {
    const travail = await lancerReconstruction(creerAdaptateurMetashape(), () => {});

    // Le client s'exécute inchangé ; c'est l'adaptateur qui refuse, faute de licence.
    expect(travail.statut).toBe("failed");
    expect(travail.echec?.message).toContain("licence Service Provider");
    expect(travail.attempts).toBe(1);
  });
});
