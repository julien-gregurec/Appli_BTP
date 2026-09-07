/**
 * Référence d'objet de stockage.
 *
 * Une entité Drone ne porte **jamais** une URL : elle porte un couple (bucket, chemin). Les
 * URL sont signées, temporaires, et produites par `SignedMediaAccess` au moment de l'accès.
 * Persister une URL publique reviendrait à publier des médias de chantier.
 *
 * Ce module ne crée aucun bucket : il en nomme le contrat (§12 du brief noyau).
 */

import type { DroneProjectId, EntrepriseId } from "./ids";

export type DroneBucket = "drone-medias" | "drone-resultats" | "drone-exports" | "drone-partage";

export const DRONE_BUCKETS: readonly DroneBucket[] = [
  "drone-medias",
  "drone-resultats",
  "drone-exports",
  "drone-partage",
];

export function estDroneBucket(value: unknown): value is DroneBucket {
  return typeof value === "string" && (DRONE_BUCKETS as readonly string[]).includes(value);
}

export type StorageObjectRef = {
  readonly bucket: DroneBucket;
  readonly path: string;
};

/**
 * Chemin canonique `<entreprise_id>/<project_id>/<nom>`, repris du schéma éprouvé de
 * `colors-seaux` : les policies `storage.objects` valident l'UUID du **premier segment**,
 * donc l'`entreprise_id` doit rester en tête, sans exception.
 */
export function buildStoragePath(input: {
  readonly entreprise_id: EntrepriseId;
  readonly project_id: DroneProjectId;
  readonly filename: string;
}): string {
  return `${input.entreprise_id}/${input.project_id}/${input.filename}`;
}

/** Vrai si le chemin respecte la contrainte de premier segment attendue par les policies. */
export function cheminAppartientAEntreprise(path: string, entrepriseId: EntrepriseId): boolean {
  const [premierSegment, ...reste] = path.split("/");
  return premierSegment === entrepriseId && reste.length > 0;
}
