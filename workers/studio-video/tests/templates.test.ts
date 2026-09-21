import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  buildTemplateTimeline,
  type StudioProject,
  type StudioMediaAsset,
  type TimelineDocument,
  safeAreas,
} from "../../../packages/studio-domain/src/index.ts";
import { layoutText } from "../src/text-layout.ts";
import { command, renderTimeline } from "../src/render.ts";
const project = {
  name: "Été à Šibenik — Côte d’Azur",
  location_label: "À Strasbourg",
  target_duration_seconds: 8,
  target_aspect_ratio: "9:16",
  project_type: "free",
} as StudioProject;
const asset = {
  id: "10000000-0000-0000-0000-000000000001",
  media_type: "image",
  mime_type: "image/png",
  upload_status: "ready",
  deleted_at: null,
  duration_ms: null,
} as StudioMediaAsset;
const draft = () =>
  buildTemplateTimeline(project, [asset], {
    templateId: "souvenir",
    templateVersion: 1,
    introDuration: 1000,
    outroDuration: 1000,
  });
it("all ratios UTF8, missing glyph detection, long title wraps/shrinks/ellipsis within safe areas", () => {
  const d = draft(),
    p = d.presentation!;
  for (const [ratio, w, h] of [
    ["9:16", 1080, 1920],
    ["16:9", 1920, 1080],
    ["1:1", 1080, 1080],
    ["4:5", 1080, 1350],
  ] as const) {
    for (const position of ["top", "center", "bottom"] as const) {
      const o = {
        ...p.overlays[0],
        position,
        text: "É À ç Strasbourg Côte d’Azur Šibenik — Société européenne de rénovation et aménagement ".repeat(
          5,
        ),
      };
      const l = layoutText(o, p, ratio, w, h);
      expect(l.hasMissingGlyphs).toBe(false);
      expect(l.lines.length).toBeLessThanOrEqual(3);
      expect(l.lines.at(-1)!.text).toContain("…");
      expect(l.x).toBeGreaterThanOrEqual(w * safeAreas[ratio].x);
      expect(l.y).toBeGreaterThanOrEqual(h * safeAreas[ratio].top);
      expect(l.y + l.textHeight).toBeLessThanOrEqual(
        h * (1 - safeAreas[ratio].bottom),
      );
      for (const line of l.lines)
        expect(line.width).toBeLessThanOrEqual(l.maxWidth);
    }
  }
});
it("real card + text rendering, UTF8 never interpreted as filter syntax", async () => {
  const require = createRequire(import.meta.url),
    dir = await mkdtemp(join(tmpdir(), "studio-f-unit-")),
    r = {
      ffmpeg: require("ffmpeg-static") as string,
      ffprobe: (require("ffprobe-static") as { path: string }).path,
      signal: AbortSignal.timeout(120000),
      progress: async () => {},
    };
  try {
    const file = join(dir, "photo.png");
    await command(
      r.ffmpeg,
      ["-y", "-f", "lavfi", "-i", "testsrc2=s=320x240", "-frames:v", "1", file],
      r.signal,
    );
    const t = {
      ...draft(),
      id: "t",
      workspace_id: "w",
      project_id: "p",
      version: 1,
      revision: 1,
      status: "generated",
      created_by: "u",
      created_at: "",
      updated_at: "",
    } as TimelineDocument;
    t.presentation!.overlays[0].text =
      "Été : 'Šibenik' %{evil} [a]; Côte d’Azur";
    const output = await renderTimeline(
      t,
      new Map([[asset.id, file]]),
      { width: 270, height: 480, fps: 30 },
      dir,
      r,
    );
    expect(Number(output.probe.format.duration)).toBeCloseTo(8, 1);
    const images = [0, 1, 2].map((i) => ({
      ...asset,
      id: `10000000-0000-0000-0000-00000000000${i}`,
    }));
    const fractional = {
      ...t,
      ...buildTemplateTimeline(
        { ...project, target_duration_seconds: 7 },
        images,
        {
          templateId: "souvenir",
          templateVersion: 1,
          introDuration: 1000,
          outroDuration: 1000,
        },
      ),
    } as TimelineDocument;
    expect(fractional.clips.some((c) => c.duration_ms % 1000 !== 0)).toBe(true);
    const exact = await renderTimeline(
      fractional,
      new Map(images.map((a) => [a.id, file])),
      { width: 270, height: 480, fps: 30 },
      dir,
      r,
    );
    expect(Number(exact.probe.format.duration)).toBeCloseTo(7, 1);
  } catch (e) {
    if (e && typeof e === "object" && "diagnostic" in e)
      console.error(e.diagnostic);
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 120000);
