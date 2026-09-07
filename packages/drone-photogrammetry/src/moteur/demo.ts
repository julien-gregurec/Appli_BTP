/**
 * Moteur de démonstration déterministe (§23 du brief prototype).
 *
 * `engine: "demo"` est prévu par le noyau (`ReconstructionEngine`). Il permet de
 * dérouler un travail complet — soumission, progression, logs, artefacts,
 * échec, annulation — **sans GPU, sans réseau et sans horloge réelle**. C'est ce
 * qui rend la démonstration et les tests possibles avant qu'une seule machine
 * soit louée.
 *
 * Il n'imite pas la qualité d'une reconstruction : il imite son *cycle de vie*.
 */

import type {
  EngineDescriptor,
  EngineJobHandle,
  EngineOutcome,
  EngineProgress,
  EngineSubmission,
  ReconstructionArtifacts,
  ReconstructionEngineAdapter,
  ReconstructionStatus,
  StorageObjectRef,
} from "@elsatia/drone-core";

import {
  ARTEFACTS_VIDES,
  ErreurMoteur,
  journaliser,
  lireParametres,
  PARAMETRES_SUPPORTES,
  validerSoumission,
  type Horloge,
  type LigneLog,
  type ParametresPrototype,
} from "./base";
import { composerArtefacts, type ChampArtefact } from "../sortie/normalisation";

export const ETAPES_DEMO = [
  "Analyse des images",
  "Appariement des points caractéristiques",
  "Nuage de points dense",
  "Maillage et texturation",
  "Orthophoto et MNS",
] as const;

export type OptionsMoteurDemo = {
  /** Horloge injectée : la démonstration et les tests restent déterministes. */
  horloge?: Horloge;
  /** Index d'étape (0-based) à laquelle le moteur doit échouer. `null` = succès. */
  echouerAEtape?: number | null;
  /** Message d'échec renvoyé tel quel, comme le ferait un vrai moteur (§21). */
  messageEchec?: string;
  /** Durée simulée, en secondes, pour les formules de coût. */
  dureeS?: number;
  version?: string;
  /** Emplacement de rangement des artefacts simulés. */
  destination?: (champ: ChampArtefact, engineJobId: string) => StorageObjectRef;
};

type TravailDemo = {
  handle: EngineJobHandle;
  statut: ReconstructionStatus;
  etape: number;
  logs: LigneLog[];
  imagesFournies: number;
  parametres: ParametresPrototype;
  messageMoteur: string | null;
};

export type MoteurDemo = ReconstructionEngineAdapter & {
  /** Fait avancer le moteur d'une étape. Aucune minuterie, aucun aléa. */
  avancer(engineJobId: string): void;
  /** Déroule le travail jusqu'à un état terminal. */
  deroulerJusquAuBout(engineJobId: string): void;
  travaux(): TravailDemo[];
  logs(engineJobId: string): LigneLog[];
};

let compteur = 0;

const DESTINATION_DEFAUT = (champ: ChampArtefact, engineJobId: string): StorageObjectRef => ({
  bucket: "drone-resultats",
  path: `demo/${engineJobId}/${champ}`,
});

