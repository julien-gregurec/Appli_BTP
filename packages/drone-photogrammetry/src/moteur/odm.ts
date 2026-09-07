/**
 * Adaptateur expérimental OpenDroneMap / NodeODM (§4 du brief prototype).
 *
 * **Statut : expérimental.** Il implémente le port `ReconstructionEngineAdapter`
 * de `@elsatia/drone-core` en parlant l'API HTTP de NodeODM (Docker local ou
 * environnement de test) et n'implique aucun hébergement Production. La licence
 * AGPL-3.0 d'ODM n'est **pas** validée commercialement : voir
 * `docs/drone/ODM_LICENSE_RISK.md`. Ce fichier est du code de prototype, pas
 * une décision de mise en marché.
 *
 * Transport HTTP et stockage sont injectés : les tests pilotent l'adaptateur
 * sans réseau, sans GPU et sans bucket.
 */

import type {
  EngineDescriptor,
  EngineJobHandle,
  EngineOutcome,
  EngineProgress,
  EngineSubmission,
  ReconstructionEngineAdapter,
  ReconstructionStatus,
} from "@elsatia/drone-core";

import {
  ErreurMoteur,
  horlogeSysteme,
  journaliser,
  lireParametres,
  PARAMETRES_SUPPORTES,
  validerSoumission,
  type Horloge,
  type LigneLog,
  type ParametresPrototype,
} from "./base";
import type { EcrivainBlocs } from "../ingestion/televersement";
import { extraireMetriquesOdm, type AssetMoteur } from "../sortie/normalisation";
import {
  rapatrierArtefacts,
  type DestinationArtefact,
  type ResultatRapatriement,
} from "../sortie/rapatriement";

/** Codes de statut NodeODM, traduits dans le vocabulaire du noyau. */
export const STATUT_NODEODM: Record<number, ReconstructionStatus> = {
  10: "queued",
  20: "processing",
  30: "failed",
  40: "completed",
  50: "cancelled",
};

export type ReponseHttp = {
  statut: number;
  corps: unknown;
};

export type FichierAEnvoyer = {
  nom: string;
  mime: string;
  contenu: Uint8Array;
};

export interface TransportNodeOdm {
  postJson(chemin: string, corps: unknown): Promise<ReponseHttp>;
  postFichiers(chemin: string, fichiers: FichierAEnvoyer[]): Promise<ReponseHttp>;
  get(chemin: string): Promise<ReponseHttp>;
  /** URL de téléchargement d'un asset. Interne à l'adaptateur : elle n'est jamais persistée. */
  uriTelechargement(uuid: string, asset: string): string;
  /** `null` quand l'asset n'existe pas (option non demandée, par exemple). */
  telechargerUrl(url: string): Promise<Uint8Array | null>;
}

export type ConfigTransportOdm = {
  /** Ex. `http://localhost:3000` — instance NodeODM locale ou de test. */
  baseUrl: string;
  /** Jeton NodeODM optionnel (`--token`). */
  token?: string | null;
  fetchImpl?: typeof fetch;
};

