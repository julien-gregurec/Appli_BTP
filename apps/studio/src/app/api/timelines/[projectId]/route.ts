import { TimelineValidationError, parseClipEdit } from "@elsatia/studio-domain";
import { studioOrigin } from "../../../../lib/config";
import { MediaError } from "../../../../lib/media-service";
import { isTransportError } from "../../../../lib/rest-status";
import {
  generateStudioTimeline,
  getStudioTimelineState,
  updateTimelineClip,
  reorderTimelineClips,
  removeTimelineClip,
  addTimelineClip,
  setActiveTimeline,
  deleteStudioTimeline,
} from "../../../../lib/timelines";
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
      size += value.length;
      if (size > 65536) throw new MediaError("Demande trop volumineuse.", 413);
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
function string(v: unknown) {
  if (typeof v !== "string") throw new MediaError("Identifiant invalide.");
  return v;
}
async function handle(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    let output: unknown;
    if (request.method === "GET")
      output = await getStudioTimelineState(projectId);
    else {
      if (request.headers.get("origin") !== studioOrigin())
        throw new MediaError("Origine refusée.", 403);
      const b = await bodyOf(request);
      if (b.action === "generate")
        output = await generateStudioTimeline(projectId);
      else {
        const timeline = string(b.timeline);
        if (b.action === "activate")
          output = await setActiveTimeline(projectId, timeline);
        else if (b.action === "delete") {
          await deleteStudioTimeline(projectId, timeline);
          output = { ok: true };
        } else {
          if (
            typeof b.revision !== "number" ||
            !Number.isSafeInteger(b.revision)
          )
            throw new MediaError("Révision invalide.");
          if (b.action === "remove")
            output = await removeTimelineClip(
              projectId,
              timeline,
              b.revision,
              string(b.clip),
            );
          else if (b.action === "add")
            output = await addTimelineClip(
              projectId,
              timeline,
              b.revision,
              string(b.asset),
            );
          else if (b.action === "order") {
            if (
              !Array.isArray(b.ids) ||
              !b.ids.every((v): v is string => typeof v === "string")
            )
              throw new MediaError("Ordre invalide.");
            output = await reorderTimelineClips(
              projectId,
              timeline,
              b.revision,
              b.ids,
            );
          } else if (b.action === "edit") {
            if (
              !b.patch ||
              typeof b.patch !== "object" ||
              Array.isArray(b.patch)
            )
              throw new MediaError("Modification invalide.");
            output = await updateTimelineClip(
              projectId,
              timeline,
              b.revision,
              string(b.clip),
              parseClipEdit(b.patch),
            );
          } else throw new MediaError("Action inconnue.", 404);
        }
      }
    }
    return Response.json(output, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const known =
      error instanceof MediaError || error instanceof TimelineValidationError;
    return Response.json(
      { error: known ? error.message : "Service montage indisponible." },
      {
        status:
          error instanceof MediaError
            ? error.status
            : error instanceof TimelineValidationError ||
                error instanceof SyntaxError
              ? 400
              : isTransportError(error)
                ? 503
                : 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
export { handle as GET, handle as POST };
