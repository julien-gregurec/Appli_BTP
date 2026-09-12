import "server-only";
import { isStudioId } from "@elsatia/studio-domain";
import { authorizeProject, MediaError } from "./media-service";
import { storageAdmin } from "./storage-admin";
import { getActiveStudioTimeline } from "./timelines";
export async function getStudioRenders(projectId: string) {
  const { client } = await authorizeProject(projectId);
  const [jobs, outputs] = await Promise.all([
    client
      .from("studio_render_jobs")
      .select(
        "id,project_id,status,progress_percent,width,height,retry_count,error_code,error_message,created_at",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("studio_render_outputs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (jobs.error || outputs.error)
    throw new MediaError("Rendus indisponibles.", 503);
  return {
    jobs: jobs.data,
    outputs: outputs.data.map((o) => ({
      id: o.id,
      render_job_id: o.render_job_id,
      duration_ms: o.duration_ms,
      file_size_bytes: o.file_size_bytes,
    })),
  };
}
export async function requestStudioRender(
  projectId: string,
  requestId: string,
  retry: string | null,
) {
  const { client } = await authorizeProject(projectId, true);
  if (!isStudioId(requestId) || (retry !== null && !isStudioId(retry)))
    throw new MediaError("Demande invalide.");
  const timeline = await getActiveStudioTimeline(projectId);
  if (!timeline?.clips.length)
    throw new MediaError("Préparez un montage avant de créer la vidéo.");
  const ids = [...new Set(timeline.clips.map((c) => c.asset_id))];
  const assets = await client
    .from("studio_media_assets")
    .select("*")
    .in("id", ids);
  if (assets.error) throw new MediaError("Médias indisponibles.", 503);
  if (assets.data.length !== ids.length) throw new MediaError("ASSET_MISSING");
  const admin = storageAdmin();
  for (const a of assets.data) {
    const info = await admin.storage
      .from("studio-originals")
      .info(a.storage_key);
    if (info.error || a.upload_status !== "ready")
      throw new MediaError("ASSET_MISSING");
  }
  const profile =
    process.env.STUDIO_RENDER_INTERNAL_PREVIEW === "1" ? "preview" : "standard";
  const r = await client.rpc("studio_request_render", {
    p_project: projectId,
    p_request: requestId,
    p_profile: profile,
    p_retry: retry,
  });
  if (r.error)
    throw new MediaError(
      r.error.code === "22023" ? r.error.message : "Création du rendu refusée.",
      r.error.code === "42501" ? 403 : 400,
    );
  return { id: r.data };
}
export async function cancelStudioRender(projectId: string, jobId: string) {
  const { client } = await authorizeProject(projectId, true);
  if (!isStudioId(jobId)) throw new MediaError("Rendu inaccessible.", 404);
  const job = await client
    .from("studio_render_jobs")
    .select("id")
    .eq("project_id", projectId)
    .eq("id", jobId)
    .maybeSingle();
  if (!job.data) throw new MediaError("Rendu inaccessible.", 404);
  const r = await client.rpc("studio_cancel_render", { p_job: jobId });
  if (r.error) throw new MediaError("Annulation refusée.", 403);
  return { ok: true };
}
export async function getRenderDownloadUrl(
  projectId: string,
  outputId: string,
  download = false,
) {
  const { client } = await authorizeProject(projectId);
  if (!isStudioId(outputId)) throw new MediaError("Export inaccessible.", 404);
  const r = await client
    .from("studio_render_outputs")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", outputId)
    .maybeSingle();
  if (r.error) throw new MediaError("Exports indisponibles.", 503);
  if (!r.data) throw new MediaError("Export inaccessible.", 404);
  const signed = await storageAdmin()
    .storage.from("studio-renders")
    .createSignedUrl(r.data.storage_key, 60, {
      download: download ? "elsatia-studio.mp4" : false,
    });
  if (signed.error) throw new MediaError("Export indisponible.", 503);
  return { url: signed.data.signedUrl };
}
