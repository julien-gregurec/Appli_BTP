import "server-only";
import {
  buildTimeline,
  parseEditorDraft,
  editorFingerprint,
  buildTemplateTimeline,
  parseTemplateOptions,
  retimePresentation,
  boundedText,
  recalculateTimeline,
  editTimelineClip,
  isStudioId,
  TimelineValidationError,
  type TimelineDraft,
  type TimelineDocument,
  type ClipEdit,
} from "@elsatia/studio-domain";
import { authorizeProject, MediaError } from "./media-service";
import { restErrorStatus } from "./rest-status";
function checked<T>(r: {
  data: T;
  error: { code?: string } | null;
  status: number;
}): T {
  if (r.error)
    throw new MediaError(
      r.error.code === "40001"
        ? "Le projet ou le montage a changé. Rechargez avant de sauvegarder."
        : "Action montage refusée ou service indisponible.",
      restErrorStatus(r.error, r.status),
    );
  return r.data;
}
function id(value: string) {
  if (!isStudioId(value)) throw new MediaError("Montage inaccessible.", 404);
}
type Client = Awaited<ReturnType<typeof authorizeProject>>["client"];
async function listWithClient(client: Client, projectId: string) {
  return (
    checked(
      await client
        .from("studio_timelines")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: false }),
    ) ?? []
  );
}
export async function listStudioTimelines(projectId: string) {
  const { client } = await authorizeProject(projectId);
  return listWithClient(client, projectId);
}
export async function getStudioTimeline(
  projectId: string,
  timelineId: string,
): Promise<TimelineDocument> {
  const { client } = await authorizeProject(projectId);
  return readWithClient(client, projectId, timelineId);
}
async function readWithClient(
  client: Client,
  projectId: string,
  timelineId: string,
): Promise<TimelineDocument> {
  id(timelineId);
  const t = checked(
    await client.rpc("studio_get_timeline", {
      p_project: projectId,
      p_timeline: timelineId,
    }),
  );
  if (!t) throw new MediaError("Montage inaccessible.", 404);
  return t;
}
export async function getActiveStudioTimeline(projectId: string) {
  const { client, project } = await authorizeProject(projectId);
  return project.active_timeline_id
    ? readWithClient(client, projectId, project.active_timeline_id)
    : null;
}
export async function generateStudioTimeline(
  projectId: string,
  options?: unknown,
) {
  const { client, project } = await authorizeProject(projectId, true);
  const assets =
    checked(
      await client.rpc("studio_list_project_media", {
        p_project: projectId,
        p_offset: 0,
        p_limit: 1000,
      }),
    ) ?? [];
  const draft =
    options === undefined
      ? buildTimeline({ project, assets })
      : buildTemplateTimeline(project, assets, parseTemplateOptions(options));
  const result = checked(
    await client.rpc("studio_save_timeline", {
      p_project: projectId,
      p_timeline: null,
      p_revision: null,
      p_project_revision: project.revision,
      p_draft: draft,
    }),
  );
  if (!result) throw new MediaError("Création du montage impossible.", 500);
  return readWithClient(client, projectId, result);
}
async function mutate(
  projectId: string,
  timelineId: string,
  revision: number,
  change: (
    doc: TimelineDocument,
    assets: Awaited<ReturnType<typeof assetsFor>>,
  ) => TimelineDraft,
) {
  const { client, project } = await authorizeProject(projectId, true);
  const doc = await readWithClient(client, projectId, timelineId);
  if (!Number.isSafeInteger(revision) || revision !== doc.revision)
    throw new MediaError(
      "Le montage a changé. Rechargez avant de sauvegarder.",
      409,
    );
  const draft = change(doc, await assetsFor(client, projectId));
  draft.clips = recalculateTimeline(draft.clips);
  draft.presentation = retimePresentation(draft.presentation, draft.clips);
  draft.total_duration_ms = draft.clips.at(-1)?.timeline_end_ms ?? 0;
  checked(
    await client.rpc("studio_save_timeline", {
      p_project: projectId,
      p_timeline: timelineId,
      p_revision: revision,
      p_project_revision: project.revision,
      p_draft: draft,
    }),
  );
  return readWithClient(client, projectId, timelineId);
}
async function assetsFor(client: Client, projectId: string) {
  return (
    checked(
      await client.rpc("studio_list_project_media", {
        p_project: projectId,
        p_offset: 0,
        p_limit: 1000,
      }),
    ) ?? []
  );
}
export function updateTimelineClip(
  projectId: string,
  timelineId: string,
  revision: number,
  clipId: string,
  patch: ClipEdit,
) {
  id(clipId);
  return mutate(projectId, timelineId, revision, (doc, assets) => {
    const clip = doc.clips.find((c) => c.id === clipId),
      asset = assets.find((a) => a.id === clip?.asset_id);
    if (!clip || (!asset && clip.clip_type !== "card"))
      throw new MediaError(
        "Média indisponible. Retirez le clip ou réimportez le média.",
        409,
      );
    return {
      ...doc,
      clips: doc.clips.map((c) =>
        c.id === clipId ? editTimelineClip(c, patch, asset) : c,
      ),
    };
  });
}
export function reorderTimelineClips(
  projectId: string,
  timelineId: string,
  revision: number,
  ids: string[],
) {
  return mutate(projectId, timelineId, revision, (doc) => {
    if (
      ids.length !== doc.clips.length ||
      new Set(ids).size !== ids.length ||
      ids.some((i) => !doc.clips.some((c) => c.id === i))
    )
      throw new TimelineValidationError("Ordre invalide.");
    const byId = new Map(doc.clips.map((c) => [c.id, c]));
    return { ...doc, clips: ids.map((i) => byId.get(i)!) };
  });
}
export function removeTimelineClip(
  projectId: string,
  timelineId: string,
  revision: number,
  clipId: string,
) {
  id(clipId);
  return mutate(projectId, timelineId, revision, (doc) => {
    if (!doc.clips.some((c) => c.id === clipId))
      throw new MediaError("Clip inaccessible.", 404);
    return { ...doc, clips: doc.clips.filter((c) => c.id !== clipId) };
  });
}
export function addTimelineClip(
  projectId: string,
  timelineId: string,
  revision: number,
  assetId: string,
) {
  id(assetId);
  return mutate(projectId, timelineId, revision, (doc, assets) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) throw new MediaError("Média inaccessible.", 404);
    const draft = buildTimeline({
      project: {
        target_duration_seconds: null,
        target_aspect_ratio: doc.aspect_ratio,
      },
      assets: [asset],
    });
    if (doc.clips.length >= 1000)
      throw new TimelineValidationError("1000 clips maximum.");
    return { ...doc, clips: [...doc.clips, ...draft.clips] };
  });
}
export async function setActiveTimeline(projectId: string, timelineId: string) {
  id(timelineId);
  const { client } = await authorizeProject(projectId, true);
  checked(
    await client.rpc("studio_activate_timeline", {
      p_project: projectId,
      p_timeline: timelineId,
    }),
  );
  return readWithClient(client, projectId, timelineId);
}
export async function deleteStudioTimeline(
  projectId: string,
  timelineId: string,
) {
  id(timelineId);
  const { client } = await authorizeProject(projectId, true);
  checked(
    await client.rpc("studio_delete_timeline", {
      p_project: projectId,
      p_timeline: timelineId,
    }),
  );
}

