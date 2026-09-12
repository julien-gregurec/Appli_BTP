import "server-only";
import { isStudioId } from "@elsatia/studio-domain";
import { createStudioClient } from "./supabase";
import { storageAdmin, STUDIO_BUCKET, PREVIEW_SECONDS } from "./storage-admin";
import { supabaseConfig } from "./config";
import { inspectMedia } from "./media-inspection";
import {
  validateFile,
  writable,
  type StudioMediaAsset,
  type UploadAuthorization,
} from "./media-contract";
export class MediaError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function mediaContext() {
  const client = await createStudioClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new MediaError("Connexion requise.", 401);
  return { client, user };
}
export async function authorizeProject(id: string, write = false) {
  if (!isStudioId(id)) throw new MediaError("Projet inaccessible.", 404);
  const { client, user } = await mediaContext();
  const { data: project } = await client
    .from("studio_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!project) throw new MediaError("Projet inaccessible.", 404);
  const { data: role } = await client.rpc("studio_my_role", {
    p_workspace_id: project.workspace_id,
  });
  if (!role || (write && !writable(role)))
    throw new MediaError("Lecture seule : opération refusée.", 403);
  return { client, user, project, role };
}
export async function authorizeAsset(id: string, write = false) {
  if (!isStudioId(id)) throw new MediaError("Média inaccessible.", 404);
  const { client } = await mediaContext();
  const { data: asset } = await client
    .from("studio_media_assets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!asset) throw new MediaError("Média inaccessible.", 404);
  return { ...(await authorizeProject(asset.project_id, write)), asset };
}
export async function mediaLimits() {
  const { client } = await mediaContext();
  const { data, error } = await client
    .from("studio_media_limits")
    .select("*")
    .single();
  if (error || !data) throw new MediaError("Limites indisponibles.", 503);
  return data;
}
export async function reserveMedia(
  projectId: string,
  input: { requestId: string; name: string; mime: string; size: number },
): Promise<UploadAuthorization> {
  const { client } = await authorizeProject(projectId, true);
  validateFile(input.name, input.mime, input.size, await mediaLimits());
  if (!isStudioId(input.requestId))
    throw new MediaError("Identifiant de demande invalide.");
  const { data: id, error } = await client.rpc("studio_reserve_media", {
    p_project: projectId,
    p_request: input.requestId,
    p_name: input.name,
    p_mime: input.mime,
    p_bytes: input.size,
  });
  if (error || !id)
    throw new MediaError(
      error?.code === "22023" ? error.message : "Import refusé.",
    );
  return authorizeUpload(id);
}
export async function authorizeUpload(
  id: string,
): Promise<UploadAuthorization> {
  const { asset } = await authorizeAsset(id, true);
  if (asset.upload_status === "ready") return { asset, complete: true };
  if (
    !["pending", "uploading", "uploaded"].includes(asset.upload_status) ||
    Date.parse(asset.upload_expires_at) < Date.now()
  )
    throw new MediaError(
      "Session expirée ou fichier refusé. Supprimez cette entrée puis recommencez.",
    );
  const admin = storageAdmin();
  const info = await admin.storage.from(STUDIO_BUCKET).info(asset.storage_key);
  if (!info.error) return { asset, complete: true };
  if (!["404", "400"].includes(String(info.error.status)))
    throw new MediaError("Stockage indisponible.", 503);
  const { data, error } = await admin.storage
    .from(STUDIO_BUCKET)
    .createSignedUploadUrl(asset.storage_key, { upsert: false });
  if (error || !data)
    throw new MediaError("Autorisation de stockage indisponible.", 503);
  const origin = new URL(supabaseConfig().url);
  if (origin.hostname.endsWith(".supabase.co"))
    origin.hostname = origin.hostname.replace(
      ".supabase.co",
      ".storage.supabase.co",
    );
  return {
    asset,
    token: data.token,
    endpoint: `${origin.origin}/storage/v1/upload/resumable/sign`,
    complete: false,
  };
}
async function inspectStored(asset: StudioMediaAsset) {
  const admin = storageAdmin();
  const { data: info, error } = await admin.storage
    .from(STUDIO_BUCKET)
    .info(asset.storage_key);
  if (error || !info)
    throw new MediaError(
      "Objet absent : terminez ou reprenez le transfert.",
      409,
    );
  if (info.size !== asset.file_size_bytes)
    throw new MediaError(
      "La taille réelle ne correspond pas au fichier réservé.",
    );
  if (info.contentType !== asset.mime_type)
    throw new MediaError("Le type déclaré au stockage est incohérent.");
  const { data } = await admin.storage
    .from(STUDIO_BUCKET)
    .createSignedUrl(asset.storage_key, 120);
  if (!data) throw new MediaError("Vérification stockage indisponible.", 503);
  let budget = 0,
    requests = 0;
  const inspectionSignal = AbortSignal.timeout(45000);
  return inspectMedia(
    asset.mime_type,
    asset.file_size_bytes,
    async (start, end) => {
      if (++requests > 16 || (budget += end - start + 1) > 4 * 1024 * 1024)
        throw new Error("Budget de métadonnées dépassé.");
      const response = await fetch(data.signedUrl, {
        headers: { Range: `bytes=${start}-${end}` },
        cache: "no-store",
        signal: AbortSignal.any([inspectionSignal, AbortSignal.timeout(30000)]),
      }).catch(() => {
        throw new MediaError(
          "Vérification temporairement indisponible. Réessayez.",
          503,
        );
      });
      if (response.status !== 206 || !response.body) {
        await response.body?.cancel();
        throw new MediaError("Lecture partielle indisponible. Réessayez.", 503);
      }
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let received = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read().catch(() => {
            throw new MediaError("Lecture interrompue. Réessayez.", 503);
          });
          if (done) break;
          received += value.length;
          if (received > end - start + 1)
            throw new Error("Lecture trop volumineuse.");
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel();
      }
      if (received !== end - start + 1) throw new Error("Objet tronqué.");
      return Buffer.concat(chunks, received);
    },
  );
}
export async function confirmMedia(id: string) {
  const { asset, user } = await authorizeAsset(id, true);
  if (asset.upload_status === "ready") return asset;
  let metadata;
  try {
    metadata = await inspectStored(asset);
  } catch (error) {
    if (error instanceof MediaError && error.status !== 400) throw error;
    // No release of reservation until physical cleanup; invalid bytes remain inaccessible.
    await storageAdmin()
      .from("studio_media_assets")
      .update({ upload_status: "failed", updated_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .neq("upload_status", "ready");
    throw new MediaError(
      error instanceof Error ? error.message : "Fichier invalide.",
    );
  }
  const { error } = await storageAdmin().rpc("studio_finish_media", {
    p_asset: id,
    p_actor: user.id,
    p_metadata: metadata,
  });
  if (error)
    throw new MediaError(
      "Confirmation refusée : session expirée ou accès révoqué.",
      409,
    );
  return (await authorizeAsset(id)).asset;
}
export async function getStudioMediaSignedUrl(id: string) {
  const { asset } = await authorizeAsset(id);
  if (asset.upload_status !== "ready")
    throw new MediaError("Le média n’est pas validé.", 409);
  const { data, error } = await storageAdmin()
    .storage.from(STUDIO_BUCKET)
    .createSignedUrl(asset.storage_key, PREVIEW_SECONDS);
  if (error || !data) throw new MediaError("Aperçu indisponible.", 503);
  return { url: data.signedUrl, expiresIn: PREVIEW_SECONDS };
}
