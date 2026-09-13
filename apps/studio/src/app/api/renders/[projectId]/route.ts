import { studioOrigin } from "../../../../lib/config";
import { MediaError } from "../../../../lib/media-service";
import {
  getStudioRenders,
  requestStudioRender,
  cancelStudioRender,
  getRenderDownloadUrl,
} from "../../../../lib/renders";
export const runtime = "nodejs";
async function handle(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    let result: unknown;
    if (request.method === "GET") result = await getStudioRenders(projectId);
    else {
      if (request.headers.get("origin") !== studioOrigin())
        throw new MediaError("Origine refusée.", 403);
      const reader = request.body?.getReader();
      if (!reader) throw new MediaError("Demande vide.");
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > 4096)
            throw new MediaError("Demande trop volumineuse.", 413);
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const b: unknown = JSON.parse(Buffer.concat(chunks).toString());
      if (!b || typeof b !== "object" || !("action" in b))
        throw new MediaError("Demande invalide.");
      if (
        ("timeline" in b || "revision" in b) &&
        (!("timeline" in b) ||
          typeof b.timeline !== "string" ||
          !("revision" in b) ||
          typeof b.revision !== "number" ||
          !Number.isSafeInteger(b.revision) ||
          b.revision < 1)
      )
        throw new MediaError("Révision invalide.");
      if (
        b.action === "create" &&
        "requestId" in b &&
        typeof b.requestId === "string"
      )
        result = await requestStudioRender(
          projectId,
          b.requestId,
          "retry" in b && typeof b.retry === "string" ? b.retry : null,
          "preview" in b && b.preview === true,
          "timeline" in b &&
            typeof b.timeline === "string" &&
            "revision" in b &&
            typeof b.revision === "number"
            ? { timeline: b.timeline, revision: b.revision }
            : undefined,
        );
      else if (b.action === "cancel" && "job" in b && typeof b.job === "string")
        result = await cancelStudioRender(projectId, b.job);
      else if (
        b.action === "preview" &&
        "output" in b &&
        typeof b.output === "string"
      )
        result = await getRenderDownloadUrl(
          projectId,
          b.output,
          "download" in b && b.download === true,
        );
      else throw new MediaError("Action invalide.");
    }
    return Response.json(result, {
      status: request.method === "POST" ? 202 : 200,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof MediaError ? e.message : "Service rendu indisponible.",
      },
      {
        status:
          e instanceof MediaError
            ? e.status
            : e instanceof SyntaxError
              ? 400
              : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
export { handle as GET, handle as POST };
