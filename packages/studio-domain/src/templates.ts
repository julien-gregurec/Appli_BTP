import {
  buildTimeline,
  photoMotion,
  recalculateTimeline,
  TimelineValidationError,
  type TimelineTimingRules,
  type Animation,
  type Transition,
  type TimelineClipDraft,
  type TimelineDraft,
} from "./timeline";
import {
  boundedText,
  validatePresentation,
  type Typography,
  type TextOverlay,
  type TimelinePresentation,
} from "./presentation";
import type { StudioMediaAsset } from "./media";
import type { StudioProject, ProjectType, AspectRatio } from "./projects";
export interface StudioTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: "professional" | "personal";
  version: number;
  status: "active" | "hidden" | "deprecated";
  supportedProjectTypes: ProjectType[];
  supportedAspectRatios: AspectRatio[];
  thumbnail: string;
  preview: string;
  timingRules: TimelineTimingRules & {
    maxShotDuration: number;
    introDuration: number;
    outroDuration: number;
    textOverlayDuration: number;
  };
  transitionRules: { cycle: Transition[]; duration: number };
  animationRules: { cycle: Animation[]; videoVolume: number };
  typography: Typography;
  introConfig: {
    color: string;
    background: "solid" | "first";
    position: "top" | "center" | "bottom";
  };
  outroConfig: { color: string; background: "solid" | "last"; text: string };
  overlayConfig: {
    alignment: "left" | "center";
    background: "none" | "dark";
    structure: "ordered" | "chronological" | "before-after";
    chapters: boolean;
  };
  brandingConfig: { logo: boolean; width: number; position: "top" | "bottom" };
}
function typography(
  family: "sans" | "serif",
  weight: 400 | 700,
  size: number,
): Typography {
  return {
    display: { family, size, weight, spacing: 0 },
    title: { family, size: size * 0.8, weight, spacing: 0 },
    subtitle: { family: "sans", size: size * 0.53, weight: 400, spacing: 0 },
    body: { family: "sans", size: size * 0.43, weight: 400, spacing: 0 },
    caption: { family: "sans", size: size * 0.34, weight: 400, spacing: 0 },
  };
}
function template(
  id: string,
  name: string,
  description: string,
  overrides: Omit<
    StudioTemplate,
    | "id"
    | "slug"
    | "name"
    | "description"
    | "version"
    | "status"
    | "supportedAspectRatios"
    | "thumbnail"
    | "preview"
  >,
): StudioTemplate {
  return {
    id,
    slug: id,
    name,
    description,
    version: 1,
    status: "active",
    supportedAspectRatios: ["9:16", "16:9", "1:1", "4:5"],
    thumbnail: `/template-previews/${id}-v1.png`,
    preview: `/template-previews/${id}-v1.mp4`,
    ...overrides,
  };
}
const definitions: StudioTemplate[] = [
  template(
    "chantier-pro",
    "Chantier Pro",
    "Sobre et professionnel, pour présenter un chantier terminé.",
    {
      category: "professional",
      supportedProjectTypes: ["construction"],
      timingRules: {
        photoMinDuration: 1000,
        photoPreferredDuration: 4500,
        photoMaxDuration: 15000,
        videoPreferredDuration: 6000,
        maxShotDuration: 15000,
        introDuration: 3000,
        outroDuration: 4000,
        textOverlayDuration: 3500,
      },
      transitionRules: { cycle: ["cut", "dissolve"], duration: 500 },
      animationRules: { cycle: ["static", "zoom_in"], videoVolume: 1 },
      typography: typography("sans", 700, 0.07),
      introConfig: {
        color: "#142c35",
        background: "solid",
        position: "center",
      },
      outroConfig: {
        color: "#142c35",
        background: "solid",
        text: "Un projet, un savoir-faire.",
      },
      overlayConfig: {
        alignment: "left",
        background: "dark",
        structure: "ordered",
        chapters: true,
      },
      brandingConfig: { logo: true, width: 0.2, position: "top" },
    },
  ),
  template(
    "chantier-dynamique",
    "Chantier Dynamique",
    "Des plans courts et des titres francs, pensés pour le vertical.",
    {
      category: "professional",
      supportedProjectTypes: ["construction"],
      timingRules: {
        photoMinDuration: 500,
        photoPreferredDuration: 1800,
        photoMaxDuration: 15000,
        videoPreferredDuration: 3000,
        maxShotDuration: 2500,
        introDuration: 1000,
        outroDuration: 2000,
        textOverlayDuration: 1800,
      },
      transitionRules: {
        cycle: ["cut", "slide_left", "cut", "zoom"],
        duration: 180,
      },
      animationRules: { cycle: ["zoom_in", "zoom_out"], videoVolume: 0.65 },
      typography: typography("sans", 700, 0.09),
      introConfig: { color: "#fa5c31", background: "solid", position: "top" },
      outroConfig: {
        color: "#202020",
        background: "last",
        text: "Place au résultat.",
      },
      overlayConfig: {
        alignment: "left",
        background: "dark",
        structure: "ordered",
        chapters: true,
      },
      brandingConfig: { logo: true, width: 0.15, position: "bottom" },
    },
  ),
  template(
    "avant-apres",
    "Avant / Après",
    "Deux groupes choisis par vous pour montrer la transformation.",
    {
      category: "professional",
      supportedProjectTypes: ["construction"],
      timingRules: {
        photoMinDuration: 1000,
        photoPreferredDuration: 3500,
        photoMaxDuration: 15000,
        videoPreferredDuration: 5000,
        maxShotDuration: 15000,
        introDuration: 2000,
        outroDuration: 2000,
        textOverlayDuration: 5000,
      },
      transitionRules: { cycle: ["cut", "slide_right"], duration: 650 },
      animationRules: { cycle: ["static"], videoVolume: 1 },
      typography: typography("sans", 700, 0.08),
      introConfig: {
        color: "#232526",
        background: "first",
        position: "center",
      },
      outroConfig: {
        color: "#132c25",
        background: "last",
        text: "La transformation.",
      },
      overlayConfig: {
        alignment: "center",
        background: "dark",
        structure: "before-after",
        chapters: false,
      },
      brandingConfig: { logo: true, width: 0.18, position: "top" },
    },
  ),
  template(
    "voyage",
    "Voyage",
    "Des lieux, des dates et des mouvements pour raconter le voyage.",
    {
      category: "personal",
      supportedProjectTypes: ["travel"],
      timingRules: {
        photoMinDuration: 750,
        photoPreferredDuration: 3000,
        photoMaxDuration: 15000,
        videoPreferredDuration: 5000,
        maxShotDuration: 6000,
        introDuration: 3000,
        outroDuration: 3000,
        textOverlayDuration: 3000,
      },
      transitionRules: { cycle: ["dissolve", "slide_left"], duration: 450 },
      animationRules: {
        cycle: ["pan_left", "zoom_in", "pan_up", "pan_right"],
        videoVolume: 0.8,
      },
      typography: typography("sans", 700, 0.075),
      introConfig: {
        color: "#174b59",
        background: "first",
        position: "bottom",
      },
      outroConfig: {
        color: "#174b59",
        background: "last",
        text: "À la prochaine aventure.",
      },
      overlayConfig: {
        alignment: "left",
        background: "dark",
        structure: "chronological",
        chapters: true,
      },
      brandingConfig: { logo: false, width: 0.15, position: "top" },
    },
  ),
  template(
    "cinematique",
    "Cinématique",
    "Des plans longs, des fondus doux et une typographie discrète.",
    {
      category: "personal",
      supportedProjectTypes: [
        "travel",
        "free",
        "event",
        "wedding",
        "birthday",
        "memory",
      ],
      timingRules: {
        photoMinDuration: 1500,
        photoPreferredDuration: 6500,
        photoMaxDuration: 25000,
        videoPreferredDuration: 10000,
        maxShotDuration: 25000,
        introDuration: 1000,
        outroDuration: 1000,
        textOverlayDuration: 2000,
      },
      transitionRules: { cycle: ["fade", "dissolve"], duration: 1000 },
      animationRules: { cycle: ["zoom_in", "pan_right"], videoVolume: 0.5 },
      typography: typography("serif", 400, 0.055),
      introConfig: {
        color: "#101010",
        background: "solid",
        position: "center",
      },
      outroConfig: { color: "#101010", background: "solid", text: "Fin" },
      overlayConfig: {
        alignment: "center",
        background: "none",
        structure: "ordered",
        chapters: false,
      },
      brandingConfig: { logo: false, width: 0.12, position: "top" },
    },
  ),
  template(
    "souvenir",
    "Souvenir",
    "Des moments à garder, avec des titres simples et un rythme doux.",
    {
      category: "personal",
      supportedProjectTypes: [
        "travel",
        "free",
        "event",
        "wedding",
        "birthday",
        "memory",
      ],
      timingRules: {
        photoMinDuration: 1000,
        photoPreferredDuration: 5000,
        photoMaxDuration: 18000,
        videoPreferredDuration: 7000,
        maxShotDuration: 18000,
        introDuration: 3000,
        outroDuration: 4000,
        textOverlayDuration: 4000,
      },
      transitionRules: {
        cycle: ["dissolve", "fade", "dissolve"],
        duration: 800,
      },
      animationRules: {
        cycle: ["static", "zoom_out", "static"],
        videoVolume: 1,
      },
      typography: typography("serif", 700, 0.08),
      introConfig: {
        color: "#623f4e",
        background: "first",
        position: "center",
      },
      outroConfig: {
        color: "#623f4e",
        background: "solid",
        text: "Des souvenirs à garder.",
      },
      overlayConfig: {
        alignment: "center",
        background: "dark",
        structure: "ordered",
        chapters: true,
      },
      brandingConfig: { logo: false, width: 0.15, position: "top" },
    },
  ),
];
/** Callers receive copies: no request can mutate the system catalogue. */
export function listStudioTemplates(): StudioTemplate[] {
  return structuredClone(definitions);
}
export function resolveStudioTemplate(id: string, version = 1): StudioTemplate {
  const t = definitions.find(
    (t) => t.id === id && t.version === version && t.status === "active",
  );
  if (!t) throw new TimelineValidationError("Style ou version indisponible.");
  return structuredClone(t);
}
export interface TemplateOptions {
  templateId: string;
  templateVersion: number;
  title?: string;
  subtitle?: string;
  outro?: string;
  company?: string;
  website?: string;
  phone?: string;
  logoAssetId?: string | null;
  introDuration?: number;
  outroDuration?: number;
  beforeIds?: string[];
  afterIds?: string[];
  chapters?: { assetId: string; title: string }[];
}
export function parseTemplateOptions(value: unknown): TemplateOptions {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TimelineValidationError("Choix de style invalide.");
  const v = value as Record<string, unknown>;
  if (typeof v.templateId !== "string" || !Number.isInteger(v.templateVersion))
    throw new TimelineValidationError("Style invalide.");
  const out: TemplateOptions = {
    templateId: v.templateId,
    templateVersion: v.templateVersion as number,
  };
  resolveStudioTemplate(out.templateId, out.templateVersion);
  for (const key of [
    "title",
    "subtitle",
    "outro",
    "company",
    "website",
    "phone",
  ] as const)
    if (v[key] !== undefined) {
      if (typeof v[key] !== "string")
        throw new TimelineValidationError("Texte invalide.");
      out[key] = boundedText(v[key]);
    }
  const id = (x: unknown): x is string =>
    typeof x === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
  if (
    v.logoAssetId !== undefined &&
    v.logoAssetId !== null &&
    !id(v.logoAssetId)
  )
    throw new TimelineValidationError("Logo invalide.");
  out.logoAssetId = v.logoAssetId as string | null | undefined;
  for (const key of ["introDuration", "outroDuration"] as const)
    if (v[key] !== undefined) {
      const n = v[key];
      if (typeof n !== "number" || !Number.isInteger(n) || n < 500 || n > 10000)
        throw new TimelineValidationError("Écran : 0,5 à 10 secondes.");
      out[key] = n;
    }
  for (const key of ["beforeIds", "afterIds"] as const)
    if (v[key] !== undefined) {
      const a = v[key];
      if (
        !Array.isArray(a) ||
        a.length > 1000 ||
        !a.every(id) ||
        new Set(a).size !== a.length
      )
        throw new TimelineValidationError("Groupe invalide.");
      out[key] = a;
    }
  if (v.chapters !== undefined) {
    if (!Array.isArray(v.chapters) || v.chapters.length > 1000)
      throw new TimelineValidationError("Chapitres invalides.");
    out.chapters = v.chapters.map((c: unknown) => {
      if (
        !c ||
        typeof c !== "object" ||
        !("assetId" in c) ||
        !("title" in c) ||
        !id(c.assetId) ||
        typeof c.title !== "string"
      )
        throw new TimelineValidationError("Chapitre invalide.");
      return { assetId: c.assetId, title: boundedText(c.title) };
    });
    if (
      new Set(out.chapters.map((c) => c.assetId)).size !== out.chapters.length
    )
      throw new TimelineValidationError("Chapitre en double.");
  }
  return out;
}
export function buildTemplateTimeline(
  project: StudioProject,
  allAssets: StudioMediaAsset[],
  options: TemplateOptions,
): TimelineDraft {
  const o = parseTemplateOptions(options),
    t = resolveStudioTemplate(o.templateId, o.templateVersion);
  if (!t.supportedAspectRatios.includes(project.target_aspect_ratio))
    throw new TimelineValidationError("Format indisponible.");
  let assets = allAssets.filter(
    (a) => a.upload_status === "ready" && !a.deleted_at,
  );
  const known = new Map(assets.map((a) => [a.id, a]));
  if (o.logoAssetId) {
    const a = known.get(o.logoAssetId);
    if (
      !t.brandingConfig.logo ||
      !a ||
      !["image/png", "image/jpeg"].includes(a.mime_type)
    )
      throw new TimelineValidationError(
        "Choisissez un logo PNG/JPEG du projet.",
      );
  }
  if (o.chapters?.some((c) => !known.has(c.assetId)))
    throw new TimelineValidationError("Chapitre sans média du projet.");
  const before = new Set(o.beforeIds ?? []),
    after = new Set(o.afterIds ?? []);
  if (t.overlayConfig.structure === "before-after") {
    if (
      !before.size ||
      !after.size ||
      [...before].some((id) => after.has(id)) ||
      [...before, ...after].some((id) => !known.has(id)) ||
      assets.some((a) => !before.has(a.id) && !after.has(a.id))
    )
      throw new TimelineValidationError(
        "Classez chaque média dans Avant ou Après, avec au moins un média par groupe.",
      );
    assets = [
      ...assets.filter((a) => before.has(a.id)),
      ...assets.filter((a) => after.has(a.id)),
    ];
  }
  if (t.overlayConfig.structure === "chronological")
    assets = assets
      .map((a, i) => ({ a, i }))
      .sort((x, y) => {
        const dx = x.a.captured_at ? Date.parse(x.a.captured_at) : NaN,
          dy = y.a.captured_at ? Date.parse(y.a.captured_at) : NaN;
        return Number.isFinite(dx) && Number.isFinite(dy)
          ? dx - dy || x.i - y.i
          : Number.isFinite(dx)
            ? -1
            : Number.isFinite(dy)
              ? 1
              : x.i - y.i;
      })
      .map((x) => x.a);
  const intro = o.introDuration ?? t.timingRules.introDuration,
    outro = o.outroDuration ?? t.timingRules.outroDuration;
  const target =
    project.target_duration_seconds === null
      ? null
      : project.target_duration_seconds * 1000;
  if (target !== null && target <= intro + outro)
    throw new TimelineValidationError(
      "La durée cible doit laisser de la place aux médias après les écrans.",
    );
  const base = buildTimeline({
    project,
    assets,
    timingRules: t.timingRules,
    target_duration_ms: target === null ? null : target - intro - outro,
  });
  const body: TimelineClipDraft[] = [];
  for (const [i, c] of base.clips.entries()) {
    const count = Math.ceil(c.duration_ms / t.timingRules.maxShotDuration);
    let offset = 0;
    for (let part = 0; part < count; part++) {
      const duration =
          Math.floor(c.duration_ms / count) +
          (part < c.duration_ms % count ? 1 : 0),
        index = body.length;
      const animation =
        c.clip_type === "image"
          ? t.animationRules.cycle[index % t.animationRules.cycle.length]
          : "static";
      const transition =
        t.transitionRules.cycle[index % t.transitionRules.cycle.length];
      body.push({
        ...c,
        duration_ms: duration,
        source_start_ms: c.clip_type === "video" ? offset : 0,
        source_end_ms: c.clip_type === "video" ? offset + duration : null,
        animation_type: animation,
        volume: c.clip_type === "video" ? t.animationRules.videoVolume : 0,
        transition_in: transition,
        transition_duration_ms:
          transition === "cut"
            ? 0
            : Math.min(t.transitionRules.duration, Math.floor(duration / 2)),
        metadata_json: {
          key: `media-${i}-${part}`,
          motion: photoMotion(animation),
        },
      });
      offset += duration;
    }
  }
  function card(kind: "intro" | "outro", duration: number): TimelineClipDraft {
    const config = kind === "intro" ? t.introConfig : t.outroConfig;
    return {
      ...base.clips[0],
      asset_id:
        config.background === "solid"
          ? null
          : kind === "intro"
            ? assets[0].id
            : assets.at(-1)!.id,
      clip_type: "card",
      duration_ms: duration,
      source_start_ms: 0,
      source_end_ms: null,
      volume: 0,
      animation_type: "static",
      transition_in: "fade",
      transition_duration_ms: Math.min(400, Math.floor(duration / 2)),
      metadata_json: {
        key: kind,
        motion: photoMotion("static"),
        card: {
          kind,
          color: config.color,
          media_mode: config.background === "solid" ? "solid" : "cover",
        },
      },
    };
  }
  const clips = recalculateTimeline([
    card("intro", intro),
    ...body,
    card("outro", outro),
  ]);
  if (clips.length > 1000)
    throw new TimelineValidationError(
      "Ce style dépasse 1000 plans. Réduisez les médias.",
    );
  const overlays: TextOverlay[] = [];
  function overlay(
    key: string,
    text: string,
    role: TextOverlay["font_role"],
    position: TextOverlay["position"],
    full = false,
  ) {
    const clean = boundedText(text);
    if (!clean) return;
    const clip = clips.find((c) => c.metadata_json.key === key)!;
    overlays.push({
      id: `${key}-${overlays.length}`,
      clip_key: key,
      text: clean,
      start_ms: 0,
      end_ms: full
        ? clip.duration_ms
        : Math.min(clip.duration_ms, t.timingRules.textOverlayDuration),
      position,
      alignment: t.overlayConfig.alignment,
      font_role: role,
      size_role: role,
      weight: t.typography[role].weight,
      animation: "fade",
      background: t.overlayConfig.background,
      color: "#ffffff",
      max_lines: role === "display" ? 3 : 2,
    });
  }
  overlay(
    "intro",
    o.title ?? project.name,
    "display",
    t.introConfig.position,
    true,
  );
  const details =
    o.subtitle ??
    [project.location_label, project.started_at].filter(Boolean).join(" · ");
  overlay(
    "intro",
    details,
    "subtitle",
    t.introConfig.position === "bottom" ? "top" : "bottom",
    true,
  );
  overlay("outro", o.outro ?? t.outroConfig.text, "title", "center", true);
  overlay(
    "outro",
    [o.company, o.website, o.phone].filter(Boolean).join(" · "),
    "caption",
    t.brandingConfig.position === "bottom" ? "top" : "bottom",
    true,
  );
  const firstKeys = new Map<string, string>();
  for (const c of body)
    if (c.asset_id && !firstKeys.has(c.asset_id))
      firstKeys.set(c.asset_id, c.metadata_json.key!);
  if (t.overlayConfig.structure === "before-after")
    for (const c of body)
      overlay(
        c.metadata_json.key!,
        before.has(c.asset_id!) ? "AVANT" : "APRÈS",
        "title",
        "top",
        true,
      );
  if (t.overlayConfig.chapters)
    for (const chapter of o.chapters ?? [])
      overlay(
        firstKeys.get(chapter.assetId)!,
        chapter.title,
        "subtitle",
        "bottom",
      );
  const presentation: TimelinePresentation = {
    version: 1,
    template: { id: t.id, version: t.version, snapshot: structuredClone(t) },
    typography: structuredClone(t.typography),
    overlays,
    logo: o.logoAssetId
      ? {
          asset_id: o.logoAssetId,
          clip_key: "outro",
          width: t.brandingConfig.width,
          position: t.brandingConfig.position,
        }
      : null,
  };
  validatePresentation(presentation, clips);
  return {
    ...base,
    excluded_assets: allAssets.length - assets.length,
    target_duration_ms: target,
    total_duration_ms: clips.at(-1)!.timeline_end_ms,
    clips,
    presentation,
  };
}
