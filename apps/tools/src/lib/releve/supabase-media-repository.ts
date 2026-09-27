/**
 * Adaptateur Supabase du port `ReleveMediaRepository` (Lot 4 — photos de terrain).
 *
 * Fichiers : bucket PRIVÉ `tools-releves` (upload sans écrasement, lecture par URL signée
 * courte, suppression soumise à la policy Storage). Lignes : PostgREST sous RLS. Retrait et
 * remplacement : RPC SECURITY INVOKER atomiques. Chaque écriture est idempotente (« déjà
 * présent » = succès) pour que la file hors ligne puisse rejouer une étape.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MediaRemoteError, RELEVE_STORAGE_BUCKET,
  type ElementId, type MediaFailureKind, type MediaId, type MediaPatch, type NewElementRow, type NewMediaRow, type PhotoMedia, type ReleveElement,
  type ReleveId, type ReleveMediaRepository, type RetiredFiles, type VersionType, type WriteOutcome,
} from "@elsatia/releve-domain";

export type ReleveMediaSupabaseClient = Pick<SupabaseClient, "from" | "rpc" | "storage">;

type MetaRow = { entreprise_id: string; created_at: string; updated_at: string; created_by: string | null; updated_by: string | null; revision: number | string; deleted_at: string | null };
export type MediaRow = MetaRow & {
  id: string; releve_id: string; categorie: PhotoMedia["categorie"]; storage_path: string; mime_type: string;
  taille_octets: number | string; nom_fichier: string | null; metadata: Record<string, unknown> | null;
  commentaire?: string | null; etat_documente?: VersionType | null; version_reference_id?: string | null; miniature_storage_path?: string | null;
};
export type ElementRow = MetaRow & {
  id: string; releve_id: string; type: ReleveElement["type"]; etage_id: string | null; piece_id: string | null;
  parent_element_id: string | null; schema_version: number; donnees: Record<string, unknown>;
};

const num = (value: number | string) => (typeof value === "number" ? value : Number(value));
const meta = (row: MetaRow) => ({
  entrepriseId: row.entreprise_id, createdAt: row.created_at, updatedAt: row.updated_at, createdBy: row.created_by,
  updatedBy: row.updated_by, revision: num(row.revision), deletedAt: row.deleted_at,
}) as Pick<PhotoMedia, "entrepriseId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "revision" | "deletedAt">;

export function mediaFromRow(row: MediaRow): PhotoMedia {
  return {
    ...meta(row), id: row.id as MediaId, releveId: row.releve_id as ReleveId, categorie: row.categorie, storagePath: row.storage_path,
    mimeType: row.mime_type, tailleOctets: num(row.taille_octets), nomFichier: row.nom_fichier, metadata: (row.metadata ?? {}) as PhotoMedia["metadata"],
    commentaire: row.commentaire ?? null, etatDocumente: row.etat_documente ?? "initial", versionReferenceId: row.version_reference_id ?? null,
    miniatureStoragePath: row.miniature_storage_path ?? null,
  };
}

export function elementFromRow(row: ElementRow): ReleveElement {
  return {
    ...meta(row), id: row.id as ElementId, releveId: row.releve_id as ReleveId, type: row.type, etageId: row.etage_id as never,
    pieceId: row.piece_id as never, parentElementId: row.parent_element_id as never, schemaVersion: row.schema_version, donnees: row.donnees as never,
  } as ReleveElement;
}

type AnyError = { code?: string; message?: string; status?: number; statusCode?: string | number; name?: string } | null | undefined;

/** Classe une erreur PostgREST / Storage / réseau ; seule `network` sera retentée automatiquement. */
export function classifyMediaError(error: AnyError, online = typeof navigator === "undefined" || navigator.onLine !== false): MediaFailureKind {
  if (!online) return "network";
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const code = error?.code ?? "";
  const message = `${error?.name ?? ""} ${error?.message ?? ""}`;
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|network|ECONNREFUSED|timeout/i.test(message) && !code) return "network";
  if (error?.name === "StorageUnknownError") return "network";
  if (code === "42501" || status === 401 || status === 403 || /row-level security|Unauthorized/i.test(message)) return "forbidden";
  if (code === "P0002" || status === 404) return "not_found";
  if (code === "23514" || code === "22P02" || code === "22023" || status === 400 || status === 413 || status === 415) return "invalid";
  if (status >= 500 || status === 0) return "network";
  return "other";
}

