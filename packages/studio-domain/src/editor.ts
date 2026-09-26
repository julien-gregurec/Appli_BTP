import { isStudioId } from "./index";
import {
  buildTimeline,
  editTimelineClip,
  photoMotion,
  recalculateTimeline,
  TimelineValidationError,
  type ClipEdit,
  type TimelineAsset,
  type TimelineDocument,
  type TimelineDraft,
  type StudioTimelineClip,
} from "./timeline";
import {
  fontRoles,
  boundedText,
  retimePresentation,
  validatePresentation,
  type TextOverlay,
  type TimelinePresentation,
} from "./presentation";

/** The editor stores the canonical timeline, never a parallel composition model. */
export type EditorCommand =
  | { type: "edit"; id: string; patch: ClipEdit }
  | { type: "move"; id: string; index: number }
  | { type: "remove"; id: string }
  | { type: "insert"; asset: string; id: string; index: number }
  | { type: "duplicate"; id: string; nextId: string }
  | { type: "replace"; id: string; asset: string }
  | { type: "volume"; id: string; value: number }
  | { type: "crop"; id: string; value: "cover" | "contain" }
  | { type: "overlay"; overlay: TextOverlay }
  | { type: "removeOverlay"; id: string }
  | { type: "logo"; logo: TimelinePresentation["logo"] };
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export function editorFingerprint(doc: TimelineDraft): string {
  return JSON.stringify(
    stable({
      clips: doc.clips.map((c) => ({
        ...c,
        id: undefined,
        timeline_id: undefined,
        project_id: undefined,
        workspace_id: undefined,
        created_at: undefined,
        updated_at: undefined,
      })),
      presentation: doc.presentation ?? null,
    }),
  );
}
function finish(doc: TimelineDocument): TimelineDocument {
  const clips = recalculateTimeline(doc.clips);
  if (clips.length > 1000)
    throw new TimelineValidationError("1000 clips maximum.");
  const presentation = retimePresentation(doc.presentation, clips);
  if (presentation) validatePresentation(presentation, clips);
  return {
    ...doc,
    clips,
    presentation,
    total_duration_ms: clips.at(-1)?.timeline_end_ms ?? 0,
  };
}
export function applyEditorCommand(
  doc: TimelineDocument,
  command: EditorCommand,
  assets: TimelineAsset[],
): TimelineDocument {
  let clips = doc.clips.slice();
  let presentation = doc.presentation;
  const index =
    "id" in command ? clips.findIndex((c) => c.id === command.id) : -1;
  const c = clips[index];
  const source = (id: string) => {
    const a = assets.find(
      (a) => a.id === id && a.upload_status === "ready" && !a.deleted_at,
    );
    if (!a)
      throw new TimelineValidationError("Média indisponible dans ce projet.");
    return a;
  };
  if (
    [
      "edit",
      "move",
      "remove",
      "duplicate",
      "replace",
      "volume",
      "crop",
    ].includes(command.type) &&
    !c
  )
    throw new TimelineValidationError("Clip introuvable.");
  switch (command.type) {
    case "edit":
      clips[index] = editTimelineClip(
        c,
        command.patch,
        assets.find((a) => a.id === c.asset_id),
      );
      break;
    case "move":
      if (
        !Number.isInteger(command.index) ||
        command.index < 0 ||
        command.index >= clips.length
      )
        throw new TimelineValidationError("Position invalide.");
      clips.splice(index, 1);
      clips.splice(command.index, 0, c);
      break;
    case "remove":
      clips.splice(index, 1);
      break;
    case "insert": {
      if (
        !isStudioId(command.id) ||
        clips.some((c) => c.id === command.id) ||
        !Number.isInteger(command.index) ||
        command.index < 0 ||
        command.index > clips.length
      )
        throw new TimelineValidationError("Insertion invalide.");
      const base = buildTimeline({
        project: {
          target_duration_seconds: null,
          target_aspect_ratio: doc.aspect_ratio,
        },
        assets: [source(command.asset)],
      }).clips[0];
      clips.splice(command.index, 0, {
        ...base,
        id: command.id,
        timeline_id: doc.id,
        workspace_id: doc.workspace_id,
        project_id: doc.project_id,
        metadata_json: { ...base.metadata_json, key: command.id },
      });
      break;
    }
    case "duplicate": {
      if (
        !isStudioId(command.nextId) ||
        clips.some((c) => c.id === command.nextId)
      )
        throw new TimelineValidationError("Identifiant invalide.");
      const key = command.nextId;
      clips.splice(index + 1, 0, {
        ...c,
        id: key,
        metadata_json: { ...c.metadata_json, key },
      });
      if (presentation)
        presentation = {
          ...presentation,
          overlays: [
            ...presentation.overlays,
            ...presentation.overlays
              .filter((o) => o.clip_key === c.metadata_json.key)
              .map((o, i) => ({ ...o, id: `${key}-${i}`, clip_key: key })),
          ],
        };
      break;
    }
    case "replace": {
      const a = source(command.asset);
      if (c.clip_type === "card")
        clips[index] = {
          ...c,
          asset_id: a.id,
          metadata_json: {
            ...c.metadata_json,
            card: { ...c.metadata_json.card!, media_mode: "cover" },
          },
        };
      else {
        const duration =
          a.media_type === "video"
            ? Math.min(c.duration_ms, a.duration_ms ?? 0)
            : c.duration_ms;
        if (!duration)
          throw new TimelineValidationError("Durée source inconnue.");
        clips[index] = {
          ...c,
          asset_id: a.id,
          clip_type: a.media_type,
          duration_ms: duration,
          source_start_ms: 0,
          source_end_ms: a.media_type === "video" ? duration : null,
          volume:
            a.media_type === "video"
              ? c.clip_type === "video"
                ? c.volume
                : 1
              : 0,
          animation_type:
            a.media_type === "video" ? "static" : c.animation_type,
          metadata_json: {
            ...c.metadata_json,
            motion: photoMotion(
              a.media_type === "video" ? "static" : c.animation_type,
            ),
          },
        };
      }
      break;
    }
    case "volume":
      if (
        c.clip_type !== "video" ||
        !Number.isFinite(command.value) ||
        command.value < 0 ||
        command.value > 1
      )
        throw new TimelineValidationError("Volume invalide.");
      clips[index] = { ...c, volume: command.value };
      break;
    case "crop":
      clips[index] = { ...c, crop_mode: command.value };
      break;
    case "overlay":
      if (!presentation)
        presentation = {
          version: 1,
          template: { id: "manual", version: 1, snapshot: {} },
          typography: Object.fromEntries(
            fontRoles.map((role) => [
              role,
              {
                family: "sans",
                size: role === "title" ? 0.06 : 0.04,
                weight: 700,
                spacing: 0,
              },
            ]),
          ) as TimelinePresentation["typography"],
          overlays: [],
          logo: null,
        };
      clips = clips.map((c) =>
        !c.metadata_json.key && c.id === command.overlay.clip_key
          ? { ...c, metadata_json: { ...c.metadata_json, key: c.id } }
          : c,
      );
      {
        const overlay = {
          ...command.overlay,
          text: boundedText(command.overlay.text),
          ...(command.overlay.hidden_text !== undefined
            ? { hidden_text: boundedText(command.overlay.hidden_text) }
            : {}),
        };
        presentation = {
          ...presentation,
          overlays: presentation.overlays.some((o) => o.id === overlay.id)
            ? presentation.overlays.map((o) =>
                o.id === overlay.id ? overlay : o,
              )
            : [...presentation.overlays, overlay],
        };
        validatePresentation(presentation, clips);
      }
      break;
    case "removeOverlay":
      if (presentation)
        presentation = {
          ...presentation,
          overlays: presentation.overlays.filter((o) => o.id !== command.id),
        };
      break;
    case "logo":
      if (presentation) presentation = { ...presentation, logo: command.logo };
      break;
  }
  return finish({ ...doc, clips, presentation });
}
export interface EditorHistory {
  present: TimelineDocument;
  past: TimelineDocument[];
  future: TimelineDocument[];
}
export function editorHistory(doc: TimelineDocument): EditorHistory {
  return { present: doc, past: [], future: [] };
}
export function editorStep(
  state: EditorHistory,
  next: TimelineDocument,
): EditorHistory {
  if (editorFingerprint(state.present) === editorFingerprint(next))
    return state;
  return {
    present: next,
    past: [...state.past.slice(-39), state.present],
    future: [],
  };
}
export function editorUndo(state: EditorHistory): EditorHistory {
  const present = state.past.at(-1);
  return present
    ? {
        present,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future],
      }
    : state;
}
export function editorRedo(state: EditorHistory): EditorHistory {
  const present = state.future[0];
  return present
    ? {
        present,
        past: [...state.past, state.present],
        future: state.future.slice(1),
      }
    : state;
}

