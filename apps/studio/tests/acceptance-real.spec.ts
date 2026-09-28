/**
 * Real-source render acceptance (see docs/qualification/ELSATIA_STUDIO_REAL_SOURCE_ACCEPTANCE.md).
 * Opt-in: needs ELSATIA_STUDIO_REAL_MEDIA_DIR and STUDIO_ACCEPTANCE=1, and a web server started
 * WITHOUT STUDIO_RENDER_INTERNAL_PREVIEW. The media never leave the developer machine.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { fileInputReady } from "./media-fixtures";
const directory = process.env.ELSATIA_STUDIO_REAL_MEDIA_DIR;
test.skip(
  process.env.STUDIO_ACCEPTANCE !== "1" || !directory,
  "opt-in: set STUDIO_ACCEPTANCE=1 and ELSATIA_STUDIO_REAL_MEDIA_DIR",
);
test.use({ actionTimeout: 30000 });
const password = "Studio-RealSource-Local-611!";
const worker = createRequire(resolve("../../workers/studio-video/package.json"));
const ffmpeg = worker("ffmpeg-static") as string;
const ffprobe = (worker("ffprobe-static") as { path: string }).path;
async function request(page: Page, path: string, data?: unknown) {
  return page.evaluate(
    async ({ path, data }) => {
      const r = await fetch(path, {
        method: data === undefined ? "GET" : "POST",
        headers: data === undefined ? undefined : { "Content-Type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: r.status, body: await r.json() };
    },
    { path, data },
  );
}
async function login(page: Page) {
  const api = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const email = `real-${randomUUID()}@example.test`;
  expect((await api.auth.signUp({ email, password })).error).toBeNull();
  const ws = await api.rpc("studio_create_workspace", { p_name: "Recette sources réelles", p_type: "personal" });
  expect(ws.error).toBeNull();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/dashboard/);
  return ws.data as string;
}
const media = /\.(jpe?g|png|webp|mp4|mov)$/i;
const track = /^music\.(mp3|m4a|wav)$/i;
async function inventory() {
  const names = (await readdir(directory!)).filter((n) => !n.startsWith("."));
  const files = names.filter((n) => media.test(n) && !/^logo\./i.test(n));
  const music = names.find((n) => track.test(n));
  const logo = names.find((n) => /^logo\.(png|jpe?g|webp)$/i.test(n));
  return { files, music, logo };
}
for (const seconds of [60, 90]) {
  test(`sources réelles : ${seconds} s, 9:16, 1080×1920`, async ({ page }) => {
    test.setTimeout(3600000);
    const inv = await inventory();
    expect(inv.files.length, "au moins 3 médias attendus dans le dossier").toBeGreaterThanOrEqual(3);
    const workspace = await login(page);
    const created = await request(page, "/api/projects", {
      workspace,
      project: {
        name: `Sources réelles ${seconds} s`, project_type: "travel", description: "", location_label: "",
        started_at: null, ended_at: null, target_duration_seconds: seconds, target_aspect_ratio: "9:16",
        status: "draft", metadata_json: {},
      },
    });
    expect(created.status).toBe(200);
    const id = created.body.id as string;
    await page.goto(`/projects/${id}`);
    await fileInputReady(page);
    const toSend = [...inv.files, ...(inv.music ? [inv.music] : [])].map((n) => join(directory!, n));
    await page.getByLabel("Choisir des fichiers").setInputFiles(toSend);
    // Failures are a RESULT of the recette (unsupported real files): count them, do not hide them.
    await expect(
      page.locator('.upload-list [data-status="ready"], .upload-list [data-status="failed"]'),
    ).toHaveCount(toSend.length, { timeout: 1800000 });
    const failed = await page.locator('.upload-list [data-status="failed"]').allTextContents();
    await test.info().attach("import-failures.json", { body: JSON.stringify(failed, null, 2), contentType: "application/json" });
    await page.reload();
    const generated = await request(page, `/api/timelines/${id}`, {
      action: "generate",
      template: { templateId: "voyage", templateVersion: 1, title: `Sources réelles ${seconds} s`, outro: "Fin" },
    });
    expect(generated.status).toBe(200);
    await page.goto(`/projects/${id}/editor`);
    if (inv.music) {
      await page.getByLabel("Musique du montage").selectOption({ label: inv.music });
      await expect(page.getByText("Enregistré", { exact: false }).first()).toBeVisible({ timeout: 60000 });
    }
    await page.getByLabel("Qualité de la vidéo").selectOption("standard");
    const started = Date.now();
    await page.getByRole("button", { name: "Créer la vidéo", exact: true }).click();
    const job = page.getByRole("region", { name: "Vidéo exportée" }).locator("[data-render-job]").first();
    await expect(job.getByRole("status")).toContainText("Terminé", { timeout: 3000000 });
    const elapsed = (Date.now() - started) / 1000;
    const list = await request(page, `/api/renders/${id}`);
    const signed = await request(page, `/api/renders/${id}`, { action: "preview", output: list.body.outputs[0].id });
    const bytes = await (await page.request.get(signed.body.url)).body();
    const file = test.info().outputPath(`real-${seconds}.mp4`);
    await writeFile(file, bytes);
    const probe = JSON.parse(
      execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file]).toString(),
    );
    const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === "video");
    const a = probe.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
    expect(probe.format.format_name).toContain("mp4");
    expect(v.codec_name).toBe("h264");
    expect(a.codec_name).toBe("aac");
    expect([v.width, v.height]).toEqual([1080, 1920]);
    expect(v.r_frame_rate).toBe("30/1");
    expect(Math.abs(Number(v.nb_read_frames) - seconds * 30)).toBeLessThanOrEqual(1);
    expect(Math.abs(Number(probe.format.duration) - seconds)).toBeLessThan(0.1);
    const frames: number[] = [];
    for (const [n, t] of [1, seconds / 2, seconds - 1].entries()) {
      const png = test.info().outputPath(`frame-${seconds}-${n}.png`);
      execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", String(t), "-i", file, "-frames:v", "1", png]);
      const raw = execFileSync(ffmpeg, ["-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=8:8,format=gray", "-f", "rawvideo", "pipe:1"]);
      const luma = raw.reduce((s, b) => s + b, 0) / raw.length;
      expect(luma).toBeGreaterThan(5);
      frames.push(luma);
    }
    if (inv.music) {
      const pcm = execFileSync(ffmpeg, ["-v", "error", "-ss", "2", "-t", "3", "-i", file, "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"]);
      let sum = 0;
      for (let i = 0; i < pcm.length; i += 4) sum += pcm.readFloatLE(i) ** 2;
      expect(Math.sqrt(sum / Math.max(1, pcm.length / 4))).toBeGreaterThan(0.005);
    }
    const report = {
      seconds, media: inv.files.length, music: inv.music ?? null, logo: inv.logo ?? null,
      importFailures: failed, renderSeconds: elapsed, outputBytes: (await stat(file)).size,
      ext: extname(file), frames, bitrate: Number(probe.format.bit_rate),
    };
    await test.info().attach("real-source-report.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
  });
}
