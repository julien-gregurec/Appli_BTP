import type { StudioMediaAsset } from "./media";
import { resolveStudioTemplate } from "./templates";
export const ANALYSIS_VERSION = "media-v1";
export const NEAR_DUPLICATE_BITS = 6;
export interface FrameMetrics {
  sharpness: number;
  brightness: number;
  dark_fraction: number;
  bright_fraction: number;
  variance: number;
  dhash: string;
  histogram: number[];
  face_count: number;
  focus: [number, number] | null;
}
export interface AnalysisResult {
  sha256: string;
  width: number;
  height: number;
  duration_ms: number | null;
  quality_score: number;
  sharpness_score: number;
  brightness_score: number;
  resolution_score: number;
  exposure: "very-dark" | "dark" | "normal" | "bright" | "overexposed";
  resolution: "small" | "sufficient" | "high";
  orientation: "vertical" | "horizontal" | "square";
  face_count: number;
  focus: [number, number] | null;
  warnings: string[];
  samples: FrameMetrics[];
  scene_changes: number[];
}
export interface StudioMediaAnalysis {
  id: string;
  workspace_id: string;
  asset_id: string;
  project_id: string;
  analysis_version: string;
  provider: string;
  status: "pending" | "analyzing" | "completed" | "failed" | "skipped";
  result: AnalysisResult | null;
  attempts: number;
  requested_by: string;
  requested_at: string;
  analyzed_at: string | null;
  error_code: string | null;
  elapsed_ms: number;
  provider_calls: number;
  fallback: boolean;
}
export interface AnalysisSource {
  frames: string[];
  width: number;
  height: number;
  duration_ms: number | null;
  sha256: string;
}
/** Providers live in workers, never in React. No identity, biometric embedding or GPS contract. */
export interface StudioAIProvider {
  readonly id: string;
  analyzeImage(
    source: AnalysisSource,
    signal: AbortSignal,
  ): Promise<FrameMetrics[]>;
  analyzeVideo(
    source: AnalysisSource,
    signal: AbortSignal,
  ): Promise<FrameMetrics[]>;
}
export const analysisEnabled = (value: string | undefined) =>
  value === "1" || value === "true";
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const mean = (values: number[]) =>
  values.reduce((s, n) => s + n, 0) / values.length;
