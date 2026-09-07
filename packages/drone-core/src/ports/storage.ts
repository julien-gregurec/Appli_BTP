/**
 * Contrats de stockage (§12 du brief noyau).
 *
 * **Aucun bucket n'est créé ici**, aucune implémentation n'est fournie : ce fichier définit ce
 * qu'une implémentation devra savoir faire. La contrainte connue est déjà inscrite dans le
 * contrat : `supabase/config.toml` limite aujourd'hui les objets à 50 MiB, alors qu'un projet
 * drone pèse des gigaoctets. L'upload reprenable (TUS) n'est donc pas une option de confort,
 * c'est le mode d'upload par défaut de `MediaStorageAdapter`.
 */

import type { IsoDateTime } from "../common";
import type { DroneProjectId, EntrepriseId, MediaAssetId, ReconstructionJobId } from "../ids";
import type { StorageObjectRef } from "../storage-ref";

export type UploadTicket = {
  /** URL d'upload signée, à durée de vie limitée. Elle ne se persiste pas. */
  readonly upload_url: string;
  readonly storage_ref: StorageObjectRef;
  readonly expires_at: IsoDateTime;
  /** Protocole attendu par le fournisseur. TUS est le mode nominal pour les gros médias. */
  readonly protocol: "tus" | "put";
};

export type StoredObjectMetadata = {
  readonly storage_ref: StorageObjectRef;
  readonly size_bytes: number;
  readonly mime: string;
  readonly sha256: string | null;
  readonly created_at: IsoDateTime;
};

export type SignedUrl = {
  readonly url: string;
  readonly expires_at: IsoDateTime;
};

/**
 * Ingestion des médias. Les implémentations sont responsables de la reprise d'upload et de la
 * déduplication par `sha256` (§74) ; le noyau n'en fixe que le contrat.
 */
export interface MediaStorageAdapter {
  createUploadTicket(input: {
    readonly entreprise_id: EntrepriseId;
    readonly project_id: DroneProjectId;
    readonly media_id: MediaAssetId;
    readonly filename: string;
    readonly mime: string;
    readonly size_bytes: number;
  }): Promise<UploadTicket>;

  /** Confirme un upload terminé et retourne les métadonnées réellement stockées. */
  finalizeUpload(ref: StorageObjectRef): Promise<StoredObjectMetadata>;

  getObjectMetadata(ref: StorageObjectRef): Promise<StoredObjectMetadata | null>;

  /**
   * §92 — la suppression d'un projet doit reprendre explicitement les objets de stockage. La
   * cascade SQL seule laisserait des objets orphelins, facturés et invisibles.
   */
  deleteObjects(refs: readonly StorageObjectRef[]): Promise<void>;
}

/** Artefacts produits par une reconstruction (nuage, maillage, orthophoto, MNS, GLB). */
export interface ReconstructionArtifactStorage {
  putArtifact(input: {
    readonly entreprise_id: EntrepriseId;
    readonly project_id: DroneProjectId;
    readonly job_id: ReconstructionJobId;
    readonly filename: string;
    readonly mime: string;
    readonly body: ArrayBuffer;
  }): Promise<StoredObjectMetadata>;

  listArtifacts(job_id: ReconstructionJobId): Promise<readonly StoredObjectMetadata[]>;

  deleteArtifacts(job_id: ReconstructionJobId): Promise<void>;
}

/**
 * Accès en lecture aux médias et livrables. Toute lecture passe par une URL **signée et
 * expirante** : aucun bucket Drone n'est public, y compris `drone-partage` (§86).
 */
export interface SignedMediaAccess {
  createSignedUrl(ref: StorageObjectRef, ttl_seconds: number): Promise<SignedUrl>;

  createSignedUrls(
    refs: readonly StorageObjectRef[],
    ttl_seconds: number,
  ): Promise<readonly SignedUrl[]>;
}
