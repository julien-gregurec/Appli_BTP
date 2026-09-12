import { ProjectValidationError } from "@elsatia/studio-domain";
import { studioOrigin } from "../../../../lib/config";
import { MediaError } from "../../../../lib/media-service";
import {
  createStudioProject,
  updateStudioProject,
  listStudioProjects,
  getStudioProject,
  archiveStudioProject,
  restoreStudioProject,
  deleteStudioProject,
  duplicateStudioProject,
  setProjectCover,
  reorderProjectMedia,
  removeProjectMedia,
  projectMedia,
} from "../../../../lib/projects";
export const runtime = "nodejs";
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new MediaError("Demande vide.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.length) > 65536)
        throw new MediaError("Demande trop volumineuse.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new MediaError("Demande invalide.");
  return Object.fromEntries(Object.entries(value));
}
async function handle(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const path = (await params).path ?? [],
      id = path[0],
      action = path[1];
    let output: unknown = { ok: true };
    if (
      request.method !== "GET" &&
      request.headers.get("origin") !== studioOrigin()
    )
      throw new MediaError("Origine refusée.", 403);
    if (request.method === "GET") {
      if (!id) {
        const query = Object.fromEntries(new URL(request.url).searchParams);
        output = await listStudioProjects(query.workspace, query);
      } else if (path.length === 1)
        output = (await getStudioProject(id)).project;
      else if (action === "order")
        output = {
          assets: await projectMedia(id, 0, 1000),
          project: (await getStudioProject(id)).project,
        };
      else throw new MediaError("Route inconnue.", 404);
    } else if (request.method === "POST") {
      const body = await bodyOf(request);
      if (!id) {
        if (typeof body.workspace !== "string")
          throw new MediaError("Espace invalide.");
        output = {
          id: await createStudioProject(body.workspace, body.project),
        };
      } else if (path.length === 1) {
        if (
          typeof body.revision !== "number" ||
          !Number.isInteger(body.revision)
        )
          throw new MediaError("Révision invalide.");
        output = {
          id: await updateStudioProject(id, body.project, body.revision),
        };
      } else if (action === "archive") await archiveStudioProject(id);
      else if (action === "restore") await restoreStudioProject(id);
      else if (action === "delete") await deleteStudioProject(id);
      else if (action === "duplicate")
        output = { id: await duplicateStudioProject(id) };
      else if (action === "cover") {
        if (body.asset !== null && typeof body.asset !== "string")
          throw new MediaError("Média invalide.");
        await setProjectCover(id, body.asset);
      } else if (action === "remove") {
        if (typeof body.asset !== "string")
          throw new MediaError("Média invalide.");
        await removeProjectMedia(id, body.asset);
      } else if (action === "order") {
        if (
          !Array.isArray(body.ids) ||
          !body.ids.every((v): v is string => typeof v === "string") ||
          typeof body.chronological !== "boolean" ||
          typeof body.revision !== "number" ||
          !Number.isInteger(body.revision)
        )
          throw new MediaError("Ordre invalide.");
        await reorderProjectMedia(
          id,
          body.ids,
          body.chronological,
          body.revision,
        );
      } else throw new MediaError("Route inconnue.", 404);
    } else throw new MediaError("Méthode refusée.", 405);
    return Response.json(output, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MediaError
            ? error.message
            : error instanceof ProjectValidationError
              ? error.message
              : "Demande invalide.",
      },
      {
        status: error instanceof MediaError ? error.status : 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
export { handle as GET, handle as POST };