const MESSAGES: Record<MediaFailureKind, string> = {
  network: "Réseau indisponible : la photo reste à synchroniser.",
  forbidden: "Action non autorisée pour votre compte.",
  invalid: "Fichier ou données refusés par le serveur.",
  not_found: "Photo introuvable ou déjà retirée.",
  duplicate: "Cette photo est déjà dans le relevé.",
  other: "Opération impossible.",
};

function fail(action: string, error: AnyError): never {
  const kind = classifyMediaError(error);
  throw new MediaRemoteError(`${action} : ${MESSAGES[kind]}`, kind, error?.code ?? (error?.statusCode ? String(error.statusCode) : undefined));
}

/** Doublon de contenu (même SHA-256 active dans le relevé) : ce n'est PAS une reprise idempotente. */
export const isContentDuplicate = (error: AnyError) => error?.code === "23505" && /empreinte/i.test(error?.message ?? "");
const isDuplicate = (error: AnyError) => error?.code === "23505" || Number(error?.statusCode ?? error?.status) === 409 || /already exists|Duplicate/i.test(error?.message ?? "");

export class SupabaseReleveMediaRepository implements ReleveMediaRepository {
  constructor(private readonly client: ReleveMediaSupabaseClient) {}

  private bucket() { return this.client.storage.from(RELEVE_STORAGE_BUCKET); }

  async loadMediaContext(releveId: ReleveId, options: { includeDeletedPhotos?: boolean } = {}) {
    let medias = this.client.from("tools_releves_medias").select("*").eq("releve_id", releveId).eq("categorie", "photos");
    if (!options.includeDeletedPhotos) medias = medias.is("deleted_at", null);
    const [mediaResult, elementResult] = await Promise.all([
      medias.order("created_at", { ascending: false }),
      this.client.from("tools_releves_elements").select("*").eq("releve_id", releveId).is("deleted_at", null)
        .in("type", ["photo_anchor", "annotation", "mur", "equipement"]),
    ]);
    if (mediaResult.error) fail("Chargement des photos", mediaResult.error);
    if (elementResult.error) fail("Chargement des rattachements", elementResult.error);
    return {
      medias: ((mediaResult.data ?? []) as MediaRow[]).map(mediaFromRow),
      elements: ((elementResult.data ?? []) as ElementRow[]).map(elementFromRow),
    };
  }

  async uploadObject(path: string, bytes: Blob | Uint8Array, mimeType: string): Promise<WriteOutcome> {
    let result;
    try {
      // Octets bruts (jamais un `Blob`) : storage-js enverrait sinon un multipart dont le type
      // viendrait du Blob ; ici le type déclaré est exactement celui contrôlé par le domaine.
      const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(await bytes.arrayBuffer());
      result = await this.bucket().upload(path, body, { contentType: mimeType, upsert: false, cacheControl: "3600" });
    } catch (error) {
      fail("Envoi de la photo", error as AnyError);
    }
    if (result.error) {
      if (isDuplicate(result.error as AnyError)) return "exists";
      fail("Envoi de la photo", result.error as AnyError);
    }
    return "created";
  }

  async removeObjects(paths: readonly string[]) {
    if (!paths.length) return [];
    const { data, error } = await this.bucket().remove([...paths]);
    if (error) fail("Suppression du fichier", error as AnyError);
    return (data ?? []).map((file) => file.name);
  }

