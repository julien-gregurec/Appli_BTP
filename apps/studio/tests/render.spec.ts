import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile, rm, mkdir, utimes, access } from "node:fs/promises";
import { join } from "node:path";
import { fixtures } from "./media-fixtures";
const password = "Studio-Montage-Local-398!";
async function user(page: Page) {
  const api = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const email = `montage-${randomUUID()}@example.test`;
  const signup = await api.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
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
  return { api, id: signup.data.user!.id, workspace: workspace.data as string };
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
async function create(
  page: Page,
  workspace: string,
  name: string,
  type: string,
  seconds: number,
) {
  const r = await request(page, "/api/projects", {
    workspace,
    project: {
      name,
      project_type: type,
      description: "",
      location_label: "",
      started_at: null,
      ended_at: null,
      target_duration_seconds: seconds,
      target_aspect_ratio: "9:16",
      status: "draft",
      metadata_json: {},
    },
  });
  expect(r.status).toBe(200);
  await page.goto(`/projects/${r.body.id}`);
  return r.body.id as string;
}
async function upload(page: Page, photos: number, videos: number) {
  const files = [];
  for (let i = 0; i < photos; i++)
    files.push({
      name: `photo-${String(i).padStart(2, "0")}.jpg`,
      mimeType: "image/jpeg",
      buffer: await readFile(join(sample.directory, "photo-0.jpg")),
    });
  for (let i = 0; i < videos; i++)
    files.push({
      name: `video-${i}.mp4`,
      mimeType: "video/mp4",
      buffer: sample.mp4,
    });
  await page.getByLabel("Choisir des fichiers").setInputFiles(files);
  await expect(page.locator('.upload-list [data-status="ready"]')).toHaveCount(
    photos + videos,
    { timeout: 180000 },
  );
  await page.reload();
}
async function montage(page: Page, id: string) {
  const r = await request(page, `/api/timelines/${id}`);
  expect(r.status).toBe(200);
  return r.body;
}
async function generate(page: Page, count: number) {
  await page
    .getByRole("button", { name: "Préparer le montage", exact: true })
    .click();
  await expect(page.locator(".montage-clip")).toHaveCount(count);
}

async function render(page: Page, id: string) {
  const before = await montage(page, id);
  await page
    .getByRole("button", { name: "Créer la vidéo", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Vidéo exportée" });
  await expect(panel.locator("[data-render-job]")).toHaveCount(1);
  const job = panel.locator("[data-render-job]").first();
  await expect(job.getByRole("status")).toContainText("completed", {
    timeout: 600000,
  });
  await job.getByRole("button", { name: "Voir la vidéo", exact: true }).click();
  const video = panel.getByLabel("Vidéo finale");
  await expect(video).toHaveAttribute("src", /token=/);
  const url = await video.getAttribute("src");
  const response = await page.request.get(url!);
  expect(response.ok()).toBe(true);
  const bytes = await response.body();
  expect(bytes.length).toBeGreaterThan(100);
  const download = await request(page, `/api/renders/${id}`);
  const output = download.body.outputs[0];
  const signed = await request(page, `/api/renders/${id}`, {
    action: "preview",
    output: output.id,
    download: true,
  });
  expect(signed.status).toBe(202);
  expect(signed.body.url).toContain("download=");
  expect((await montage(page, id)).active).toEqual(before.active);
  return { job: await job.getAttribute("data-render-job"), output: output.id };
}
test("Lot E Chantier : MP4 réel, preview, download et isolation", async ({
  page,
}) => {
  test.setTimeout(720000);
  const a = await user(page);
  const id = await create(
    page,
    a.workspace,
    "Chantier Strasbourg",
    "construction",
    60,
  );
  await upload(page, 5, 2);
  await generate(page, 7);
  const result = await render(page, id);
  const b = await user(page);
  expect(
    (await b.api.from("studio_render_jobs").select("*").eq("id", result.job))
      .data,
  ).toEqual([]);
  expect(
    (
      await b.api
        .from("studio_render_outputs")
        .select("*")
        .eq("id", result.output)
    ).data,
  ).toEqual([]);
  expect(
    (
      await request(page, `/api/renders/${id}`, {
        action: "preview",
        output: result.output,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request(page, `/api/renders/${id}`, {
        action: "cancel",
        job: result.job,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await b.api.rpc("studio_request_render", {
        p_project: id,
        p_request: randomUUID(),
        p_profile: "standard",
      })
    ).error,
  ).not.toBeNull();
  const membership = await a.api.rpc("studio_set_member", {
    p_workspace_id: a.workspace,
    p_user_id: b.id,
    p_role: "viewer",
  });
  expect(membership.error).toBeNull();
  expect(
    (
      await request(page, `/api/renders/${id}`, {
        action: "preview",
        output: result.output,
      })
    ).status,
  ).toBe(202);
  expect(
    (
      await b.api.rpc("studio_request_render", {
        p_project: id,
        p_request: randomUUID(),
        p_profile: "standard",
      })
    ).error?.code,
  ).toBe("42501");
  expect(
    (await b.api.rpc("studio_cancel_render", { p_job: result.job })).error
      ?.code,
  ).toBe("42501");
});
test("Lot E Voyage : 25 médias, 90 secondes et timeline conservée", async ({
  page,
}) => {
  test.setTimeout(720000);
  const a = await user(page);
  const id = await create(
    page,
    a.workspace,
    "Vacances Croatie 2026",
    "travel",
    90,
  );
  await upload(page, 20, 5);
  await generate(page, 25);
  await render(page, id);
});
test("Lot E failure : asset manquant après admission, cleanup et retry", async ({
  page,
}) => {
  test.setTimeout(720000);
  const a = await user(page);
  const id = await create(page, a.workspace, "Erreur contrôlée", "free", 15);
  await upload(page, 1, 0);
  await generate(page, 1);
  const assets = await a.api
    .from("studio_media_assets")
    .select("*")
    .eq("project_id", id);
  const asset = assets.data![0];
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.STUDIO_STORAGE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
  const original = await admin.storage
    .from("studio-originals")
    .download(asset.storage_key);
  expect(original.error).toBeNull();
  const control = (mode: string) =>
    execFileSync(
      process.execPath,
      [
        "--import",
        resolve("../../workers/studio-video/node_modules/tsx/dist/loader.mjs"),
        resolve("../../workers/studio-video/src/queue-control.ts"),
        mode,
      ],
      {
        env: {
          ...process.env,
          STUDIO_REDIS_URL:
            process.env.STUDIO_REDIS_URL || "redis://127.0.0.1:64379",
        },
      },
    );
  control("pause");
  try {
    const created = await request(page, `/api/renders/${id}`, {
      action: "create",
      requestId: randomUUID(),
    });
    expect(created.status).toBe(202);
    await admin.storage.from("studio-originals").remove([asset.storage_key]);
  } finally {
    control("resume");
  }
  const panel = page.getByRole("region", { name: "Vidéo exportée" });
  await expect(
    panel.locator("[data-render-job]").getByRole("status"),
  ).toContainText("failed", {
    timeout: 30000,
  });
  await expect(panel).toContainText("ASSET_MISSING");
  const failed = await request(page, `/api/renders/${id}`);
  const { readdir } = await import("node:fs/promises");
  await expect
    .poll(
      async () =>
        (await readdir(process.env.STUDIO_RENDER_TMP!)).filter((n) =>
          n.startsWith(failed.body.jobs[0].id),
        ).length,
    )
    .toBe(0);
  expect(
    (
      await request(page, `/api/renders/${id}`, {
        action: "create",
        requestId: randomUUID(),
      })
    ).status,
  ).toBe(400);
  await admin.storage
    .from("studio-originals")
    .upload(asset.storage_key, original.data!, { contentType: "image/jpeg" });
  await panel.getByRole("button", { name: "Réessayer le rendu" }).click();
  await expect(
    panel.locator("[data-render-job]").first().getByRole("status"),
  ).toContainText("completed", { timeout: 600000 });
  // Reconciliation exercises real private Storage and scratch, while retaining
  // the completed retry output and objects still inside the one-hour grace.
  const root = process.env.STUDIO_RENDER_TMP!;
  const abandoned = join(root, `${randomUUID()}-${randomUUID()}-fixture`);
  await mkdir(abandoned);
  const past = new Date(Date.now() - 2 * 3600000);
  await utimes(abandoned, past, past);
  const orphan = `studio/${a.workspace}/${id}/renders/${randomUUID()}/${randomUUID()}/output.mp4`;
  const recent = `studio/${a.workspace}/${id}/renders/${randomUUID()}/${randomUUID()}/output.mp4`;
  for (const key of [orphan, recent])
    expect(
      (
        await admin.storage
          .from("studio-renders")
          .upload(key, Buffer.alloc(128), { contentType: "video/mp4" })
      ).error,
    ).toBeNull();
  const state = JSON.parse(await readFile(".local-test.json", "utf8"));
  expect(state.projectId).toMatch(/^elsatia-studio-a-/);
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      `supabase_db_${state.projectId}`,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: `update storage.objects set created_at=now()-interval '2 hours' where bucket_id='studio-renders' and name='${orphan}';`,
    },
  );
  const reconcile = (args: string[]) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--import",
          resolve(
            "../../workers/studio-video/node_modules/tsx/dist/loader.mjs",
          ),
          resolve("../../workers/studio-video/src/reconcile.ts"),
          ...args,
        ],
        { encoding: "utf8" },
      ),
    );
  expect(reconcile([])).toMatchObject({
    apply: false,
    temporaryDirectories: 1,
    orphanObjects: 1,
  });
  expect(
    (await admin.storage.from("studio-renders").info(orphan)).error,
  ).toBeNull();
  expect(reconcile(["--apply"])).toMatchObject({
    apply: true,
    temporaryDirectories: 1,
    orphanObjects: 1,
  });
  await expect(access(abandoned)).rejects.toThrow();
  expect(
    (await admin.storage.from("studio-renders").info(orphan)).error,
  ).not.toBeNull();
  expect(
    (await admin.storage.from("studio-renders").info(recent)).error,
  ).toBeNull();
  const output = await admin
    .from("studio_render_outputs")
    .select("storage_key")
    .eq("project_id", id)
    .single();
  expect(output.error).toBeNull();
  expect(
    (await admin.storage.from("studio-renders").info(output.data!.storage_key))
      .error,
  ).toBeNull();
  await admin.storage.from("studio-renders").remove([recent]);
});
test("Lot E cancellation : worker arrêté, aucun output", async ({ page }) => {
  test.setTimeout(120000);
  const a = await user(page);
  const id = await create(
    page,
    a.workspace,
    "Annulation contrôlée",
    "free",
    120,
  );
  await upload(page, 20, 0);
  await generate(page, 20);
  await page
    .getByRole("button", { name: "Créer la vidéo", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Vidéo exportée" });
  await expect(
    panel.locator("[data-render-job]").getByRole("status"),
  ).toContainText("rendering", {
    timeout: 60000,
  });
  await panel.getByRole("button", { name: "Annuler le rendu" }).click();
  await expect(
    panel.locator("[data-render-job]").getByRole("status"),
  ).toContainText("cancelled", {
    timeout: 15000,
  });
  const jobs = await request(page, `/api/renders/${id}`);
  expect(jobs.body.outputs).toHaveLength(0);
  const root = process.env.STUDIO_RENDER_TMP!;
  await expect
    .poll(
      async () => {
        const { readdir } = await import("node:fs/promises");
        return (await readdir(root)).filter((n) =>
          n.startsWith(jobs.body.jobs[0].id),
        ).length;
      },
      { timeout: 15000 },
    )
    .toBe(0);
});