function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new TimelineValidationError("Document invalide.");
  return Object.fromEntries(Object.entries(v));
}
/** SQL remains authoritative; this boundary also rejects unsupported renderer parameters. */
export function parseEditorDraft(
  value: unknown,
  current: TimelineDocument,
  assets: TimelineAsset[],
): TimelineDocument {
  const v = object(value);
  if (!Array.isArray(v.clips) || v.clips.length > 1000)
    throw new TimelineValidationError("Clips invalides.");
  const seen = new Set<string>();
  const clips: StudioTimelineClip[] = v.clips.map((raw) => {
    const r = object(raw),
      meta = object(r.metadata_json);
    if (!isStudioId(r.id) || seen.has(r.id))
      throw new TimelineValidationError("Identifiant clip invalide.");
    seen.add(r.id);
    if (
      !["image", "video", "card"].includes(String(r.clip_type)) ||
      (r.asset_id !== null && !isStudioId(r.asset_id))
    )
      throw new TimelineValidationError("Source invalide.");
    for (const k of [
      "sort_order",
      "source_start_ms",
      "timeline_start_ms",
      "timeline_end_ms",
      "duration_ms",
      "transition_duration_ms",
    ])
      if (typeof r[k] !== "number" || !Number.isSafeInteger(r[k]))
        throw new TimelineValidationError("Temps invalide.");
    if (
      r.source_end_ms !== null &&
      (typeof r.source_end_ms !== "number" ||
        !Number.isSafeInteger(r.source_end_ms))
    )
      throw new TimelineValidationError("Découpe invalide.");
    if (
      r.scale !== 1 ||
      r.position_x !== 0.5 ||
      r.position_y !== 0.5 ||
      r.rotation !== 0 ||
      r.playback_rate !== 1 ||
      !["cover", "contain"].includes(String(r.crop_mode)) ||
      typeof r.volume !== "number" ||
      r.volume < 0 ||
      r.volume > 1 ||
      !Number.isFinite(r.volume)
    )
      throw new TimelineValidationError("Transformation invalide.");
    if (
      ![
        "static",
        "zoom_in",
        "zoom_out",
        "pan_left",
        "pan_right",
        "pan_up",
        "pan_down",
      ].includes(String(r.animation_type)) ||
      ![
        "cut",
        "fade",
        "dissolve",
        "slide_left",
        "slide_right",
        "zoom",
      ].includes(String(r.transition_in)) ||
      r.transition_out !== "cut"
    )
      throw new TimelineValidationError("Effet invalide.");
    if (
      meta.key !== undefined &&
      (typeof meta.key !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(meta.key))
    )
      throw new TimelineValidationError("Clé invalide.");
    // Every primitive above is checked; nested motion/card are checked below and again by SQL.
    const clip = r as unknown as StudioTimelineClip;
    if (
      JSON.stringify(stable(meta.motion)) !==
      JSON.stringify(stable(photoMotion(clip.animation_type)))
    )
      throw new TimelineValidationError("Mouvement invalide.");
    if (clip.clip_type === "card") {
      const card = object(meta.card);
      if (
        !["intro", "outro"].includes(String(card.kind)) ||
        typeof card.color !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(card.color) ||
        card.media_mode !== (clip.asset_id ? "cover" : "solid") ||
        clip.source_start_ms !== 0 ||
        clip.source_end_ms !== null ||
        clip.volume !== 0 ||
        clip.animation_type !== "static"
      )
        throw new TimelineValidationError("Écran invalide.");
    } else if (meta.card !== undefined)
      throw new TimelineValidationError("Écran invalide.");
    const a = assets.find(
      (a) =>
        a.id === clip.asset_id && a.upload_status === "ready" && !a.deleted_at,
    );
    if (
      !(clip.clip_type === "card" && clip.asset_id === null) &&
      (!a || (clip.clip_type !== "card" && a.media_type !== clip.clip_type))
    )
      throw new TimelineValidationError("Média indisponible dans ce projet.");
    if (
      clip.clip_type === "image" &&
      (clip.volume !== 0 ||
        clip.source_start_ms !== 0 ||
        clip.source_end_ms !== null)
    )
      throw new TimelineValidationError("Photo invalide.");
    if (
      clip.clip_type === "video" &&
      (clip.animation_type !== "static" ||
        !a?.duration_ms ||
        clip.source_start_ms < 0 ||
        clip.source_end_ms === null ||
        clip.source_end_ms > a.duration_ms ||
        clip.duration_ms !== clip.source_end_ms - clip.source_start_ms)
    )
      throw new TimelineValidationError("Découpe hors source.");
    return {
      ...clip,
      timeline_id: current.id,
      project_id: current.project_id,
      workspace_id: current.workspace_id,
    };
  });
  let presentation: TimelinePresentation | null = null;
  if (v.presentation != null) {
    const p = object(v.presentation);
    // Validator checks the complete nested presentation; failure is mapped to a validation error.
    try {
      validatePresentation(p as unknown as TimelinePresentation, clips);
    } catch {
      throw new TimelineValidationError("Présentation invalide.");
    }
    presentation = p as unknown as TimelinePresentation;
  }
  if (clips.some((c) => c.clip_type === "card") && !presentation)
    throw new TimelineValidationError("Présentation requise.");
  return finish({ ...current, clips, presentation });
}