  async signedUrl(path: string, expiresIn: number) {
    const { data, error } = await this.bucket().createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) fail("Lecture de la photo", (error ?? { status: 404 }) as AnyError);
    return data.signedUrl;
  }

  async signedUrls(paths: readonly string[], expiresIn: number) {
    if (!paths.length) return {};
    const { data, error } = await this.bucket().createSignedUrls([...paths], expiresIn);
    if (error) fail("Lecture des vignettes", error as AnyError);
    const urls: Record<string, string> = {};
    for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
    return urls;
  }

  async insertMedia(row: NewMediaRow): Promise<WriteOutcome> {
    const { error } = await this.client.from("tools_releves_medias").insert({
      id: row.id, releve_id: row.releveId, categorie: row.categorie, storage_path: row.storagePath, mime_type: row.mimeType,
      taille_octets: row.tailleOctets, nom_fichier: row.nomFichier, metadata: row.metadata,
      miniature_storage_path: row.miniatureStoragePath, commentaire: row.commentaire, etat_documente: row.etatDocumente,
    });
    if (error) {
      if (isContentDuplicate(error)) throw new MediaRemoteError(`Enregistrement de la photo : ${MESSAGES.duplicate}`, "duplicate", error.code);
      if (isDuplicate(error)) return "exists";
      fail("Enregistrement de la photo", error);
    }
    return "created";
  }

  async updateMedia(id: MediaId, patch: MediaPatch, expectedRevision: number) {
    const values: Record<string, unknown> = {};
    if (patch.commentaire !== undefined) values.commentaire = patch.commentaire;
    if (patch.etatDocumente !== undefined) values.etat_documente = patch.etatDocumente;
    const { data, error } = await this.client.from("tools_releves_medias").update(values)
      .eq("id", id).eq("revision", expectedRevision).select("*").maybeSingle();
    if (error) fail("Enregistrement", error);
    if (!data) throw new MediaRemoteError("Modifiée ailleurs ou retirée : rechargez la photo.", "invalid", "conflict");
    return mediaFromRow(data as MediaRow);
  }

  async insertElement(row: NewElementRow): Promise<WriteOutcome> {
    const { error } = await this.client.from("tools_releves_elements").insert({
      id: row.id, releve_id: row.releveId, type: row.type, etage_id: row.etageId, piece_id: row.pieceId, donnees: row.donnees,
    });
    if (error) { if (isDuplicate(error)) return "exists"; fail("Rattachement de la photo", error); }
    return "created";
  }

  async updateElementDonnees(id: ElementId, donnees: Record<string, unknown>, expectedRevision: number) {
    const { data, error } = await this.client.from("tools_releves_elements").update({ donnees })
      .eq("id", id).eq("revision", expectedRevision).select("*").maybeSingle();
    if (error) fail("Enregistrement", error);
    if (!data) throw new MediaRemoteError("Modifié ailleurs ou retiré : rechargez la photo.", "invalid", "conflict");
    return elementFromRow(data as ElementRow);
  }

  async setElementDeleted(id: ElementId, deleted: boolean) {
    const { error } = await this.client.from("tools_releves_elements").update({ deleted_at: deleted ? new Date().toISOString() : null }).eq("id", id);
    if (error) fail(deleted ? "Retrait" : "Restauration", error);
  }

  async deletePhoto(mediaId: MediaId) {
    const { data, error } = await this.client.rpc("tools_releve_retirer_photo", { p_media_id: mediaId });
    if (error) fail("Retrait de la photo", error);
    return retiredFrom(data);
  }

  async replacePhoto(oldMediaId: MediaId, newMediaId: MediaId) {
    const { data, error } = await this.client.rpc("tools_releve_remplacer_photo", { p_ancien: oldMediaId, p_nouveau: newMediaId });
    if (error) fail("Remplacement de la photo", error);
    return retiredFrom(data);
  }
}

/** Réponse jsonb des RPC de retrait / remplacement : { chemin, miniature, fige }. */
export function retiredFrom(data: unknown): RetiredFiles {
  const value = (data ?? {}) as { chemin?: unknown; miniature?: unknown; fige?: unknown };
  if (typeof value.chemin !== "string") throw new MediaRemoteError("Réponse du serveur inattendue.", "other");
  return { storagePath: value.chemin, miniaturePath: typeof value.miniature === "string" ? value.miniature : null, fige: value.fige === true };
}