export async function getStudioTimelineState(projectId: string) {
  const { client, project } = await authorizeProject(projectId);
  const active = project.active_timeline_id
    ? await readWithClient(client, projectId, project.active_timeline_id)
    : null;
  return { active, versions: await listWithClient(client, projectId), project };
}

export function updateTimelineText(
  projectId: string,
  timelineId: string,
  revision: number,
  overlayId: string,
  text: string,
) {
  return mutate(projectId, timelineId, revision, (doc) => {
    if (!doc.presentation?.overlays.some((o) => o.id === overlayId))
      throw new MediaError("Texte inaccessible.", 404);
    return {
      ...doc,
      presentation: {
        ...doc.presentation,
        overlays: doc.presentation.overlays.map((o) =>
          o.id === overlayId ? { ...o, text: boundedText(text) } : o,
        ),
      },
    };
  });
}

/** One atomic write for the editor; revision guards are enforced again under the DB lock. */
export async function saveStudioEditor(
  projectId: string,
  timelineId: string,
  revision: number,
  value: unknown,
) {
  const { client, project } = await authorizeProject(projectId, true);
  const doc = await readWithClient(client, projectId, timelineId);
  if (
    !Number.isSafeInteger(revision) ||
    revision !== doc.revision ||
    project.active_timeline_id !== timelineId
  )
    throw new MediaError(
      "Cette version a été modifiée ailleurs. Rechargez la page.",
      409,
    );
  const draft = parseEditorDraft(
    value,
    doc,
    await assetsFor(client, projectId),
  );
  const result = checked(
    await client.rpc("studio_save_editor", {
      p_project: projectId,
      p_timeline: timelineId,
      p_revision: revision,
      p_project_revision: project.revision,
      p_draft: draft,
    }),
  );
  if (
    !result ||
    result.revision !== revision + 1 ||
    editorFingerprint(result) !== editorFingerprint(draft)
  )
    throw new MediaError(
      "Réponse de sauvegarde incohérente. Rechargez la page.",
      409,
    );
  return result;
}
