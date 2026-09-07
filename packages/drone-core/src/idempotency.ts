/**
 * Clé d'idempotence d'une reconstruction (§10 du brief noyau, §95 du brief drone).
 *
 * Clé stable = `(project_id, input_set, engine, engine_version, parameters)`.
 *
 * Deux propriétés à préserver, et elles sont testées :
 *
 * - **l'ordre du jeu de médias n'a pas de sens** : deux soumissions des mêmes photos dans un
 *   ordre différent sont la même reconstruction. Le jeu est donc trié et dédoublonné avant
 *   empreinte ;
 * - **l'ordre des clés de paramètres n'a pas de sens non plus** : la normalisation stable de
 *   `serialization.ts` s'en charge.
 *
 * Conséquence voulue : relancer un travail identique retrouve le travail existant ; changer
 * un seul paramètre en crée un nouveau, sans détruire le résultat précédent.
 */

import type { DroneProjectId, MediaAssetId } from "./ids";
import type { ReconstructionEngine, ReconstructionParameters } from "./reconstruction";
import { normalizeForStableJson, sha256Hex, stableStringify } from "./serialization";

/** Version du schéma de clé. La changer invalide volontairement toutes les clés existantes. */
export const IDEMPOTENCY_SCHEMA_VERSION = 1 as const;

export type IdempotencyInput = {
  readonly project_id: DroneProjectId;
  readonly input_set: readonly MediaAssetId[];
  readonly engine: ReconstructionEngine;
  readonly engine_version: string;
  readonly parameters: ReconstructionParameters;
};

export class JeuMediasVideError extends Error {
  constructor() {
    super("Une reconstruction sans média d'entrée n'a pas de clé d'idempotence");
    this.name = "JeuMediasVideError";
  }
}

/** Jeu de médias canonique : dédoublonné et trié. */
export function canonicalInputSet(inputSet: readonly MediaAssetId[]): readonly MediaAssetId[] {
  return [...new Set(inputSet)].sort();
}

/**
 * Charge utile canonique de la clé. Exposée séparément de l'empreinte parce qu'elle est
 * lisible : en cas d'incident, on peut comparer deux charges utiles sans casser un hash.
 */
export function buildIdempotencyPayload(input: IdempotencyInput): string {
  const inputSet = canonicalInputSet(input.input_set);
  if (inputSet.length === 0) throw new JeuMediasVideError();

  return stableStringify({
    schema_version: IDEMPOTENCY_SCHEMA_VERSION,
    project_id: input.project_id,
    input_set: inputSet,
    engine: input.engine,
    engine_version: input.engine_version,
    parameters: normalizeForStableJson(input.parameters),
  });
}

/** Empreinte SHA-256 hexadécimale de la charge utile canonique. */
export async function computeIdempotencyKey(input: IdempotencyInput): Promise<string> {
  return sha256Hex(buildIdempotencyPayload(input));
}
