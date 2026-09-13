import { createRequire } from "node:module";
import { mkdir, writeFile, rm, copyFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildTemplateTimeline,
  listStudioTemplates,
  type StudioProject,
  type StudioMediaAsset,
  type TimelineDocument,
} from "../../../packages/studio-domain/src/index.ts";
import { renderTimeline, command, renderMetrics } from "../src/render.ts";
const require = createRequire(import.meta.url),
  root =
    process.env.STUDIO_RENDER_EVIDENCE ?? "/tmp/elsatia-studio-lot-f/renders";
await mkdir(root, { recursive: true });
const r = {
  ffmpeg: require("ffmpeg-static") as string,
  ffprobe: (require("ffprobe-static") as { path: string }).path,
  signal: AbortSignal.timeout(3600000),
  progress: async () => {},
};
const image = join(root, "fixture.png"),
  video = join(root, "fixture.mp4");
await command(
  r.ffmpeg,
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x4b8994:s=640x480",
    "-vf",
    "drawbox=x=0:y=300:w=640:h=180:color=0x214544:t=fill,drawbox=x=70:y=160:w=160:h=180:color=0xf4d9b1:t=fill,drawbox=x=240:y=210:w=100:h=130:color=0xdf8a60:t=fill,drawbox=x=420:y=50:w=80:h=80:color=0xffdd88:t=fill",
    "-frames:v",
    "1",
    image,
  ],
  r.signal,
);
await command(
  r.ffmpeg,
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=640x360:r=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "15",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    video,
  ],
  r.signal,
);
const previews = process.argv.includes("--previews");
const cases = previews
  ? listStudioTemplates().map((t) => ({
      id: t.id,
      photos: 3,
      videos: 0,
      seconds: 9,
      ratio: "16:9" as const,
      width: 480,
      height: 270,
    }))
  : [
      {
        id: "chantier-pro",
        photos: 5,
        videos: 2,
        seconds: 60,
        ratio: "9:16" as const,
        width: 1080,
        height: 1920,
      },
      {
        id: "chantier-dynamique",
        photos: 5,
        videos: 2,
        seconds: 15,
        ratio: "9:16" as const,
        width: 540,
        height: 960,
      },
      {
        id: "avant-apres",
        photos: 6,
        videos: 0,
        seconds: 30,
        ratio: "9:16" as const,
        width: 1080,
        height: 1920,
      },
      {
        id: "voyage",
        photos: 20,
        videos: 5,
        seconds: 90,
        ratio: "9:16" as const,
        width: 540,
        height: 960,
      },
      {
        id: "cinematique",
        photos: 5,
        videos: 2,
        seconds: 60,
        ratio: "9:16" as const,
        width: 1080,
        height: 1920,
      },
      {
        id: "souvenir",
        photos: 5,
        videos: 0,
        seconds: 15,
        ratio: "9:16" as const,
        width: 540,
        height: 960,
      },
      ...(["16:9", "1:1", "4:5"] as const).map((ratio) => ({
        id: "chantier-pro",
        photos: 1,
        videos: 1,
        seconds: 10,
        ratio,
        width: ratio === "16:9" ? 1920 : 1080,
        height: ratio === "4:5" ? 1350 : 1080,
      })),
    ];
