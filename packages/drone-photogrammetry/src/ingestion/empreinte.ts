/**
 * Empreintes et déduplication (§19 du brief prototype).
 *
 * Le sha256 sert deux fois : intégrité du téléversement par morceaux
 * (`televersement.ts`) et déduplication logique des médias.
 *
 * La **clé d'idempotence d'un travail** n'est pas ici : elle appartient au
 * noyau (`@elsatia/drone-core`, `idempotency.ts`), qui la calcule sur la charge
 * utile canonique `(projet, jeu de médias trié, moteur, version, paramètres)`.
 * En redéfinir une seconde ici produirait deux clés pour une seule règle.
 */

import { createHash } from "node:crypto";

export function calculerSha256(contenu: Uint8Array): string {
  return createHash("sha256").update(contenu).digest("hex");
}

export function calculerSha256Texte(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

export type MediaEmpreinte = {
  mediaId: string;
  sha256: string;
};

export type ResultatDeduplication<T extends MediaEmpreinte> = {
  /** Un exemplaire par empreinte, dans l'ordre d'arrivée. */
  retenus: T[];
  /** `mediaId` du doublon → `mediaId` de l'exemplaire retenu (`doublon_de`). */
  doublons: Map<string, string>;
};

/**
 * Déduplication **exacte** : même sha256, même octets. Les quasi-doublons
 * (rafales, images quasi identiques) relèvent du contrôle qualité, pas d'ici :
 * les supprimer sur un critère flou détruirait du recouvrement utile.
 */
export function dedupliquerMedias<T extends MediaEmpreinte>(medias: T[]): ResultatDeduplication<T> {
  const parEmpreinte = new Map<string, T>();
  const retenus: T[] = [];
  const doublons = new Map<string, string>();

  for (const media of medias) {
    const existant = parEmpreinte.get(media.sha256);
    if (existant === undefined) {
      parEmpreinte.set(media.sha256, media);
      retenus.push(media);
      continue;
    }
    doublons.set(media.mediaId, existant.mediaId);
  }

  return { retenus, doublons };
}
