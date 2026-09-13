import "server-only";
import {
  analysisEnabled,
  rankProjectAssets,
  recommendAssetOrder,
  selectAssetsForTargetDuration,
} from "@elsatia/studio-domain";
import { authorizeProject, MediaError } from "./media-service";
import { restErrorStatus } from "./rest-status";
export const studioAnalysisEnabled = () =>
  analysisEnabled(process.env.STUDIO_AI_ANALYSIS);
export async function getProjectAnalysis(
  projectId: string,
  template = "chantier-pro",
) {
  const { client, project } = await authorizeProject(projectId);
  if (!studioAnalysisEnabled())
    return {
      template,
      enabled: false,
      rows: [],
      suggested: [],
      order: [],
      revision: project.revision,
      completed: 0,
      total: 0,
      active: 0,
      failed: 0,
      metrics: {
        ai_operations: 0,
        analyzed_assets: 0,
        provider_calls: 0,
        estimated_cost: 0,
      },
    };
  const [media, analysis] = await Promise.all([
    client.rpc("studio_list_project_media", {
      p_project: projectId,
      p_offset: 0,
      p_limit: 1000,
    }),
    client.rpc("studio_list_analysis", { p_project: projectId }),
  ]);
  if (media.error || analysis.error)
    throw new MediaError(
      "Analyse momentanément indisponible. Vous pouvez continuer sans analyse.",
      503,
    );
  const ids = new Set((media.data ?? []).map((a) => a.id)),
    records = (analysis.data ?? []).filter((a) => ids.has(a.asset_id));
  const rows = rankProjectAssets(media.data ?? [], records);
  return {
    template,
    enabled: true,
    rows,
    suggested: selectAssetsForTargetDuration(
      rows,
      project.target_duration_seconds ?? 60,
      template,
    ),
    order: recommendAssetOrder(rows),
    revision: project.revision,
    total: rows.length,
    completed: records.filter((a) => a.status === "completed").length,
    active: records.filter(
      (a) => a.status === "pending" || a.status === "analyzing",
    ).length,
    failed: records.filter(
      (a) => a.status === "failed" || a.status === "skipped",
    ).length,
    metrics: {
      ai_operations: records.reduce((n, a) => n + a.attempts, 0),
      analyzed_assets: records.filter((a) => a.status === "completed").length,
      provider_calls: records.reduce((n, a) => n + a.provider_calls, 0),
      estimated_cost: 0,
    },
  };
}
export async function requestProjectAnalysis(
  project: string,
  force = false,
  cancel = false,
) {
  const { client } = await authorizeProject(project, true);
  if (!studioAnalysisEnabled())
    throw new MediaError("Analyse désactivée. Continuez sans analyse.", 409);
  const r = cancel
    ? await client.rpc("studio_cancel_analysis", { p_project: project })
    : await client.rpc("studio_request_analysis", {
        p_project: project,
        p_force: force,
      });
  if (r.error)
    throw new MediaError(
      "Analyse refusée.",
      restErrorStatus(r.error, r.status),
    );
  return { queued: r.data ?? 0 };
}
