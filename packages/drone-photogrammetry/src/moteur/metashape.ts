/**
 * Agisoft Metashape — interface et configuration **uniquement** (§5 du brief
 * prototype).
 *
 * Aucune licence n'est acquise, aucun binaire n'est appelé. Ce fichier existe
 * pour une seule raison : prouver que le plan B se branche sur le même port
 * `ReconstructionEngineAdapter` que l'adaptateur ODM (§17), et que le jour où un
 * conseil PI écarte l'AGPL, le chantier se limite à ce fichier.
 *
 * Un adaptateur non licencié échoue **bruyamment** plutôt que de laisser croire
 * à une reconstruction en cours.
 */

import type {
  EngineDescriptor,
  EngineJobHandle,
  EngineOutcome,
  EngineProgress,
  ReconstructionEngineAdapter,
} from "@elsatia/drone-core";

import { ErreurMoteur, PARAMETRES_SUPPORTES } from "./base";

export const TYPES_LICENCE_METASHAPE = [
  "aucune",
  "service_provider_pay_per_use",
  "service_provider_location",
] as const;
export type TypeLicenceMetashape = (typeof TYPES_LICENCE_METASHAPE)[number];

export type ConfigMetashape = {
  /** Chemin du binaire `metashape` en exécution headless. */
  cheminBinaire: string | null;
  /** Serveur de licences flottantes, `hote:port`. */
  serveurLicence: string | null;
  typeLicence: TypeLicenceMetashape;
  /** Répertoire de travail des projets `.psx`. */
  repertoireProjets: string | null;
  gpuActive: boolean;
  version: string | null;
};

/** État réel au 2026-09-07 : rien n'est acquis. */
export const CONFIG_METASHAPE_NON_ACQUISE: ConfigMetashape = {
  cheminBinaire: null,
  serveurLicence: null,
  typeLicence: "aucune",
  repertoireProjets: null,
  gpuActive: false,
  version: null,
};

/** Retourne la liste des éléments manquants. Vide = configuration complète. */
export function verifierConfigMetashape(config: ConfigMetashape): string[] {
  const manques: string[] = [];
  if (config.typeLicence === "aucune") manques.push("licence Service Provider");
  if (config.serveurLicence === null) manques.push("serveur de licences");
  if (config.cheminBinaire === null) manques.push("binaire metashape");
  if (config.repertoireProjets === null) manques.push("répertoire de projets");
  if (config.version === null) manques.push("version du moteur");
  return manques;
}

/**
 * Catégorie d'erreur du noyau retenue : `unknown`. Ni `input_insufficient` ni
 * `engine_failure` ne décrivent honnêtement « l'adaptateur n'existe pas encore ».
 */
function refuser(config: ConfigMetashape): never {
  const manques = verifierConfigMetashape(config);
  if (manques.length > 0) {
    throw new ErreurMoteur(
      "unknown",
      `Adaptateur Metashape non exploitable — manquant : ${manques.join(", ")}`,
    );
  }
  throw new ErreurMoteur(
    "unknown",
    "Adaptateur Metashape non implémenté : le prototype s'arrête au contrat (§5)",
  );
}

/**
 * Fabrique un adaptateur Metashape conforme au port. Il satisfait le type, donc
 * le code client compile et s'exécute contre lui sans modification — et refuse
 * explicitement tant que la licence n'est pas acquise.
 */
export function creerAdaptateurMetashape(
  config: ConfigMetashape = CONFIG_METASHAPE_NON_ACQUISE,
): ReconstructionEngineAdapter {
  return {
    describe(): EngineDescriptor {
      return {
        engine: "metashape",
        version: config.version ?? "non-licencie",
        supports_gpu: config.gpuActive,
        supported_parameters: PARAMETRES_SUPPORTES,
      };
    },
    async submit(): Promise<EngineJobHandle> {
      return refuser(config);
    },
    async poll(): Promise<EngineProgress> {
      return refuser(config);
    },
    async cancel(): Promise<void> {
      return refuser(config);
    },
    async fetchOutcome(): Promise<EngineOutcome> {
      return refuser(config);
    },
  };
}