const results = [];
for (const c of cases) {
  const name = `${c.id}-${c.ratio.replace(":", "x")}`,
    dir = join(root, name);
  await mkdir(dir, { recursive: true });
  const assets = Array.from({ length: c.photos + c.videos }, (_, i) => ({
    id: `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    media_type: i < c.photos ? "image" : "video",
    mime_type: i < c.photos ? "image/png" : "video/mp4",
    duration_ms: i < c.photos ? null : 15000,
    upload_status: "ready",
    deleted_at: null,
    captured_at: `2026-08-${String(28 - i).padStart(2, "0")}T12:00:00Z`,
  })) as StudioMediaAsset[];
  const project = {
    name:
      c.id === "voyage"
        ? "Vacances Croatie 2026"
        : c.id === "souvenir"
          ? "Les 30 ans de Léa"
          : "Chantier Strasbourg",
    project_type: c.id === "souvenir" ? "birthday" : "construction",
    location_label: "É À ç — Šibenik · Côte d’Azur",
    started_at: "2026-08-01",
    target_duration_seconds: c.seconds,
    target_aspect_ratio: c.ratio,
  } as StudioProject;
  const t = buildTemplateTimeline(project, assets, {
    templateId: c.id,
    templateVersion: 1,
    beforeIds: assets.slice(0, Math.floor(assets.length / 2)).map((a) => a.id),
    afterIds: assets.slice(Math.floor(assets.length / 2)).map((a) => a.id),
    chapters:
      c.id === "voyage"
        ? [
            { assetId: assets[0].id, title: "Šibenik" },
            {
              assetId: assets[Math.min(10, assets.length - 1)].id,
              title: "Dubrovnik",
            },
          ]
        : [],
    ...(previews ? { introDuration: 1000, outroDuration: 1000 } : {}),
    ...(c.id === "chantier-pro"
      ? {
          logoAssetId: assets[0].id,
          company:
            "Entreprise européenne de rénovation et aménagement de Strasbourg",
          website: "elsatia.example",
          phone: "+33 1 23 45 67 89",
        }
      : {}),
  });
  const doc = {
    ...t,
    id: "t",
    project_id: "p",
    workspace_id: "w",
    version: 1,
    revision: 1,
    status: "generated",
    created_by: "u",
    created_at: "",
    updated_at: "",
  } as TimelineDocument;
  await writeFile(join(dir, "timeline.json"), JSON.stringify(doc, null, 2));
  const start = performance.now();
  renderMetrics.peakChildRssBytes = 0;
  try {
    const result = await renderTimeline(
      doc,
      new Map(
        assets.map((a) => [a.id, a.media_type === "image" ? image : video]),
      ),
      { width: c.width, height: c.height, fps: 30 },
      dir,
      r,
    );
    for (const [label, seconds] of [
      ["intro", t.clips[0].duration_ms / 2000],
      ["middle", t.total_duration_ms / 2000],
      ["outro", (t.total_duration_ms - t.clips.at(-1)!.duration_ms / 2) / 1000],
    ] as const)
      await command(
        r.ffmpeg,
        [
          "-y",
          "-ss",
          String(seconds),
          "-i",
          result.output,
          "-frames:v",
          "1",
          join(dir, `${label}.png`),
        ],
        r.signal,
      );
    const body = t.clips.filter((c) => c.clip_type !== "card"),
      row = {
        name,
        seconds: c.seconds,
        renderSeconds: (performance.now() - start) / 1000,
        width: c.width,
        height: c.height,
        peakRss: renderMetrics.peakChildRssBytes,
        meanClipMs: body.reduce((n, c) => n + c.duration_ms, 0) / body.length,
        clips: body.length,
        transitions: [...new Set(body.map((c) => c.transition_in))],
        animations: [...new Set(body.map((c) => c.animation_type))],
        intro: t.clips[0].duration_ms,
        outro: t.clips.at(-1)!.duration_ms,
        overlays: t.presentation!.overlays.length,
        output: result.output,
      };
    results.push(row);
    console.log(JSON.stringify(row));
    if (previews) {
      const pub = resolve("../../apps/studio/public/template-previews");
      await mkdir(pub, { recursive: true });
      await command(
        r.ffmpeg,
        [
          "-y",
          "-i",
          result.output,
          "-an",
          "-c:v",
          "libx264",
          "-crf",
          "28",
          "-movflags",
          "+faststart",
          join(pub, `${c.id}-v1.mp4`),
        ],
        r.signal,
      );
      await copyFile(join(dir, "intro.png"), join(pub, `${c.id}-v1.png`));
    }
    for (const f of await readdir(dir))
      if (/^(clip-|segment-|last-|text-|concat)/.test(f))
        await rm(join(dir, f));
    await writeFile(
      join(root, previews ? "previews.json" : "qualification.json"),
      JSON.stringify(results, null, 2),
    );
  } catch (e) {
    console.error(e);
    if (e && typeof e === "object" && "diagnostic" in e)
      console.error(e.diagnostic);
    throw e;
  }
}
