import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { isStudioId } from "@elsatia/studio-domain";
import { authorizeProject, MediaError } from "./media-service";
import { studioOrigin } from "./config";
import { storageAdmin } from "./storage-admin";
const tokenFormat = /^[A-Za-z0-9_-]{43}$/;
export const shareToken = () => randomBytes(32).toString("base64url");
/** Only this hash is stored: the secret exists solely in the URL handed to the user. */
export const hashShareToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export interface RenderShare {
  id: string;
  output_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  active: boolean;
}
export async function listRenderShares(projectId: string) {
  const { client } = await authorizeProject(projectId);
  const r = await client.rpc("studio_list_render_shares", {
    p_project: projectId,
  });
  // Viewers are refused by the database: they simply see no links.
  return r.error ? [] : ((r.data as RenderShare[] | null) ?? []);
}
export async function createRenderShare(
  projectId: string,
  outputId: string,
  days: number,
) {
  const { client } = await authorizeProject(projectId, true);
  if (!isStudioId(outputId) || !Number.isInteger(days))
    throw new MediaError("Partage invalide.");
  const token = shareToken();
  const r = await client.rpc("studio_create_render_share", {
    p_output: outputId,
    p_token_hash: hashShareToken(token),
    p_days: days,
  });
  if (r.error)
    throw new MediaError(
      r.error.code === "22023" ? r.error.message : "Création du lien refusée.",
      r.error.code === "42501" ? 403 : 400,
    );
  return { id: r.data as string, url: `${studioOrigin()}/s/${token}` };
}
export async function revokeRenderShare(projectId: string, shareId: string) {
  const { client } = await authorizeProject(projectId, true);
  if (!isStudioId(shareId)) throw new MediaError("Lien inaccessible.", 404);
  const r = await client.rpc("studio_revoke_render_share", {
    p_share: shareId,
  });
  if (r.error) throw new MediaError("Révocation refusée.", 403);
  return { ok: true };
}
/** Public, unauthenticated: the hash of the secret is the only credential. Returns nothing about the tenant. */
export async function resolveShare(token: string) {
  if (!tokenFormat.test(token)) return null;
  const admin = storageAdmin();
  const r = await admin.rpc("studio_resolve_render_share", {
    p_token_hash: hashShareToken(token),
  });
  const share = r.data as {
    storage_key: string;
    width: number;
    height: number;
    duration_ms: number;
    title: string;
    expires_at: string;
  } | null;
  if (r.error || !share) return null;
  const signed = await admin.storage
    .from("studio-renders")
    .createSignedUrl(share.storage_key, 60);
  if (signed.error) return null;
  return {
    url: signed.data.signedUrl,
    title: share.title,
    width: share.width,
    height: share.height,
    expires_at: share.expires_at,
  };
}
