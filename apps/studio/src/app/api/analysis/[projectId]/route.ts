import {
  getProjectAnalysis,
  requestProjectAnalysis,
  studioAnalysisEnabled,
} from "../../../../lib/analysis";
import { studioOrigin } from "../../../../lib/config";
import { MediaError } from "../../../../lib/media-service";
import { generateStudioTimeline } from "../../../../lib/timelines";
import { TimelineValidationError } from "@elsatia/studio-domain";
export const runtime = "nodejs";
async function handle(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    let result: unknown;
    if (request.method === "GET")
      result = await getProjectAnalysis(
        projectId,
        new URL(request.url).searchParams.get("template") || "chantier-pro",
      );
    else {
      if (request.headers.get("origin") !== studioOrigin())
        throw new MediaError("Origine refusée.", 403);
      const reader = request.body?.getReader();
      if (!reader) throw new MediaError("Demande vide.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 65536)
            throw new MediaError("Demande trop volumineuse.", 413);
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const b: unknown = JSON.parse(Buffer.concat(chunks).toString());
      if (!b || typeof b !== "object" || !("action" in b))
        throw new MediaError("Demande invalide.");
      if (b.action === "analyze")
        result = await requestProjectAnalysis(
          projectId,
          "force" in b && b.force === true,
        );
      else if (b.action === "cancel")
        result = await requestProjectAnalysis(projectId, false, true);
      else if (
        b.action === "generate" &&
        "ids" in b &&
        Array.isArray(b.ids) &&
        b.ids.every((i: unknown) => typeof i === "string") &&
        "revision" in b &&
        typeof b.revision === "number" &&
        "options" in b
      ) {
        if (!studioAnalysisEnabled())
          throw new MediaError("Analyse désactivée.", 409);
        result = await generateStudioTimeline(projectId, b.options, {
          ids: b.ids,
          revision: b.revision,
        });
      } else throw new MediaError("Action invalide.");
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof MediaError || e instanceof TimelineValidationError
            ? e.message
            : e instanceof SyntaxError
              ? "Demande invalide."
              : "Analyse indisponible.",
      },
      {
        status:
          e instanceof MediaError
            ? e.status
            : e instanceof SyntaxError || e instanceof TimelineValidationError
              ? 400
              : 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
export { handle as GET, handle as POST };
