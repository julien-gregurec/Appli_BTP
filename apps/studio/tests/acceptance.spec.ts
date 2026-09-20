/**
 * Acceptance scenarios of the Studio V1 test plan, at the exact sizes and at 1080 quality.
 * Opt-in (STUDIO_ACCEPTANCE=1, web server started WITHOUT STUDIO_RENDER_INTERNAL_PREVIEW):
 * the e2e gate renders 540x960 previews and never runs this file.
 * Sources are tiny synthetic media: this proves the pipeline and container contract at
 * full output size, not decoder behaviour on real phone footage.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fixtures, fileInputReady } from "./media-fixtures";
test.use({ actionTimeout: 30000 });
const password = "Studio-Acceptance-Local-398!";
const worker = createRequire(resolve("../../workers/studio-video/package.json"));
const ffmpeg = worker("ffmpeg-static") as string;
const ffprobe = (worker("ffprobe-static") as { path: string }).path;
async function user(page: Page) {
  const api = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const email = `acceptance-${randomUUID()}@example.test`;
  expect((await api.auth.signUp({ email, password })).error).toBeNull();
  const workspace = await api.rpc("studio_create_workspace", {
    p_name: "Studio personnel",
    p_type: "personal",
  });
  expect(workspace.error).toBeNull();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/dashboard/);
  return { workspace: workspace.data as string };
}
async function request(page: Page, path: string, data?: unknown) {
  return page.evaluate(
    async ({ path, data }) => {
      const r = await fetch(path, {
        method: data === undefined ? "GET" : "POST",
        headers:
          data === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, data },
  );
}
let sample: Awaited<ReturnType<typeof fixtures>>;
test.beforeAll(async ({ browser }) => {
  sample = await fixtures(browser);
});
test.afterAll(async () => {
  if (sample) await rm(sample.directory, { recursive: true, force: true });
});
async function scenario(
  page: Page,
  o: {
    name: string;
    type: "construction" | "travel";
    style: string;
    photos: number;
    videos: number;
    seconds: number;
    template: Record<string, unknown>;
    /** Imported music track (synthetic sine): longer than the video is cut, shorter is looped. */
    musicSeconds?: number;
  },
) {
  const a = await user(page);
  const created = await request(page, "/api/projects", {
    workspace: a.workspace,
    project: {
      name: o.name,
      project_type: o.type,
      description: "",
      location_label: "",
      started_at: null,
      ended_at: null,
      target_duration_seconds: o.seconds,
      target_aspect_ratio: "9:16",
      status: "draft",
      metadata_json: {},
    },
  });
  expect(created.status).toBe(200);
  const id = created.body.id as string;
  await page.goto(`/projects/${id}`);
  const files = [];
  for (let i = 0; i < o.photos; i++) {
    const n = i % 5;
    files.push({
      name: `photo-${String(i).padStart(2, "0")}.${n % 2 ? "png" : "jpg"}`,
      mimeType: n % 2 ? "image/png" : "image/jpeg",
      buffer: await readFile(join(sample.directory, `photo-${n}.${n % 2 ? "png" : "jpg"}`)),
    });
  }
  for (let i = 0; i < o.videos; i++)
    files.push({ name: `video-${i}.mp4`, mimeType: "video/mp4", buffer: sample.mp4 });
  let trackName = "";
  if (o.musicSeconds) {
    trackName = `musique-${o.musicSeconds}s.mp3`;
    const track = join(sample.directory, trackName);
    execFileSync(ffmpeg, ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=330:duration=${o.musicSeconds}`, track]);
    files.push({ name: trackName, mimeType: "audio/mpeg", buffer: await readFile(track) });
  }
  const uploads = o.photos + o.videos + (o.musicSeconds ? 1 : 0);
  await fileInputReady(page);
  await page.getByLabel("Choisir des fichiers").setInputFiles(files);
  await expect(page.locator('.upload-list [data-status="ready"]')).toHaveCount(
    uploads,
    { timeout: 600000 },
  );
  await page.reload();
  const order = await request(page, `/api/projects/${id}/order`);
  const ids = order.body.assets.map((x: { id: string }) => x.id);
  expect(ids).toHaveLength(uploads);
  const generated = await request(page, `/api/timelines/${id}`, {
    action: "generate",
    template: { templateId: o.style, templateVersion: 1, ...o.template },
  });
  expect(generated.status).toBe(200);
  const doc = (await request(page, `/api/timelines/${id}`)).body.active;
  expect(doc.total_duration_ms).toBe(o.seconds * 1000);
  await page.goto(`/projects/${id}/editor`);
  if (trackName) {
    await page.getByLabel("Musique du montage").selectOption({ label: trackName });
    await expect(page.getByText("Enregistré", { exact: false }).first()).toBeVisible({ timeout: 60000 });
  }
  await page.getByLabel("Qualité de la vidéo").selectOption("standard");
  await page.getByRole("button", { name: "Créer la vidéo", exact: true }).click();
  const panel = page.getByRole("region", { name: "Vidéo exportée" });
  const job = panel.locator("[data-render-job]").first();
  await expect(job.getByRole("status")).toContainText("Terminé", {
    timeout: 1500000,
  });
  await expect(job).toContainText("Vidéo finale 1080×1920");
  const list = await request(page, `/api/renders/${id}`);
  const output = list.body.outputs[0];
  const signed = await request(page, `/api/renders/${id}`, {
    action: "preview",
    output: output.id,
  });
  const bytes = await (await page.request.get(signed.body.url)).body();
  const file = test.info().outputPath(`${o.style}-1080.mp4`);
  await writeFile(file, bytes);
  const probe = JSON.parse(
    execFileSync(ffprobe, [
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]).toString(),
  );
  const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === "video");
  const au = probe.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
  expect(probe.format.format_name).toContain("mp4");
  expect(v.codec_name).toBe("h264");
  expect(au.codec_name).toBe("aac");
  expect([v.width, v.height]).toEqual([1080, 1920]);
  expect(v.r_frame_rate).toBe("30/1");
  expect(Math.abs(Number(v.nb_read_frames) - o.seconds * 30)).toBeLessThanOrEqual(1);
  expect(Math.abs(Number(probe.format.duration) - o.seconds)).toBeLessThan(0.1);
  // Decoded frames at the start, middle and end: non-black, distinct from each other.
  const luma = (t: number) => {
    const raw = execFileSync(ffmpeg, [
      "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1",
      "-vf", "scale=8:8,format=gray", "-f", "rawvideo", "pipe:1",
    ]);
    return raw.reduce((n, b) => n + b, 0) / raw.length;
  };
  const samples = [1, o.seconds / 2, o.seconds - 1].map(luma);
  for (const value of samples) expect(value).toBeGreaterThan(5);
  if (trackName) {
    // Audible music at the start, in the middle and just before the end (cut for a longer track, looped for a shorter one).
    const rms = (t: number) => {
      const pcm = execFileSync(ffmpeg, ["-v", "error", "-ss", String(t), "-t", "1", "-i", file, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"]);
      let sum = 0;
      for (let i = 0; i < pcm.length; i += 4) sum += pcm.readFloatLE(i) ** 2;
      return Math.sqrt(sum / Math.max(1, pcm.length / 4));
    };
    for (const t of [1, o.seconds / 2, o.seconds - 3]) expect(rms(t)).toBeGreaterThan(0.01);
  }
  return { id, ids, size: bytes.length, samples };
}
test.describe("acceptation V1", () => {
  test.skip(process.env.STUDIO_ACCEPTANCE !== "1", "opt-in acceptance run");
  test("Chantier Strasbourg : 10 photos + 3 vidéos, Chantier Pro, 9:16, 60 s, 1080×1920, 1 800 images", async ({ page }) => {
    test.setTimeout(3000000);
    const r = await scenario(page, {
      name: "Chantier Strasbourg",
      type: "construction",
      style: "chantier-pro",
      photos: 10,
      videos: 3,
      seconds: 60,
      template: { title: "Chantier Strasbourg", outro: "Merci", company: "Dupont Bâtiment", phone: "+33 3 88 00 00 00" },
      musicSeconds: 120,
    });
    expect(r.size).toBeGreaterThan(1000);
  });
  test("Vacances Croatie 2026 : 20 photos + 5 vidéos, Voyage, 9:16, 90 s, 1080×1920, 2 700 images", async ({ page }) => {
    test.setTimeout(3600000);
    const r = await scenario(page, {
      name: "Vacances Croatie 2026",
      type: "travel",
      style: "voyage",
      photos: 20,
      videos: 5,
      seconds: 90,
      template: { title: "Vacances Croatie 2026", outro: "À bientôt" },
      musicSeconds: 25,
    });
    expect(r.size).toBeGreaterThan(1000);
  });
});