export function histogramDistance(a: number[], b: number[]) {
  return a.length === b.length
    ? a.reduce((s, n, i) => s + Math.abs(n - b[i]), 0) / 6
    : 1;
}
export function hamming(a: string, b: string) {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64;
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`),
    bits = 0;
  while (value) {
    bits++;
    value &= value - BigInt(1);
  }
  return bits;
}
export function scoreAnalysis(
  source: AnalysisSource,
  samples: FrameMetrics[],
): AnalysisResult {
  if (
    !samples.length ||
    samples.length > 5 ||
    source.width <= 0 ||
    source.height <= 0
  )
    throw Error("Analyse invalide");
  const sharpness = mean(samples.map((s) => s.sharpness));
  const brightness = mean(samples.map((s) => s.brightness));
  const bright = mean(samples.map((s) => s.bright_fraction)),
    dark = mean(samples.map((s) => s.dark_fraction));
  const sharpness_score = clamp((100 * Math.log1p(sharpness)) / Math.log(501));
  const brightness_score = clamp(
    100 - Math.abs(brightness - 128) / 1.28 - 40 * Math.max(dark, bright),
  );
  const short = Math.min(source.width, source.height),
    long = Math.max(source.width, source.height);
  const resolution_score = clamp(100 * Math.min(short / 1080, long / 1920));
  const ratio_score = clamp(100 * Math.min(1, (3 * short) / long));
  const exposure =
    brightness < 35 || dark > 0.8
      ? "very-dark"
      : brightness < 75
        ? "dark"
        : brightness > 225 || bright > 0.8
          ? "overexposed"
          : brightness > 185
            ? "bright"
            : "normal";
  const warnings = [
    sharpness < 60 ? "Flou possible (y compris artistique)" : "",
    exposure === "very-dark" || exposure === "dark"
      ? "Sombre"
      : exposure === "overexposed"
        ? "Surexposé"
        : "",
    resolution_score < 100 ? "Résolution limitée pour 1080p" : "",
    (source.duration_ms ?? 0) > 30000 ? "À raccourcir" : "",
  ].filter(Boolean);
  const face = samples.reduce((a, b) => (b.face_count > a.face_count ? b : a));
  return {
    sha256: source.sha256,
    width: source.width,
    height: source.height,
    duration_ms: source.duration_ms,
    quality_score: Math.round(
      0.4 * sharpness_score +
        0.35 * brightness_score +
        0.2 * resolution_score +
        0.05 * ratio_score,
    ),
    sharpness_score: Math.round(sharpness_score),
    brightness_score: Math.round(brightness_score),
    resolution_score: Math.round(resolution_score),
    exposure,
    resolution:
      short >= 2160 && long >= 3840
        ? "high"
        : resolution_score >= 100
          ? "sufficient"
          : "small",
    orientation:
      source.width === source.height
        ? "square"
        : source.width > source.height
          ? "horizontal"
          : "vertical",
    face_count: face.face_count,
    focus: face.focus,
    warnings,
    samples,
    scene_changes: samples.flatMap((s, i) =>
      i && histogramDistance(s.histogram, samples[i - 1].histogram) > 0.25
        ? [i]
        : [],
    ),
  };
}
export async function analyzeWithFallback(
  local: StudioAIProvider,
  external: StudioAIProvider | undefined,
  source: AnalysisSource,
  signal: AbortSignal,
) {
  const method = source.duration_ms === null ? "analyzeImage" : "analyzeVideo";
  // Local measurements are always authoritative, including when a future provider fails.
  let fallback = false;
  if (external) {
    try {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
      let remove = () => {};
      try {
        await Promise.race([
          external[method](source, deadline),
          new Promise<never>((_, reject) => {
            const abort = () => reject(Error("PROVIDER_TIMEOUT"));
            if (deadline.aborted) abort();
            else deadline.addEventListener("abort", abort, { once: true });
            remove = () => deadline.removeEventListener("abort", abort);
          }),
        ]);
      } finally {
        remove();
      }
    } catch {
      fallback = true;
    }
  }
  signal.throwIfAborted();
  return {
    result: scoreAnalysis(source, await local[method](source, signal)),
    provider: local.id,
    fallback,
  };
}
export function isNearDuplicate(a: AnalysisResult, b: AnalysisResult) {
  const x = a.samples[0],
    y = b.samples[0];
  return (
    !!x &&
    !!y &&
    x.variance >= 25 &&
    y.variance >= 25 &&
    Math.abs(a.width / a.height - b.width / b.height) <= 0.1 &&
    hamming(x.dhash, y.dhash) <= NEAR_DUPLICATE_BITS &&
    histogramDistance(x.histogram, y.histogram) <= 0.12
  );
}
export interface RankedAsset {
  asset: StudioMediaAsset;
  analysis: StudioMediaAnalysis | null;
  quality_score: number;
  uniqueness_score: number;
  relevance_score: null;
  recommendation_score: number;
  duplicate_group_id: string | null;
  scene_group_id: string;
  recommendation: string;
}
export function rankProjectAssets(
  assets: StudioMediaAsset[],
  analyses: StudioMediaAnalysis[],
): RankedAsset[] {
  const byId = new Map(
    analyses
      .filter(
        (a) =>
          a.status === "completed" && a.analysis_version === ANALYSIS_VERSION,
      )
      .map((a) => [a.asset_id, a]),
  );
  const sorted = assets
    .filter((a) => a.upload_status === "ready" && !a.deleted_at)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const groups: RankedAsset[][] = [],
    rows: RankedAsset[] = [];
  for (const asset of sorted) {
    const analysis = byId.get(asset.id) ?? null,
      result = analysis?.result;
    const group =
      result &&
      groups.find((g) => {
        const other = g[0].analysis?.result;
        return (
          other &&
          (result.sha256 === other.sha256 ||
            (asset.media_type === "image" &&
              g[0].asset.media_type === "image" &&
              isNearDuplicate(result, other)))
        );
      });
    const time = asset.captured_at ? Date.parse(asset.captured_at) : NaN;
    const scene = rows.find(
      (r) =>
        result &&
        r.analysis?.result &&
        Number.isFinite(time) &&
        r.asset.captured_at &&
        Math.abs(time - Date.parse(r.asset.captured_at)) <= 30 * 60000 &&
        histogramDistance(
          result.samples[0].histogram,
          r.analysis.result.samples[0].histogram,
        ) <= 0.2,
    );
    const row: RankedAsset = {
      asset,
      analysis,
      quality_score: result?.quality_score ?? 40,
      uniqueness_score: 100,
      relevance_score: null,
      recommendation_score: 0,
      duplicate_group_id: null,
      scene_group_id: scene?.scene_group_id ?? asset.id,
      recommendation: "Correct",
    };
    rows.push(row);
    if (group) group.push(row);
    else groups.push([row]);
  }
  for (const group of groups) {
    group.sort(
      (a, b) =>
        b.quality_score - a.quality_score ||
        a.asset.id.localeCompare(b.asset.id),
    );
    for (const [i, row] of group.entries()) {
      row.duplicate_group_id =
        group.length > 1 ? group.map((r) => r.asset.id).sort()[0] : null;
      row.uniqueness_score = i ? 15 : 100;
      row.recommendation_score = Math.round(
        0.75 * row.quality_score + 0.25 * row.uniqueness_score,
      );
      row.recommendation = i
        ? "Doublon possible"
        : row.quality_score < 40
          ? "Faible qualité"
          : row.quality_score >= 85
            ? "Excellent"
            : row.quality_score >= 65
              ? "Recommandé"
              : "Correct";
    }
  }
  return rows.sort(
    (a, b) =>
      b.recommendation_score - a.recommendation_score ||
      a.asset.id.localeCompare(b.asset.id),
  );
}
export function recommendAssetOrder(
  rows: RankedAsset[],
  manual?: string[],
): string[] {
  if (manual) {
    const ids = new Set(rows.map((r) => r.asset.id));
    return [
      ...manual.filter((id) => ids.has(id)),
      ...rows.map((r) => r.asset.id).filter((id) => !manual.includes(id)),
    ];
  }
  return rows
    .slice()
    .sort((a, b) => {
      const ta = a.asset.captured_at
          ? Date.parse(a.asset.captured_at)
          : Infinity,
        tb = b.asset.captured_at ? Date.parse(b.asset.captured_at) : Infinity;
      return (
        ta - tb ||
        (a.asset.sort_order ?? 0) - (b.asset.sort_order ?? 0) ||
        a.asset.id.localeCompare(b.asset.id)
      );
    })
    .map((r) => r.asset.id);
}
export function selectAssetsForTargetDuration(
  rows: RankedAsset[],
  seconds: number,
  templateId = "chantier-pro",
) {
  const template = resolveStudioTemplate(templateId);
  const timing = template.timingRules;
  const budget = Math.max(
    1,
    Math.floor(
      (seconds * 1000 - timing.introDuration - timing.outroDuration) /
        Math.max(1000, timing.photoPreferredDuration),
    ),
  );
  const chosen: RankedAsset[] = [],
    groups = new Set<string>(),
    scenes = new Map<string, number>();
  let remaining = rows.slice();
  while (chosen.length < budget && remaining.length) {
    remaining.sort(
      (a, b) =>
        b.recommendation_score -
          12 * (scenes.get(b.scene_group_id) ?? 0) -
          (a.recommendation_score - 12 * (scenes.get(a.scene_group_id) ?? 0)) ||
        a.asset.id.localeCompare(b.asset.id),
    );
    const next = remaining.shift()!;
    if (next.duplicate_group_id && groups.has(next.duplicate_group_id))
      continue;
    chosen.push(next);
    if (next.duplicate_group_id) groups.add(next.duplicate_group_id);
    scenes.set(next.scene_group_id, (scenes.get(next.scene_group_id) ?? 0) + 1);
  }
  return recommendAssetOrder(chosen);
}
