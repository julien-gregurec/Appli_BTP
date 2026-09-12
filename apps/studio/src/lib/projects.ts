import { restErrorStatus } from "./rest-status";
import "server-only";
import {
  isStudioId,
  isProjectType,
  validateProject,
  type ProjectInput,
} from "@elsatia/studio-domain";
import { mediaContext, authorizeProject, MediaError } from "./media-service";
function result<T>(
  data: T | null,
  error: { code?: string } | null,
  message: string,
  status?: number,
): T {
  if (error || data === null)
    throw new MediaError(
      error?.code === "40001"
        ? "Le projet a changé. Rechargez avant de sauvegarder."
        : message,
      error ? restErrorStatus(error, status) : 500,
    );
  return data;
}
export async function createStudioProject(workspace: string, input: unknown) {
  if (!isStudioId(workspace)) throw new MediaError("Espace inaccessible.", 404);
  const data = validateProject(input),
    { client } = await mediaContext();
  const r = await client.rpc("studio_save_project", {
    p_workspace: workspace,
    p_project: null,
    p_data: data,
    p_revision: null,
  });
  return result(
    r.data,
    r.error,
    "Création refusée. Vérifiez les informations et votre rôle.",
    r.status,
  );
}
export async function updateStudioProject(
  id: string,
  input: unknown,
  revision: number,
) {
  const data: ProjectInput = validateProject(input),
    { client, project } = await authorizeProject(id, true);
  const r = await client.rpc("studio_save_project", {
    p_workspace: project.workspace_id,
    p_project: id,
    p_data: data,
    p_revision: revision,
  });
  return result(
    r.data,
    r.error,
    "Sauvegarde refusée. Vérifiez les dates et les informations.",
    r.status,
  );
}
export const getStudioProject = authorizeProject;
export async function listStudioProjects(
  workspace: string,
  filters: Record<string, string | undefined> = {},
) {
  if (!isStudioId(workspace)) throw new MediaError("Espace inaccessible.", 404);
  const { client } = await mediaContext();
  const type = filters.type ?? "",
    status = filters.status ?? "active",
    sort = filters.sort ?? "updated",
    since = filters.since || null;
  const offset = Number(filters.offset ?? 0),
    query = filters.q ?? "";
  if (
    (type && !isProjectType(type)) ||
    !["active", "all", "draft", "ready", "archived"].includes(status) ||
    !["updated", "newest", "oldest", "name"].includes(sort) ||
    query.length > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    (since &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(since) ||
        !Number.isFinite(Date.parse(since))))
  )
    throw new MediaError("Filtres invalides.");
  const r = await client.rpc("studio_project_summaries", {
    p_workspace: workspace,
    p_query: query,
    p_type: type,
    p_status: status,
    p_since: since,
    p_sort: sort,
    p_offset: offset,
  });
  return result(r.data, r.error, "Liste des projets indisponible.", r.status);
}
export async function dashboardStats(workspace: string) {
  const { client } = await mediaContext();
  const r = await client.rpc("studio_dashboard_stats", {
    p_workspace: workspace,
  });
  return result(r.data, r.error, "Statistiques indisponibles.", r.status);
}
async function lifecycle(id: string, action: "archive" | "restore" | "delete") {
  // SQL rechecks owner/admin and permits the archived source for restore/delete.
  const { client } = await authorizeProject(id);
  const r = await client.rpc("studio_project_lifecycle", {
    p_project: id,
    p_action: action,
  });
  if (r.error)
    throw new MediaError(
      "Action réservée au propriétaire ou à un administrateur.",
      restErrorStatus(r.error, r.status),
    );
}
export const archiveStudioProject = (id: string) => lifecycle(id, "archive");
export const restoreStudioProject = (id: string) => lifecycle(id, "restore");
export const deleteStudioProject = (id: string) => lifecycle(id, "delete");
export async function duplicateStudioProject(id: string) {
  const { client } = await authorizeProject(id);
  const r = await client.rpc("studio_duplicate_project", { p_project: id });
  return result(
    r.data,
    r.error,
    "Duplication refusée. Terminez ou retirez les imports non validés, puis vérifiez votre rôle et les limites du projet.",
    r.status,
  );
}
export async function setProjectCover(id: string, asset: string | null) {
  if (asset !== null && !isStudioId(asset))
    throw new MediaError("Média non autorisé.");
  const { client } = await authorizeProject(id, true);
  const r = await client.rpc("studio_set_project_cover", {
    p_project: id,
    p_asset: asset,
  });
  if (r.error)
    throw new MediaError(
      "Choisissez une image validée de ce projet.",
      restErrorStatus(r.error, r.status),
    );
}
export async function removeProjectMedia(id: string, asset: string) {
  if (!isStudioId(asset)) throw new MediaError("Média non autorisé.");
  const { client } = await authorizeProject(id, true);
  const r = await client.rpc("studio_remove_project_media", {
    p_project: id,
    p_asset: asset,
  });
  if (r.error)
    throw new MediaError(
      "Suppression du média refusée.",
      restErrorStatus(r.error, r.status),
    );
}
export async function reorderProjectMedia(
  id: string,
  ids: string[],
  chronological: boolean,
  revision: number,
) {
  if (
    ids.length > 1000 ||
    ids.some((i) => !isStudioId(i)) ||
    new Set(ids).size !== ids.length
  )
    throw new MediaError("Ordre invalide.");
  const { client } = await authorizeProject(id, true);
  const r = await client.rpc("studio_order_project_media", {
    p_project: id,
    p_ids: ids,
    p_chronological: chronological,
    p_revision: revision,
  });
  if (r.error)
    throw new MediaError(
      r.error.code === "40001"
        ? "Les médias ont changé. Rechargez le projet."
        : "Ordre ou média non autorisé.",
      restErrorStatus(r.error, r.status),
    );
}
export async function projectMedia(id: string, offset = 0, limit = 24) {
  const { client } = await authorizeProject(id);
  const r = await client.rpc("studio_list_project_media", {
    p_project: id,
    p_offset: offset,
    p_limit: limit,
  });
  return result(r.data, r.error, "Bibliothèque indisponible.", r.status);
}

export async function projectStats(id: string) {
  const { client } = await authorizeProject(id);
  const r = await client.rpc("studio_project_media_stats", { p_project: id });
  return result(r.data, r.error, "Compteurs indisponibles.", r.status);
}