export function creerTransportFetch(config: ConfigTransportOdm): TransportNodeOdm {
  const base = config.baseUrl.replace(/\/+$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;
  const avecJeton = (chemin: string) =>
    config.token == null || config.token === ""
      ? `${base}${chemin}`
      : `${base}${chemin}${chemin.includes("?") ? "&" : "?"}token=${encodeURIComponent(config.token)}`;

  const lireReponse = async (reponse: Response): Promise<ReponseHttp> => {
    const texte = await reponse.text();
    let corps: unknown = texte;
    try {
      corps = texte.length > 0 ? JSON.parse(texte) : null;
    } catch {
      corps = texte;
    }
    return { statut: reponse.status, corps };
  };

  return {
    async postJson(chemin, corps) {
      const reponse = await fetchImpl(avecJeton(chemin), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corps),
      });
      return lireReponse(reponse);
    },
    async postFichiers(chemin, fichiers) {
      const formulaire = new FormData();
      for (const fichier of fichiers) {
        // Copie sur un ArrayBuffer propre : le contenu peut venir d'une vue
        // partagée, que `Blob` n'accepte pas.
        const contenu = new Uint8Array(fichier.contenu.byteLength);
        contenu.set(fichier.contenu);
        // Nom **généré** : aucune donnée client n'atteint le moteur (§22).
        formulaire.append("images", new Blob([contenu.buffer], { type: fichier.mime }), fichier.nom);
      }
      const reponse = await fetchImpl(avecJeton(chemin), { method: "POST", body: formulaire });
      return lireReponse(reponse);
    },
    async get(chemin) {
      const reponse = await fetchImpl(avecJeton(chemin), { method: "GET" });
      return lireReponse(reponse);
    },
    uriTelechargement(uuid, asset) {
      return avecJeton(`/task/${uuid}/download/${asset}`);
    },
    async telechargerUrl(url) {
      const reponse = await fetchImpl(url, { method: "GET" });
      if (reponse.status === 404) return null;
      if (!reponse.ok) {
        throw new ErreurMoteur("storage_unavailable", `Téléchargement refusé : HTTP ${reponse.status}`, {
          retryable: true,
        });
      }
      return new Uint8Array(await reponse.arrayBuffer());
    },
  };
}

/** Assets exposés au téléchargement par NodeODM. */
export const ASSETS_NODEODM = {
  orthophoto: "orthophoto.tif",
  mns: "dsm.tif",
  nuage: "georeferenced_model.laz",
  maillage: "textured_model.zip",
} as const;

export type ConfigAdaptateurOdm = {
  transport: TransportNodeOdm;
  /** Lit une URL signée d'image d'entrée. */
  lireMedia: (url: string) => Promise<Uint8Array>;
  /** Où ranger les artefacts rapatriés. */
  destination: DestinationArtefact;
  /** Stockage de destination. En mémoire dans les tests et la démo. */
  ecrivain: EcrivainBlocs;
  /** Version de NodeODM/ODM ciblée, figée dans la clé d'idempotence. */
  moteurVersion?: string;
  /** Lecture optionnelle du `stats.json` d'ODM, pour les métriques de qualité. */
  lireStats?: (uuid: string) => Promise<unknown | null>;
  horloge?: Horloge;
  /** Nombre d'images par requête d'envoi. */
  tailleLot?: number;
  supporteGpu?: boolean;
};

type OptionOdm = { name: string; value: string | number | boolean };

/** Traduction des paramètres ELSATIA en options NodeODM. */
export function traduireParametresOdm(parametres: ParametresPrototype): OptionOdm[] {
  const options: OptionOdm[] = [
    { name: "mesh-quality", value: parametres.mesh_quality },
    { name: "dsm", value: parametres.produce_dsm },
    { name: "pc-las", value: parametres.produce_point_cloud },
    { name: "skip-3dmodel", value: !parametres.produce_mesh },
    { name: "skip-orthophoto", value: !parametres.produce_orthophoto },
  ];
  if (parametres.gsd_target_cm !== null) {
    options.push({ name: "orthophoto-resolution", value: parametres.gsd_target_cm });
  }
  if (parametres.crs !== "EPSG:4326") {
    options.push({ name: "crs", value: parametres.crs });
  }
  return options;
}

function exigerSucces(reponse: ReponseHttp, contexte: string): void {
  if (reponse.statut >= 200 && reponse.statut < 300) return;
  throw new ErreurMoteur("engine_failure", `${contexte} : HTTP ${reponse.statut}`, {
    retryable: reponse.statut >= 500 || reponse.statut === 429,
    engineMessage: typeof reponse.corps === "string" ? reponse.corps : JSON.stringify(reponse.corps),
  });
}

function lireChamp(corps: unknown, champ: string): unknown {
  if (typeof corps !== "object" || corps === null) return undefined;
  return (corps as Record<string, unknown>)[champ];
}

