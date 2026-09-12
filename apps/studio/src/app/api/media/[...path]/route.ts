import { studioOrigin } from "../../../../lib/config";
import {
  mediaContext,
  MediaError,
  reserveMedia,
  authorizeUpload,
  confirmMedia,
  getStudioMediaSignedUrl,
  authorizeAsset,
  authorizeProject,
} from "../../../../lib/media-service";
import { isStudioId } from "@elsatia/studio-domain";
export const runtime = "nodejs";
async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await params).path;
    if (
      request.method !== "GET" &&
      request.headers.get("origin") !== studioOrigin()
    )
      throw new MediaError("Origine refusée.", 403);
    if (
      request.method === "GET" &&
      path[0] === "assets" &&
      path[2] === "preview"
    )
      return Response.json(await getStudioMediaSignedUrl(path[1]), {
        headers: { "Cache-Control": "private, no-store" },
      });
    if (request.method === "GET" && path[0] === "projects") {
      const { client } = await authorizeProject(path[1]);
      const offset = Number(
        new URL(request.url).searchParams.get("offset") ?? 0,
      );
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
        throw new MediaError("Pagination invalide.");
      const { data, error } = await client
        .from("studio_media_assets")
        .select("*")
        .eq("project_id", path[1])
        .order("created_at")
        .order("id")
        .range(offset, offset + 23);
      if (error) throw new MediaError("Bibliothèque indisponible.", 503);
      return Response.json(
        { assets: data },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (request.method === "DELETE" && path[0] === "assets") {
      const { client } = await authorizeAsset(path[1], true);
      const { error } = await client.rpc("studio_delete_media", {
        p_asset: path[1],
      });
      if (error) throw new MediaError("Suppression refusée.", 403);
      return Response.json({ deleted: true });
    }
    if (request.method === "POST" && path[0] === "assets") {
      if (path[2] === "authorize")
        return Response.json(await authorizeUpload(path[1]));
      if (path[2] === "confirm")
        return Response.json(await confirmMedia(path[1]));
    }
    if (request.method === "POST") {
      const reader = request.body?.getReader();
      if (!reader) throw new MediaError("Demande vide.");
      const parts: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 4096)
            throw new MediaError("Demande trop volumineuse.", 413);
          parts.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const text = Buffer.concat(parts).toString("utf8");
      if (text.length > 4096)
        throw new MediaError("Demande trop volumineuse.", 413);
      const body: unknown = JSON.parse(text);
      if (!body || typeof body !== "object")
        throw new MediaError("Demande invalide.");
      if (path[0] === "projects" && path[2] === "reserve") {
        if (
          !(
            "name" in body &&
            typeof body.name === "string" &&
            "mime" in body &&
            typeof body.mime === "string" &&
            "size" in body &&
            typeof body.size === "number" &&
            "requestId" in body &&
            typeof body.requestId === "string"
          )
        )
          throw new MediaError("Fichier invalide.");
        return Response.json(
          await reserveMedia(path[1], {
            name: body.name,
            mime: body.mime,
            size: body.size,
            requestId: body.requestId,
          }),
        );
      }
      if (path.length === 1 && path[0] === "projects") {
        if (
          !(
            "workspace" in body &&
            typeof body.workspace === "string" &&
            isStudioId(body.workspace) &&
            "name" in body &&
            typeof body.name === "string" &&
            body.name.trim().length > 0 &&
            body.name.length <= 100 &&
            "type" in body &&
            typeof body.type === "string" &&
            ["construction", "travel", "event", "free"].includes(body.type)
          )
        )
          throw new MediaError("Projet invalide.");
        const { client } = await mediaContext();
        const { data, error } = await client.rpc("studio_create_project", {
          p_workspace: body.workspace,
          p_name: body.name,
          p_type: body.type,
        });
        if (error) throw new MediaError("Création refusée.", 403);
        return Response.json({ id: data });
      }
    }
    throw new MediaError("Route inconnue.", 404);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MediaError
            ? error.message
            : "Opération indisponible. Vérifiez le fichier puis réessayez.",
      },
      {
        status: error instanceof MediaError ? error.status : 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
export { handle as GET, handle as POST, handle as DELETE };
