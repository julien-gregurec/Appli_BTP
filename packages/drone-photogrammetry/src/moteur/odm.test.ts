import { describe, expect, it } from "vitest";

import { asReconstructionJobId, type EngineSubmission } from "@elsatia/drone-core";

import { ecrireParametres, ErreurMoteur, PARAMETRES_PROTOTYPE_DEFAUT } from "./base";
import {
  creerAdaptateurOdm,
  traduireParametresOdm,
  type FichierAEnvoyer,
  type ReponseHttp,
  type TransportNodeOdm,
} from "./odm";
import { creerEcrivainMemoire } from "../ingestion/televersement";

const SOUMISSION: EngineSubmission = {
  job_id: asReconstructionJobId("33333333-3333-4333-8333-333333333333"),
  input_urls: [1, 2, 3, 4].map((index) => `https://stockage.test/media-${index}.jpg?sig=x`),
  parameters: ecrireParametres(PARAMETRES_PROTOTYPE_DEFAUT),
};

const HANDLE = { engine_job_id: "uuid-odm-1", submitted_at: "2026-09-07T09:00:00.000Z" };

type EtatStub = {
  code: number;
  progress?: number;
  processingTime?: number;
  errorMessage?: string;
  echouerSur?: string;
  statutHttp?: number;
  assetsAbsents?: string[];
};

function creerTransportStub(etat: EtatStub) {
  const appels: Array<{ chemin: string; fichiers?: string[]; corps?: unknown }> = [];
  const telechargements: string[] = [];

  const transport: TransportNodeOdm = {
    async postJson(chemin: string, corps: unknown): Promise<ReponseHttp> {
      appels.push({ chemin, corps });
      if (etat.echouerSur === chemin) return { statut: etat.statutHttp ?? 500, corps: "boum" };
      if (chemin === "/task/new/init") return { statut: 200, corps: { uuid: "uuid-odm-1" } };
      return { statut: 200, corps: { success: true } };
    },
    async postFichiers(chemin: string, fichiers: FichierAEnvoyer[]): Promise<ReponseHttp> {
      appels.push({ chemin, fichiers: fichiers.map((fichier) => fichier.nom) });
      if (etat.echouerSur === chemin) return { statut: etat.statutHttp ?? 500, corps: "boum" };
      return { statut: 200, corps: { success: true } };
    },
    async get(chemin: string): Promise<ReponseHttp> {
      appels.push({ chemin });
      if (chemin.endsWith("/info")) {
        return {
          statut: 200,
          corps: {
            uuid: "uuid-odm-1",
            imagesCount: 4,
            progress: etat.progress ?? 0,
            processingTime: etat.processingTime ?? 0,
            status: { code: etat.code, errorMessage: etat.errorMessage },
          },
        };
      }
      if (chemin.endsWith("/output")) {
        return { statut: 200, corps: ["étape 1", "étape 2 : erreur"] };
      }
      return { statut: 404, corps: null };
    },
    uriTelechargement(uuid: string, asset: string): string {
      return `http://nodeodm.test/task/${uuid}/download/${asset}`;
    },
    async telechargerUrl(url: string): Promise<Uint8Array | null> {
      telechargements.push(url);
      if ((etat.assetsAbsents ?? []).some((asset) => url.endsWith(asset))) return null;
      // Contenu minimal, mais avec une signature réelle : TIFF pour les images
      // géoréférencées, LAS pour le nuage, ZIP pour le maillage texturé.
      if (url.endsWith(".tif")) return Uint8Array.from([0x49, 0x49, 0x2a, 0x00, 1, 2, 3, 4]);
      if (url.endsWith(".laz")) return Uint8Array.from([0x4c, 0x41, 0x53, 0x46, 1, 2, 3, 4]);
      return Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    },
  };

  return { transport, appels, telechargements };
}

function adaptateur(etat: EtatStub, tailleLot = 20) {
  const { transport, appels, telechargements } = creerTransportStub(etat);
  const ecrivain = creerEcrivainMemoire();
  return {
    appels,
    telechargements,
    ecrivain,
    adaptateur: creerAdaptateurOdm({
      transport,
      ecrivain,
      lireMedia: async () => Uint8Array.from([0xff, 0xd8, 0xff]),
      destination: ({ champ }) => ({
        bucket: "drone-resultats",
        path: `entreprise/projet/${champ}`,
      }),
      moteurVersion: "test",
      tailleLot,
    }),
  };
}

