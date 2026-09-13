import type { AspectRatio, StudioProject } from "./projects";
import type { StudioMediaAsset } from "./media";
import type { TimelinePresentation } from "./presentation";
export const animationNames = {
  static: "Fixe",
  zoom_in: "Zoom avant",
  zoom_out: "Zoom arrière",
  pan_left: "Vers la gauche",
  pan_right: "Vers la droite",
  pan_up: "Vers le haut",
  pan_down: "Vers le bas",
} as const;
export const transitionNames = {
  cut: "Coupe",
  fade: "Fondu au noir",
  dissolve: "Fondu",
  slide_left: "Glissement gauche",
  slide_right: "Glissement droite",
  zoom: "Zoom",
} as const;
export type Animation = keyof typeof animationNames;
export type Transition = keyof typeof transitionNames;
export interface Motion {
  scaleStart: number;
  scaleEnd: number;
  positionStart: [number, number];
  positionEnd: [number, number];
  easing: "linear";
}
export interface TimelineClipDraft {
  asset_id: string | null;
  clip_type: "image" | "video" | "card";
  sort_order: number;
  source_start_ms: number;
  source_end_ms: number | null;
  timeline_start_ms: number;
  timeline_end_ms: number;
  duration_ms: number;
  crop_mode: "cover" | "contain";
  scale: number;
  position_x: number;
  position_y: number;
  rotation: number;
  playback_rate: number;
  volume: number;
  animation_type: Animation;
  transition_in: Transition;
  transition_out: Transition;
  transition_duration_ms: number;
  metadata_json: {
    motion: Motion;
    key?: string;
    card?: {
      kind: "intro" | "outro";
      color: string;
      media_mode: "solid" | "cover";
    };
  };
}
export interface TimelineDraft {
  generator_version: "v1";
  aspect_ratio: AspectRatio;
  target_duration_ms: number | null;
  total_duration_ms: number;
  excluded_assets: number;
  clips: TimelineClipDraft[];
  presentation?: TimelinePresentation | null;
}
export interface StudioTimeline extends Omit<TimelineDraft, "clips"> {
  id: string;
  project_id: string;
  workspace_id: string;
  version: number;
  revision: number;
  status: "generated" | "modified";
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface StudioTimelineClip extends TimelineClipDraft {
  id: string;
  timeline_id: string;
  project_id: string;
  workspace_id: string;
}
export interface TimelineDocument extends StudioTimeline {
  clips: StudioTimelineClip[];
}
export class TimelineValidationError extends Error {}
function integer(n: number, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new TimelineValidationError(`${label} invalide.`);
}
export function photoMotion(animation: Animation): Motion {
  const motion: Motion = {
    scaleStart: 1,
    scaleEnd: 1,
    positionStart: [0.5, 0.5],
    positionEnd: [0.5, 0.5],
    easing: "linear",
  };
  if (animation === "zoom_in") motion.scaleEnd = 1.1;
  if (animation === "zoom_out") motion.scaleStart = 1.1;
  if (animation.startsWith("pan_")) {
    motion.scaleStart = motion.scaleEnd = 1.1;
    const axis = animation === "pan_left" || animation === "pan_right" ? 0 : 1;
    const reverse = animation === "pan_left" || animation === "pan_up";
    motion.positionStart[axis] = reverse ? 0.55 : 0.45;
    motion.positionEnd[axis] = reverse ? 0.45 : 0.55;
  }
  return motion;
}
/** Sequential half-open intervals. Transitions occupy the incoming clip, never add time. */
export function recalculateTimeline<T extends TimelineClipDraft>(
  clips: T[],
): T[] {
  let cursor = 0;
  return clips.map((c, i) => {
    integer(c.duration_ms, 1, 600000, "Durée");
    integer(
      c.transition_duration_ms,
      0,
      Math.floor(c.duration_ms / 2),
      "Transition",
    );
    if (c.transition_in !== "cut" && c.transition_duration_ms === 0)
      throw new TimelineValidationError(
        "La transition doit avoir une durée positive.",
      );
    const next = {
      ...c,
      sort_order: i,
      timeline_start_ms: cursor,
      timeline_end_ms: cursor + c.duration_ms,
    };
    cursor = next.timeline_end_ms;
    return next;
  });
}
export type TimelineAsset = Pick<
  StudioMediaAsset,
  "id" | "media_type" | "duration_ms" | "upload_status" | "deleted_at"
>;
export interface TimelineTimingRules {
  photoMinDuration: number;
  photoPreferredDuration: number;
  photoMaxDuration: number;
  videoPreferredDuration: number;
}
export function buildTimeline(input: {
  project: Pick<
    StudioProject,
    "target_duration_seconds" | "target_aspect_ratio"
  >;
  assets: TimelineAsset[];
  generator_version?: "v1";
  timingRules?: TimelineTimingRules;
  target_duration_ms?: number | null;
}): TimelineDraft {
  if (input.generator_version && input.generator_version !== "v1")
    throw new TimelineValidationError("Version de moteur inconnue.");
  if (input.assets.length > 1000)
    throw new TimelineValidationError("1000 médias maximum.");
  const assets = input.assets.filter(
    (a) => a.upload_status === "ready" && !a.deleted_at,
  );
  if (!assets.length)
    throw new TimelineValidationError(
      "Ajoutez au moins un média avant de créer la vidéo.",
    );
  const rules = input.timingRules ?? {
    photoMinDuration: 1000,
    photoPreferredDuration: 3000,
    photoMaxDuration: 15000,
    videoPreferredDuration: 5000,
  };
  for (const n of Object.values(rules)) integer(n, 34, 600000, "Rythme");
  if (
    rules.photoMinDuration > rules.photoPreferredDuration ||
    rules.photoPreferredDuration > rules.photoMaxDuration
  )
    throw new TimelineValidationError("Rythme incohérent.");
  const min = assets.map((a) =>
    a.media_type === "image"
      ? rules.photoMinDuration
      : Math.min(1000, videoDuration(a)),
  );
  const max = assets.map((a) =>
    a.media_type === "image"
      ? rules.photoMaxDuration
      : Math.min(15000, videoDuration(a)),
  );
  const automatic = assets.map((a) =>
    a.media_type === "image"
      ? rules.photoPreferredDuration
      : Math.min(rules.videoPreferredDuration, videoDuration(a)),
  );
  const seconds = input.project.target_duration_seconds;
  if (seconds !== null) integer(seconds, 1, 600, "Durée cible");
  const target =
    input.target_duration_ms !== undefined
      ? input.target_duration_ms
      : seconds === null
        ? null
        : seconds * 1000;
  if (target !== null) integer(target, 0, 600000, "Budget montage");
  const duration = target === null ? automatic : [...min];
  if (target !== null) {
    let remaining = Math.max(
      0,
      Math.min(
        target,
        max.reduce((a, b) => a + b, 0),
      ) - duration.reduce((a, b) => a + b, 0),
    );
    // Water filling, integer remainder assigned in project order, O(n²) worst case with n<=1000.
    while (remaining > 0) {
      const available = duration
        .map((d, i) => (d < max[i] ? i : -1))
        .filter((i) => i >= 0);
      if (!available.length) break;
      const share = Math.max(1, Math.floor(remaining / available.length));
      for (const i of available) {
        const extra = Math.min(share, max[i] - duration[i], remaining);
        duration[i] += extra;
        remaining -= extra;
      }
    }
  }
  const cycle: Animation[] = [
    "zoom_in",
    "pan_left",
    "zoom_out",
    "pan_right",
    "pan_up",
    "pan_down",
    "static",
  ];
  let photo = 0;
  const clips = recalculateTimeline(
    assets.map((a, i): TimelineClipDraft => {
      const animation =
        a.media_type === "image" ? cycle[photo++ % cycle.length] : "static";
      return {
        asset_id: a.id,
        clip_type: a.media_type,
        sort_order: i,
        source_start_ms: 0,
        source_end_ms: a.media_type === "video" ? duration[i] : null,
        timeline_start_ms: 0,
        timeline_end_ms: duration[i],
        duration_ms: duration[i],
        crop_mode: "cover",
        scale: 1,
        position_x: 0.5,
        position_y: 0.5,
        rotation: 0,
        playback_rate: 1,
        volume: a.media_type === "video" ? 1 : 0,
        animation_type: animation,
        transition_in: duration[i] >= 2 ? "fade" : "cut",
        transition_out: "cut",
        transition_duration_ms: Math.min(500, Math.floor(duration[i] / 2)),
        metadata_json: { motion: photoMotion(animation) },
      };
    }),
  );
  return {
    generator_version: "v1",
    aspect_ratio: input.project.target_aspect_ratio,
    target_duration_ms: target,
    total_duration_ms: clips.at(-1)!.timeline_end_ms,
    excluded_assets: input.assets.length - assets.length,
    clips,
  };
}
function videoDuration(a: TimelineAsset) {
  if (a.duration_ms === null)
    throw new TimelineValidationError("Durée vidéo indisponible.");
  integer(a.duration_ms, 1, 86400000, "Durée vidéo");
  return a.duration_ms;
}
export interface ClipEdit {
  duration_ms?: number;
  source_start_ms?: number;
  source_end_ms?: number;
  transition_in?: Transition;
  transition_duration_ms?: number;
  animation_type?: Animation;
}
export function editTimelineClip<T extends TimelineClipDraft>(
  clip: T,
  patch: ClipEdit,
  asset: TimelineAsset | undefined,
): T {
  const c = { ...clip };
  for (const key of Object.keys(patch))
    if (
      ![
        "duration_ms",
        "source_start_ms",
        "source_end_ms",
        "transition_in",
        "transition_duration_ms",
        "animation_type",
      ].includes(key)
    )
      throw new TimelineValidationError("Modification invalide.");
  if (patch.animation_type !== undefined) {
    if (
      !Object.hasOwn(animationNames, patch.animation_type) ||
      c.clip_type !== "image"
    )
      throw new TimelineValidationError("Animation invalide.");
    c.animation_type = patch.animation_type;
    c.metadata_json = {
      ...c.metadata_json,
      motion: photoMotion(c.animation_type),
    };
  }
  if (c.clip_type !== "video") {
    if (
      patch.source_start_ms !== undefined ||
      patch.source_end_ms !== undefined
    )
      throw new TimelineValidationError("Découpe réservée aux vidéos.");
    if (patch.duration_ms !== undefined) c.duration_ms = patch.duration_ms;
  } else {
    if (patch.duration_ms !== undefined)
      throw new TimelineValidationError(
        "Modifiez le début et la fin de la vidéo.",
      );
    if (!asset) throw new TimelineValidationError("Média indisponible.");
    c.source_start_ms = patch.source_start_ms ?? c.source_start_ms;
    c.source_end_ms = patch.source_end_ms ?? c.source_end_ms;
    integer(c.source_start_ms, 0, videoDuration(asset) - 1, "Début");
    integer(
      c.source_end_ms ?? 0,
      c.source_start_ms + 1,
      videoDuration(asset),
      "Fin",
    );
    c.duration_ms = c.source_end_ms! - c.source_start_ms;
  }
  if (patch.transition_in !== undefined) {
    if (!Object.hasOwn(transitionNames, patch.transition_in))
      throw new TimelineValidationError("Transition invalide.");
    c.transition_in = patch.transition_in;
  }
  c.transition_duration_ms =
    patch.transition_duration_ms ?? c.transition_duration_ms;
  if (c.transition_in === "cut") c.transition_duration_ms = 0;
  recalculateTimeline([c]);
  return c;
}

/** Validate untrusted JSON before constructing the typed edit command. */
export function parseClipEdit(value: unknown): ClipEdit {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TimelineValidationError("Modification invalide.");
  const result: ClipEdit = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === "animation_type") {
      if (typeof v !== "string" || !Object.hasOwn(animationNames, v))
        throw new TimelineValidationError("Animation invalide.");
      result.animation_type = v as Animation;
    } else if (key === "transition_in") {
      if (typeof v !== "string" || !Object.hasOwn(transitionNames, v))
        throw new TimelineValidationError("Transition invalide.");
      result.transition_in = v as Transition;
    } else if (
      key === "duration_ms" ||
      key === "source_start_ms" ||
      key === "source_end_ms" ||
      key === "transition_duration_ms"
    ) {
      if (typeof v !== "number" || !Number.isSafeInteger(v))
        throw new TimelineValidationError("Durée invalide.");
      result[key] = v;
    } else throw new TimelineValidationError("Modification invalide.");
  }
  return result;
}