export function creerMoteurDemo(options: OptionsMoteurDemo = {}): MoteurDemo {
  const horloge = options.horloge ?? (() => new Date("2026-09-07T09:00:00.000Z"));
  const version = options.version ?? "demo-1.0.0";
  const echouerAEtape = options.echouerAEtape ?? null;
  const dureeS = options.dureeS ?? 600;
  const destination = options.destination ?? DESTINATION_DEFAUT;
  const travaux = new Map<string, TravailDemo>();

  const exiger = (handle: EngineJobHandle): TravailDemo => {
    const travail = travaux.get(handle.engine_job_id);
    if (travail === undefined) {
      throw new ErreurMoteur("unknown", `Travail inconnu : ${handle.engine_job_id}`);
    }
    return travail;
  };

  const avancer = (engineJobId: string): void => {
    const travail = travaux.get(engineJobId);
    if (travail === undefined) return;
    if (travail.statut === "completed" || travail.statut === "failed") return;
    if (travail.statut === "cancelled") return;

    travail.statut = "processing";
    if (echouerAEtape !== null && travail.etape === echouerAEtape) {
      travail.statut = "failed";
      travail.messageMoteur = options.messageEchec ?? "Échec simulé du moteur de démonstration";
      travail.logs.push(journaliser(horloge, "erreur", travail.messageMoteur));
      return;
    }
    travail.logs.push(journaliser(horloge, "info", ETAPES_DEMO[travail.etape]));
    travail.etape += 1;
    if (travail.etape >= ETAPES_DEMO.length) travail.statut = "completed";
  };

  const artefactsDe = (travail: TravailDemo): ReconstructionArtifacts => {
    const champs: ChampArtefact[] = [];
    if (travail.parametres.produce_point_cloud) champs.push("point_cloud");
    if (travail.parametres.produce_mesh) champs.push("mesh", "texture", "lightweight_glb");
    if (travail.parametres.produce_orthophoto) champs.push("orthophoto");
    if (travail.parametres.produce_dsm) champs.push("digital_surface_model");
    return composerArtefacts(
      champs.map((champ) => ({ champ, ref: destination(champ, travail.handle.engine_job_id) })),
    );
  };

  return {
    describe(): EngineDescriptor {
      return {
        engine: "demo",
        version,
        supports_gpu: false,
        supported_parameters: PARAMETRES_SUPPORTES,
      };
    },

    async submit(submission: EngineSubmission): Promise<EngineJobHandle> {
      validerSoumission(submission);
      const parametres = lireParametres(submission.parameters);
      compteur += 1;
      const handle: EngineJobHandle = {
        engine_job_id: `demo-${compteur.toString().padStart(4, "0")}`,
        submitted_at: horloge().toISOString(),
      };
      travaux.set(handle.engine_job_id, {
        handle,
        statut: "queued",
        etape: 0,
        logs: [journaliser(horloge, "info", `Travail ${submission.job_id} accepté`)],
        imagesFournies: submission.input_urls.length,
        parametres,
        messageMoteur: null,
      });
      return handle;
    },

    async poll(handle: EngineJobHandle): Promise<EngineProgress> {
      const travail = exiger(handle);
      return {
        status: travail.statut,
        percent: Math.round((travail.etape / ETAPES_DEMO.length) * 100),
        stage: travail.etape < ETAPES_DEMO.length ? ETAPES_DEMO[travail.etape] : null,
        error_category: travail.statut === "failed" ? "engine_failure" : null,
        error_message: travail.messageMoteur,
      };
    },

    async cancel(handle: EngineJobHandle): Promise<void> {
      const travail = exiger(handle);
      if (travail.statut === "completed") {
        throw new ErreurMoteur("unknown", "Travail déjà terminé : annulation sans objet");
      }
      travail.statut = "cancelled";
      travail.logs.push(journaliser(horloge, "avertissement", "Travail annulé"));
    },

    async fetchOutcome(handle: EngineJobHandle): Promise<EngineOutcome> {
      const travail = exiger(handle);
      if (travail.statut === "failed") {
        throw new ErreurMoteur("engine_failure", "Reconstruction simulée en échec", {
          retryable: true,
          engineMessage: travail.messageMoteur,
          logs: [...travail.logs],
          // §21 — ce qui a été produit avant l'échec est conservé.
          partialArtifacts: {
            ...ARTEFACTS_VIDES,
            point_cloud: destination("point_cloud", handle.engine_job_id),
          },
        });
      }
      if (travail.statut === "cancelled") {
        throw new ErreurMoteur("cancelled_by_user", "Travail annulé");
      }
      if (travail.statut !== "completed") {
        throw new ErreurMoteur("unknown", `Résultat demandé en statut ${travail.statut}`, {
          retryable: true,
        });
      }

      return {
        artifacts: artefactsDe(travail),
        quality_metrics: {
          reprojection_error_px: 0.42,
          ground_sampling_distance_mm_px: 18,
          control_point_error_m: null,
          source_accuracy: "gnss_standard",
          calibrated_cameras_count: travail.imagesFournies,
          input_images_count: travail.imagesFournies,
          retained_images_ratio: 1,
        },
        duration_s: dureeS,
        estimated_cost_cents: null,
      };
    },

    avancer,

    deroulerJusquAuBout(engineJobId: string): void {
      for (let index = 0; index <= ETAPES_DEMO.length; index += 1) {
        const travail = travaux.get(engineJobId);
        if (travail === undefined) return;
        if (
          travail.statut === "completed" ||
          travail.statut === "failed" ||
          travail.statut === "cancelled"
        ) {
          return;
        }
        avancer(engineJobId);
      }
    },

    travaux: () => [...travaux.values()],
    logs: (engineJobId: string) => [...(travaux.get(engineJobId)?.logs ?? [])],
  };
}
