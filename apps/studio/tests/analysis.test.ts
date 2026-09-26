import { it, expect, vi, afterEach } from "vitest";
import {
  scoreAnalysis,
  rankProjectAssets,
  selectAssetsForTargetDuration,
  recommendAssetOrder,
  hamming,
  isNearDuplicate,
  analyzeWithFallback,
  analysisEnabled,
  ANALYSIS_VERSION,
  type StudioMediaAsset,
  type StudioMediaAnalysis,
  type FrameMetrics,
  type StudioAIProvider,
} from "@elsatia/studio-domain";
const frame: FrameMetrics = {
  sharpness: 500,
  brightness: 128,
  dark_fraction: 0,
  bright_fraction: 0,
  variance: 100,
  dhash: "a2f003feb4779851",
  histogram: Array.from({ length: 24 }, (_, i) => (i % 8 === 0 ? 1 : 0)),
  face_count: 0,
  focus: null,
};
function asset(i: number): StudioMediaAsset {
  return {
    id: `55000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    workspace_id: "workspace",
    project_id: "project",
    uploaded_by: "user",
    request_id: String(i),
    storage_provider: "supabase",
    storage_bucket: "studio-originals",
    storage_key: String(i),
    original_filename: `photo-${i}.jpg`,
    mime_type: "image/jpeg",
    media_type: "image",
    file_size_bytes: 100,
    width: 1920,
    height: 1080,
    duration_ms: null,
    orientation: "horizontal",
    captured_at: new Date(Date.UTC(2026, 8, 13) + i * 3600000).toISOString(),
    metadata_json: {},
    upload_status: "ready",
    created_at: "",
    updated_at: "",
    deleted_at: null,
    purged_at: null,
    upload_expires_at: "",
    purge_after: "",
    sort_order: i,
  };
}
function analysis(a: StudioMediaAsset, i: number): StudioMediaAnalysis {
  const sample = {
    ...frame,
    dhash: (
      (BigInt(i + 1) * BigInt("11400714819323198485")) %
      BigInt("18446744073709551616")
    )
      .toString(16)
      .padStart(16, "0"),
  };
  return {
    id: String(i),
    workspace_id: a.workspace_id,
    asset_id: a.id,
    project_id: a.project_id,
    analysis_version: ANALYSIS_VERSION,
    provider: "local-opencv",
    status: "completed",
    result: {
      ...scoreAnalysis(
        {
          frames: [],
          width: 1920,
          height: 1080,
          duration_ms: null,
          sha256: i.toString(16).padStart(64, "0"),
        },
        [sample],
      ),
      quality_score: i % 5 === 0 ? 20 : 90,
    },
    attempts: 1,
    requested_by: "user",
    requested_at: "",
    analyzed_at: "",
    error_code: null,
    elapsed_ms: 10,
    provider_calls: 0,
    fallback: false,
  };
}
it("quality formula rewards sharpness and normal exposure and warns without excluding", () => {
  const source = {
    frames: [],
    width: 1920,
    height: 1080,
    duration_ms: null,
    sha256: "a".repeat(64),
  };
  const good = scoreAnalysis(source, [frame]);
  expect(good.quality_score).toBe(100);
  expect(
    scoreAnalysis(source, [{ ...frame, sharpness: 1 }]).quality_score,
  ).toBeLessThan(good.quality_score);
  expect(
    scoreAnalysis(source, [{ ...frame, brightness: 10, dark_fraction: 1 }])
      .exposure,
  ).toBe("very-dark");
  expect(
    scoreAnalysis({ ...source, width: 300, height: 200 }, [frame]).resolution,
  ).toBe("small");
  expect(
    scoreAnalysis({ ...source, duration_ms: 60000 }, [frame]).warnings,
  ).toContain("À raccourcir");
});
it("64 bit distance and low-texture guard avoid uniform false positives", () => {
  expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
  const result = analysis(asset(1), 1).result!;
  expect(
    isNearDuplicate(
      { ...result, samples: [{ ...frame, variance: 0 }] },
      { ...result, samples: [{ ...frame, variance: 0 }] },
    ),
  ).toBe(false);
});
it("100 assets / 60 seconds reduce the set, retain quality and avoid repeated duplicate groups", () => {
  const assets = Array.from({ length: 100 }, (_, i) => asset(i));
  const rows = assets.map(analysis);
  for (let i = 1; i < 10; i++)
    rows[i].result = { ...rows[0].result!, quality_score: i === 1 ? 95 : 10 };
  const ranked = rankProjectAssets(assets, rows),
    ids = selectAssetsForTargetDuration(ranked, 60, "voyage");
  expect(ids.length).toBeGreaterThan(3);
  expect(ids.length).toBeLessThan(30);
  expect(ids).toContain(assets[1].id);
  expect(ids).not.toContain(assets[0].id);
  const chosen = ranked.filter((r) => ids.includes(r.asset.id));
  expect(chosen.every((r) => r.quality_score >= 90)).toBe(true);
  expect(
    new Set(chosen.map((r) => r.duplicate_group_id ?? r.asset.id)).size,
  ).toBe(chosen.length);
  expect(new Set(chosen.map((r) => r.scene_group_id)).size).toBeGreaterThan(3);
});
it("ranking selection and chronology are deterministic ×10, manual order remains explicit", () => {
  const assets = Array.from({ length: 100 }, (_, i) => asset(i)),
    analyses = assets.map(analysis);
  const expected = rankProjectAssets(assets, analyses);
  for (let n = 0; n < 10; n++) {
    expect(
      rankProjectAssets([...assets].reverse(), [...analyses].reverse()),
    ).toEqual(expected);
    expect(selectAssetsForTargetDuration(expected, 60)).toEqual(
      selectAssetsForTargetDuration(rankProjectAssets(assets, analyses), 60),
    );
  }
  const manual = assets.map((a) => a.id).reverse();
  expect(recommendAssetOrder(expected, manual)).toEqual(manual);
  expect(recommendAssetOrder(expected)).toEqual(assets.map((a) => a.id));
});
it("missing or old analysis never blocks a selection and flags parse explicitly", () => {
  const a = asset(1),
    old = analysis(a, 1);
  old.analysis_version = "media-v0";
  expect(rankProjectAssets([a], [old])[0].analysis).toBeNull();
  expect(selectAssetsForTargetDuration(rankProjectAssets([a], []), 60)).toEqual(
    [a.id],
  );
  expect(analysisEnabled(undefined)).toBe(false);
  expect(analysisEnabled("0")).toBe(false);
  expect(analysisEnabled("1")).toBe(true);
});
afterEach(() => vi.useRealTimers());
it("provider failure falls back to real local measurements, with no altered score", async () => {
  const local: StudioAIProvider = {
      id: "local",
      analyzeImage: async () => [frame],
      analyzeVideo: async () => [frame],
    },
    external: StudioAIProvider = {
      id: "external",
      analyzeImage: async () => {
        throw Error("offline");
      },
      analyzeVideo: async () => {
        throw Error("offline");
      },
    };
  const result = await analyzeWithFallback(
    local,
    external,
    {
      frames: [],
      width: 1920,
      height: 1080,
      duration_ms: null,
      sha256: "a".repeat(64),
    },
    new AbortController().signal,
  );
  expect(result.fallback).toBe(true);
  expect(result.provider).toBe("local");
  expect(result.result.quality_score).toBe(100);
});
it("an external provider ignoring cancellation cannot hang fallback", async () => {
  const local: StudioAIProvider = {
      id: "local",
      analyzeImage: async () => [frame],
      analyzeVideo: async () => [frame],
    },
    external: StudioAIProvider = {
      id: "external",
      analyzeImage: () => new Promise(() => {}),
      analyzeVideo: () => new Promise(() => {}),
    };
  const start = Date.now();
  const result = await analyzeWithFallback(
    local,
    external,
    {
      frames: [],
      width: 1920,
      height: 1080,
      duration_ms: null,
      sha256: "a".repeat(64),
    },
    new AbortController().signal,
  );
  expect(result.fallback).toBe(true);
  expect(Date.now() - start).toBeLessThan(4500);
}, 5000);
