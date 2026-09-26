import { it, expect, describe } from "vitest";
import { performance } from "node:perf_hooks";
import {
  buildTimeline,
  recalculateTimeline,
  editTimelineClip,
  photoMotion,
  animationNames,
  transitionNames,
  type TimelineAsset,
} from "@elsatia/studio-domain";
const project = {
  target_duration_seconds: null,
  target_aspect_ratio: "9:16" as const,
};
const images = (n: number): TimelineAsset[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `image-${i}`,
    media_type: "image",
    duration_ms: null,
    upload_status: "ready",
    deleted_at: null,
  }));
const video = (duration: number): TimelineAsset => ({
  id: `video-${duration}`,
  media_type: "video",
  duration_ms: duration,
  upload_status: "ready",
  deleted_at: null,
});
function verify(d: ReturnType<typeof buildTimeline>) {
  let cursor = 0;
  for (const [i, c] of d.clips.entries()) {
    expect(c.sort_order).toBe(i);
    expect(c.timeline_start_ms).toBe(cursor);
    expect(c.timeline_end_ms - c.timeline_start_ms).toBe(c.duration_ms);
    expect(c.transition_duration_ms).toBeLessThanOrEqual(c.duration_ms / 2);
    cursor = c.timeline_end_ms;
  }
  expect(cursor).toBe(d.total_duration_ms);
}
describe("Automatic montage v1", () => {
  for (const n of [1, 10, 100])
    it(`${n} photos automatic`, () => {
      const d = buildTimeline({ project, assets: images(n) });
      expect(d.total_duration_ms).toBe(n * 3000);
      verify(d);
    });
  for (const seconds of [15, 30, 60, 90, 120, 73])
    it(`target ${seconds}s exact`, () => {
      const d = buildTimeline({
        project: { ...project, target_duration_seconds: seconds },
        assets: images(10),
      });
      expect(d.total_duration_ms).toBe(seconds * 1000);
      verify(d);
    });
  it("short video fully used, long video trimmed, no source overrun", () => {
    const assets = [...images(5), video(2000), video(90000)];
    const d = buildTimeline({
      project: { ...project, target_duration_seconds: 60 },
      assets,
    });
    expect(d.total_duration_ms).toBe(60000);
    expect(d.clips[5].source_end_ms).toBe(2000);
    expect(d.clips[6].source_end_ms).toBeLessThan(90000);
    verify(d);
  });
  it("infeasible target clamps with all media preserved", () => {
    expect(
      buildTimeline({
        project: { ...project, target_duration_seconds: 120 },
        assets: images(1),
      }).total_duration_ms,
    ).toBe(15000);
    expect(
      buildTimeline({
        project: { ...project, target_duration_seconds: 15 },
        assets: images(100),
      }).total_duration_ms,
    ).toBe(100000);
  });
  it("identical structure on ten runs and input not mutated", () => {
    const assets = [...images(20), video(2345)];
    const input = { project, assets };
    const before = JSON.stringify(input),
      expected = buildTimeline(input);
    for (let i = 0; i < 10; i++) expect(buildTimeline(input)).toEqual(expected);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("500 mixed media: time and heap bounded", () => {
    const assets = [
        ...images(400),
        ...Array.from({ length: 100 }, () => video(6000)),
      ],
      before = process.memoryUsage().heapUsed,
      start = performance.now();
    const d = buildTimeline({ project, assets });
    const ms = performance.now() - start,
      bytes = process.memoryUsage().heapUsed - before;
    console.log(
      JSON.stringify({ benchmark: "timeline-500", ms, heapDeltaBytes: bytes }),
    );
    expect(ms).toBeLessThan(1000);
    expect(bytes).toBeLessThan(20 * 1024 * 1024);
    expect(d.clips).toHaveLength(500);
    verify(d);
  });
  it("ready only and precise exclusion count", () => {
    const assets = [
      ...images(2),
      { ...video(2000), upload_status: "pending" },
      { ...video(3000), upload_status: "failed" },
    ];
    expect(buildTimeline({ project, assets }).excluded_assets).toBe(2);
    expect(() => buildTimeline({ project, assets: [] })).toThrow(
      "Ajoutez au moins un média",
    );
  });
  it("reorder preserves manual artistic choices", () => {
    const d = buildTimeline({ project, assets: images(3) });
    const edited = editTimelineClip(
      d.clips[0],
      {
        duration_ms: 5000,
        animation_type: "pan_down",
        transition_in: "slide_left",
        transition_duration_ms: 400,
      },
      images(1)[0],
    );
    const clips = recalculateTimeline([d.clips[1], edited, d.clips[2]]);
    expect(clips[1].timeline_start_ms).toBe(3000);
    expect(clips[1].metadata_json).toEqual({ motion: photoMotion("pan_down") });
    expect(clips[1].transition_in).toBe("slide_left");
    expect(clips[2].timeline_start_ms).toBe(8000);
  });
  for (const animation of Object.keys(
    animationNames,
  ) as (keyof typeof animationNames)[])
    it(`explicit ${animation} motion`, () => {
      const c = buildTimeline({ project, assets: images(1) }).clips[0];
      expect(
        editTimelineClip(c, { animation_type: animation }, images(1)[0])
          .metadata_json.motion,
      ).toEqual(photoMotion(animation));
    });
  for (const transition of Object.keys(
    transitionNames,
  ) as (keyof typeof transitionNames)[])
    it(`transition ${transition}`, () => {
      const c = buildTimeline({ project, assets: images(1) }).clips[0];
      const edited = editTimelineClip(
        c,
        { transition_in: transition, transition_duration_ms: 300 },
        images(1)[0],
      );
      expect(edited.transition_duration_ms).toBe(
        transition === "cut" ? 0 : 300,
      );
    });
  for (const patch of [
    { duration_ms: 0 },
    { duration_ms: -1 },
    { duration_ms: NaN },
    { duration_ms: 1.5 },
    { transition_duration_ms: -1 },
    { transition_duration_ms: 2000 },
  ])
    it(`reject bad photo edit ${JSON.stringify(patch)}`, () => {
      const c = buildTimeline({ project, assets: images(1) }).clips[0];
      expect(() => editTimelineClip(c, patch, images(1)[0])).toThrow();
    });
  it("video trims validated", () => {
    const a = video(10000),
      c = buildTimeline({ project, assets: [a] }).clips[0];
    expect(
      editTimelineClip(c, { source_start_ms: 2000, source_end_ms: 6000 }, a)
        .duration_ms,
    ).toBe(4000);
    for (const patch of [
      { source_start_ms: -1 },
      { source_end_ms: 10001 },
      { source_start_ms: 5000, source_end_ms: 4000 },
    ])
      expect(() => editTimelineClip(c, patch, a)).toThrow();
  });
  it("short subsecond video bounds transitions", () => {
    verify(buildTimeline({ project, assets: [video(100)] }));
  });
});

it("one millisecond video uses a cut, never a zero-length effect", () => {
  const d = buildTimeline({ project, assets: [video(1)] });
  expect(d.clips[0].transition_in).toBe("cut");
  expect(d.clips[0].transition_duration_ms).toBe(0);
});