describe("adaptateur ODM — soumission", () => {
  it("enchaîne init, envoi des images puis commit", async () => {
    const { adaptateur: moteur, appels } = adaptateur({ code: 10 }, 3);
    const handle = await moteur.submit(SOUMISSION);

    expect(handle.engine_job_id).toBe("uuid-odm-1");
    expect(appels.map((appel) => appel.chemin)).toEqual([
      "/task/new/init",
      "/task/new/upload/uuid-odm-1",
      "/task/new/upload/uuid-odm-1",
      "/task/new/commit/uuid-odm-1",
    ]);
    // Lotissement : 4 images en lots de 3.
    expect(appels[1].fichiers).toHaveLength(3);
    expect(appels[2].fichiers).toHaveLength(1);
  });

  it("n'envoie au moteur que des noms générés", async () => {
    const { adaptateur: moteur, appels } = adaptateur({ code: 10 });
    await moteur.submit(SOUMISSION);

    expect(appels[1].fichiers).toEqual([
      "image-00001.jpg",
      "image-00002.jpg",
      "image-00003.jpg",
      "image-00004.jpg",
    ]);
    expect(JSON.stringify(appels)).not.toContain("stockage.test");
  });

  it("refuse une soumission invalide avant tout appel réseau", async () => {
    const { adaptateur: moteur, appels } = adaptateur({ code: 10 });

    await expect(
      moteur.submit({ ...SOUMISSION, input_urls: [SOUMISSION.input_urls[0]] }),
    ).rejects.toMatchObject({ category: "input_insufficient" });
    await expect(
      moteur.submit({ ...SOUMISSION, input_urls: ["file:///etc/passwd", "a", "b"] }),
    ).rejects.toMatchObject({ category: "input_insufficient" });
    expect(appels).toHaveLength(0);
  });

  it("marque une panne serveur comme réessayable, pas une erreur de requête", async () => {
    await expect(
      adaptateur({ code: 10, echouerSur: "/task/new/init" }).adaptateur.submit(SOUMISSION),
    ).rejects.toMatchObject({ category: "engine_failure", retryable: true });

    await expect(
      adaptateur({
        code: 10,
        echouerSur: "/task/new/init",
        statutHttp: 400,
      }).adaptateur.submit(SOUMISSION),
    ).rejects.toMatchObject({ retryable: false });
  });
});

describe("adaptateur ODM — avancement", () => {
  it("traduit les codes NodeODM dans le vocabulaire du noyau", async () => {
    for (const [code, attendu] of [
      [10, "queued"],
      [20, "processing"],
      [30, "failed"],
      [40, "completed"],
      [50, "cancelled"],
    ] as const) {
      const { adaptateur: moteur } = adaptateur({ code, progress: 50 });
      const avancement = await moteur.poll(HANDLE);
      expect(avancement.status).toBe(attendu);
      expect(avancement.percent).toBe(50);
    }
  });

  it("remonte le message moteur et la catégorie d'erreur", async () => {
    const { adaptateur: moteur } = adaptateur({ code: 30, errorMessage: "Not enough overlap" });
    const avancement = await moteur.poll(HANDLE);

    expect(avancement.error_message).toBe("Not enough overlap");
    expect(avancement.error_category).toBe("engine_failure");
  });

  it("refuse un code de statut inconnu au lieu de l'interpréter", async () => {
    const { adaptateur: moteur } = adaptateur({ code: 99 });
    await expect(moteur.poll(HANDLE)).rejects.toMatchObject({ category: "engine_failure" });
  });
});