/** Adaptateur ODM, plus les fichiers qu'il sait rapatrier — utile aux tests et au diagnostic. */
export type AdaptateurOdm = ReconstructionEngineAdapter & {
  assets(handle: EngineJobHandle, parametres: ParametresPrototype): AssetMoteur[];
  dernierRapatriement(): ResultatRapatriement | null;
};

export function creerAdaptateurOdm(config: ConfigAdaptateurOdm): AdaptateurOdm {
  const horloge = config.horloge ?? horlogeSysteme;
  const moteurVersion = config.moteurVersion ?? "nodeodm-inconnu";
  const tailleLot = config.tailleLot ?? 20;
  // Les paramètres soumis sont mémorisés pour savoir quels artefacts réclamer.
  const parametresParTache = new Map<string, ParametresPrototype>();
  let dernierRapatriement: ResultatRapatriement | null = null;

  const infoTache = async (uuid: string): Promise<Record<string, unknown>> => {
    const reponse = await config.transport.get(`/task/${uuid}/info`);
    exigerSucces(reponse, "Lecture de l'état NodeODM");
    if (typeof reponse.corps !== "object" || reponse.corps === null) {
      throw new ErreurMoteur("engine_failure", "Réponse /info illisible", { retryable: true });
    }
    return reponse.corps as Record<string, unknown>;
  };

  const lireLogs = async (uuid: string): Promise<LigneLog[]> => {
    const reponse = await config.transport.get(`/task/${uuid}/output`);
    if (reponse.statut < 200 || reponse.statut >= 300 || !Array.isArray(reponse.corps)) return [];
    return (reponse.corps as unknown[])
      .filter((ligne): ligne is string => typeof ligne === "string")
      .map((ligne) => journaliser(horloge, "info", ligne));
  };

  const assets = (handle: EngineJobHandle, parametres: ParametresPrototype): AssetMoteur[] => {
    const demandes: string[] = [];
    if (parametres.produce_orthophoto) demandes.push(ASSETS_NODEODM.orthophoto);
    if (parametres.produce_dsm) demandes.push(ASSETS_NODEODM.mns);
    if (parametres.produce_point_cloud) demandes.push(ASSETS_NODEODM.nuage);
    if (parametres.produce_mesh) demandes.push(ASSETS_NODEODM.maillage);
    return demandes.map((asset) => ({
      nom: asset,
      url: config.transport.uriTelechargement(handle.engine_job_id, asset),
      octets: null,
    }));
  };

  return {
    describe(): EngineDescriptor {
      return {
        engine: "odm",
        version: moteurVersion,
        supports_gpu: config.supporteGpu ?? true,
        supported_parameters: PARAMETRES_SUPPORTES,
      };
    },

    async submit(submission: EngineSubmission): Promise<EngineJobHandle> {
      validerSoumission(submission);
      const parametres = lireParametres(submission.parameters);

      const init = await config.transport.postJson("/task/new/init", {
        name: `elsatia-${submission.job_id}`,
        options: traduireParametresOdm(parametres),
      });
      exigerSucces(init, "Création de la tâche NodeODM");
      const uuid = lireChamp(init.corps, "uuid");
      if (typeof uuid !== "string" || uuid.length === 0) {
        throw new ErreurMoteur("engine_failure", "NodeODM n'a pas retourné d'uuid", {
          retryable: true,
        });
      }

      for (let debut = 0; debut < submission.input_urls.length; debut += tailleLot) {
        const lot = submission.input_urls.slice(debut, debut + tailleLot);
        const fichiers: FichierAEnvoyer[] = [];
        for (const [decalage, url] of lot.entries()) {
          fichiers.push({
            // Nom généré à partir du rang : aucune donnée client n'atteint le moteur.
            nom: `image-${(debut + decalage + 1).toString().padStart(5, "0")}.jpg`,
            mime: "image/jpeg",
            contenu: await config.lireMedia(url),
          });
        }
        const envoi = await config.transport.postFichiers(`/task/new/upload/${uuid}`, fichiers);
        exigerSucces(envoi, "Envoi des images à NodeODM");
      }

      const commit = await config.transport.postJson(`/task/new/commit/${uuid}`, {});
      exigerSucces(commit, "Validation de la tâche NodeODM");

      parametresParTache.set(uuid, parametres);
      return { engine_job_id: uuid, submitted_at: horloge().toISOString() };
    },

    async poll(handle: EngineJobHandle): Promise<EngineProgress> {
      const info = await infoTache(handle.engine_job_id);
      const statutBrut = lireChamp(info, "status");
      const code = Number(lireChamp(statutBrut, "code"));
      const statut = STATUT_NODEODM[code];
      if (statut === undefined) {
        throw new ErreurMoteur("engine_failure", `Statut NodeODM inconnu : ${code}`, {
          retryable: true,
        });
      }
      const progressionBrute = Number(lireChamp(info, "progress"));
      const messageMoteur = lireChamp(statutBrut, "errorMessage");

      return {
        status: statut,
        percent: Number.isFinite(progressionBrute)
          ? Math.min(100, Math.max(0, progressionBrute))
          : null,
        // NodeODM ne nomme pas l'étape en cours dans `/info`.
        stage: null,
        error_category: statut === "failed" ? "engine_failure" : null,
        error_message: typeof messageMoteur === "string" ? messageMoteur : null,
      };
    },

    async cancel(handle: EngineJobHandle): Promise<void> {
      const reponse = await config.transport.postJson("/task/cancel", {
        uuid: handle.engine_job_id,
      });
      exigerSucces(reponse, "Annulation de la tâche NodeODM");
    },

    async fetchOutcome(handle: EngineJobHandle): Promise<EngineOutcome> {
      const info = await infoTache(handle.engine_job_id);
      const code = Number(lireChamp(lireChamp(info, "status"), "code"));
      const statut = STATUT_NODEODM[code];

      if (statut === "failed") {
        const messageMoteur = lireChamp(lireChamp(info, "status"), "errorMessage");
        throw new ErreurMoteur("engine_failure", "La tâche NodeODM a échoué", {
          retryable: true,
          engineMessage: typeof messageMoteur === "string" ? messageMoteur : null,
          logs: await lireLogs(handle.engine_job_id),
        });
      }
      if (statut === "cancelled") {
        throw new ErreurMoteur("cancelled_by_user", "La tâche NodeODM a été annulée");
      }
      if (statut !== "completed") {
        throw new ErreurMoteur(
          "unknown",
          `Résultat demandé alors que la tâche est en statut ${statut ?? code}`,
          { retryable: true },
        );
      }

      const parametres = parametresParTache.get(handle.engine_job_id);
      if (parametres === undefined) {
        throw new ErreurMoteur(
          "unknown",
          "Paramètres de la tâche inconnus de cet adaptateur : résultat non rapatriable",
        );
      }

      const rapatriement = await rapatrierArtefacts({
        assets: assets(handle, parametres),
        telechargeur: (url) => config.transport.telechargerUrl(url),
        ecrivain: config.ecrivain,
        destination: config.destination,
      });
      dernierRapatriement = rapatriement;

      const imagesFournies = Number(lireChamp(info, "imagesCount"));
      const tempsMs = Number(lireChamp(info, "processingTime"));
      const stats = config.lireStats === undefined ? null : await config.lireStats(handle.engine_job_id);

      return {
        artifacts: rapatriement.artefacts,
        quality_metrics: extraireMetriquesOdm(
          stats,
          Number.isFinite(imagesFournies) ? imagesFournies : null,
        ),
        duration_s: Number.isFinite(tempsMs) && tempsMs > 0 ? tempsMs / 1000 : 0,
        // Aucun tarif n'étant relevé (§14/§15), le coût reste inconnu ici.
        estimated_cost_cents: null,
      };
    },

    assets,
    dernierRapatriement: () => dernierRapatriement,
  };
}