describe("adaptateur ODM — résultat et annulation", () => {
  it("rapatrie les artefacts vers le stockage et retourne des références", async () => {
    const { adaptateur: moteur, ecrivain } = adaptateur({ code: 40, processingTime: 3_600_000 });
    await moteur.submit(SOUMISSION);
    const outcome = await moteur.fetchOutcome(HANDLE);

    expect(outcome.artifacts.orthophoto).toEqual({
      bucket: "drone-resultats",
      path: "entreprise/projet/orthophoto",
    });
    expect(outcome.artifacts.point_cloud).not.toBeNull();
    expect(outcome.artifacts.mesh).not.toBeNull();
    expect(outcome.artifacts.digital_surface_model).not.toBeNull();
    expect(outcome.duration_s).toBe(3600);
    expect(outcome.quality_metrics.input_images_count).toBe(4);
    expect(outcome.quality_metrics.reprojection_error_px).toBeNull();
    // Les fichiers ont réellement été écrits dans le stockage injecté.
    expect(ecrivain.fichiers().size).toBe(4);
  });

  it("signale un artefact absent sans faire échouer le travail", async () => {
    const { adaptateur: moteur } = adaptateur({ code: 40, assetsAbsents: ["dsm.tif"] });
    await moteur.submit(SOUMISSION);
    const outcome = await moteur.fetchOutcome(HANDLE);

    expect(outcome.artifacts.digital_surface_model).toBeNull();
    expect(moteur.dernierRapatriement()?.absents).toEqual(["dsm.tif"]);
  });

  it("lit les métriques de qualité quand le stats.json est fourni", async () => {
    const { transport } = creerTransportStub({ code: 40 });
    const moteur = creerAdaptateurOdm({
      transport,
      ecrivain: creerEcrivainMemoire(),
      lireMedia: async () => Uint8Array.from([0xff, 0xd8, 0xff]),
      destination: ({ champ }) => ({ bucket: "drone-resultats", path: `e/p/${champ}` }),
      lireStats: async () => ({
        reconstruction_statistics: { reconstructed_shots_count: 3 },
        processing_statistics: { average_gsd: 1.8 },
      }),
    });
    await moteur.submit(SOUMISSION);
    const outcome = await moteur.fetchOutcome(HANDLE);

    expect(outcome.quality_metrics.calibrated_cameras_count).toBe(3);
    expect(outcome.quality_metrics.ground_sampling_distance_mm_px).toBe(18);
    expect(outcome.quality_metrics.retained_images_ratio).toBeCloseTo(0.75, 6);
  });

  it("transforme un échec moteur en erreur porteuse du contexte", async () => {
    const { adaptateur: moteur } = adaptateur({ code: 30, errorMessage: "Process exited with 1" });
    await moteur.submit({ ...SOUMISSION });

    const erreur = await moteur.fetchOutcome(HANDLE).catch((cause: unknown) => cause);
    expect(erreur).toBeInstanceOf(ErreurMoteur);
    expect(erreur).toMatchObject({
      category: "engine_failure",
      retryable: true,
      engineMessage: "Process exited with 1",
    });
    expect((erreur as ErreurMoteur).logs).toHaveLength(2);
  });

  it("distingue annulation et résultat prématuré", async () => {
    await expect(adaptateur({ code: 50 }).adaptateur.fetchOutcome(HANDLE)).rejects.toMatchObject({
      category: "cancelled_by_user",
    });
    await expect(adaptateur({ code: 20 }).adaptateur.fetchOutcome(HANDLE)).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("refuse de composer un résultat pour une tâche qu'il n'a pas soumise", async () => {
    const { adaptateur: moteur } = adaptateur({ code: 40 });

    await expect(moteur.fetchOutcome(HANDLE)).rejects.toThrowError(/non rapatriable/);
  });

  it("annule par l'API NodeODM", async () => {
    const { adaptateur: moteur, appels } = adaptateur({ code: 20 });
    await moteur.cancel(HANDLE);

    expect(appels[0]).toEqual({ chemin: "/task/cancel", corps: { uuid: "uuid-odm-1" } });
  });
});

describe("traduction des paramètres", () => {
  it("mappe la qualité, les sorties et le système de coordonnées", () => {
    const options = traduireParametresOdm({
      ...PARAMETRES_PROTOTYPE_DEFAUT,
      mesh_quality: "high",
      gsd_target_cm: 2,
      produce_mesh: false,
      crs: "EPSG:2154",
    });
    const parNom = Object.fromEntries(options.map((option) => [option.name, option.value]));

    expect(parNom["mesh-quality"]).toBe("high");
    expect(parNom["skip-3dmodel"]).toBe(true);
    expect(parNom["orthophoto-resolution"]).toBe(2);
    expect(parNom.crs).toBe("EPSG:2154");
  });
});
