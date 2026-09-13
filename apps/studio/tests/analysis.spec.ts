import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
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
  if (process.env.STUDIO_AI_ANALYSIS === "1")
    execFileSync(process.env.STUDIO_ANALYSIS_PYTHON!, [
      "../../workers/studio-video/analysis/fixtures.py",
      join(sample.directory, "vision"),
    ]);
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
      buffer: await readFile(
        process.env.STUDIO_AI_ANALYSIS === "1"
          ? join(
              sample.directory,
              "vision",
              `media-${String(i).padStart(3, "0")}.jpg`,
            )
          : join(sample.directory, "photo-0.jpg"),
      ),
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
  await writeFile(test.info().outputPath("analysis-render.mp4"), bytes);
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

async function analyze(page: Page, id: string, total: number) {
  const section = page.getByRole("region", { name: "Sélection intelligente" });
  await section
    .getByRole("button", { name: "Analyser les médias", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        const r = await request(page, `/api/analysis/${id}`);
        return r.body.completed;
      },
      { timeout: 180000, intervals: [1000] },
    )
    .toBe(total);
  await expect(section.getByRole("status")).toContainText(
    `${total}/${total} médias analysés`,
    { timeout: 30000 },
  );
  return section;
}
async function accept(
  page: Page,
  id: string,
  section: ReturnType<Page["getByRole"]>,
  style: string,
  adjust = false,
) {
  await section.getByLabel("Style de la proposition").selectOption(style);
  await expect
    .poll(async () =>
      section
        .getByRole("button", { name: "Choisir les meilleurs médias" })
        .isEnabled(),
    )
    .toBe(true);
  await section
    .getByRole("button", { name: "Choisir les meilleurs médias" })
    .click();
  await expect(section.getByLabel("Nombre proposé")).toBeVisible();
  let excluded: string | null = null;
  if (adjust) {
    const choice = section.getByRole("checkbox", { checked: true }).first();
    excluded = await choice
      .locator("xpath=ancestor::li")
      .getAttribute("data-analysis-asset");
    await choice.uncheck();
    await section
      .getByRole("button", { name: "Conserver l’ordre du projet" })
      .click();
  }
  page.once("dialog", (dialog) => dialog.accept());
  await section
    .getByRole("button", { name: "Créer un montage avec la sélection" })
    .click();
  await expect
    .poll(async () => Boolean((await montage(page, id)).active), {
      timeout: 30000,
    })
    .toBe(true);
  if (excluded) {
    const active = (await montage(page, id)).active;
    expect(
      active.clips.some(
        (c: { asset_id: string | null }) => c.asset_id === excluded,
      ),
    ).toBe(false);
  }
}
test("Lot H Chantier : analyse, sélection, nouvelle version, éditeur et MP4", async ({
  page,
}) => {
  test.setTimeout(600000);
  const a = await user(page),
    id = await create(
      page,
      a.workspace,
      "Chantier Strasbourg",
      "construction",
      30,
    );
  await upload(page, 10, 2);
  const original = await request(page, `/api/timelines/${id}`, {
    action: "generate",
  });
  expect(original.status).toBe(200);
  const section = await analyze(page, id, 12);
  const data = (await request(page, `/api/analysis/${id}`)).body;
  expect(data.metrics.provider_calls).toBe(0);
  expect(
    data.rows.every(
      (r: { analysis: { provider: string } }) =>
        r.analysis.provider === "local-opencv",
    ),
  ).toBe(true);
  await accept(page, id, section, "chantier-pro");
  await expect
    .poll(async () => (await montage(page, id)).versions.length)
    .toBe(2);
  expect(
    (await montage(page, id)).versions.some(
      (v: { id: string }) => v.id === original.body.id,
    ),
  ).toBe(true);
  const count = await a.api
    .from("studio_project_assets")
    .select("*", { count: "exact", head: true })
    .eq("project_id", id);
  expect(count.count).toBe(12);
  await page.screenshot({
    path: "test-results/studio-analysis-desktop.png",
    fullPage: true,
  });
  await render(page, id);
  await page.getByRole("link", { name: "Modifier le montage" }).click();
  await page.getByLabel("Aller au clip", { exact: true }).fill("2");
  await expect(page.locator(".analysis-badge")).toBeVisible();
});
test("Lot H Voyage : 100 médias, diversité, cache et choix manuel conservé", async ({
  page,
}) => {
  test.setTimeout(600000);
  const a = await user(page),
    id = await create(page, a.workspace, "Vacances Croatie 2026", "travel", 60);
  await upload(page, 100, 0);
  const section = await analyze(page, id, 100);
  const before = (await request(page, `/api/analysis/${id}?template=voyage`))
    .body;
  expect(before.suggested.length).toBeGreaterThan(1);
  expect(before.suggested.length).toBeLessThan(100);
  const cached = await request(page, `/api/analysis/${id}`, {
    action: "analyze",
  });
  expect(cached.body.queued).toBe(0);
  const after = (await request(page, `/api/analysis/${id}?template=voyage`))
    .body;
  expect(after.metrics.ai_operations).toBe(before.metrics.ai_operations);
  expect(after.suggested).toEqual(before.suggested);
  await accept(page, id, section, "voyage", true);
  const retained = await a.api
    .from("studio_project_assets")
    .select("*", { count: "exact", head: true })
    .eq("project_id", id);
  expect(retained.error).toBeNull();
  expect(retained.count).toBe(100);
  await render(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await section.getByLabel("Filtrer l’analyse").selectOption("Faible qualité");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-analysis-mobile.png",
    fullPage: true,
  });
});
test("Lot H Viewer et B : lecture seule, refus directs et isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const a = await user(page),
    id = await create(page, a.workspace, "Analyse privée", "free", 15);
  await upload(page, 2, 0);
  await analyze(page, id, 2);
  const context = await browser.newContext(),
    p = await context.newPage(),
    b = await user(p);
  expect((await request(p, `/api/analysis/${id}`)).status).toBe(404);
  expect(
    (await request(p, `/api/analysis/${id}`, { action: "analyze" })).status,
  ).toBe(404);
  const member = await a.api.rpc("studio_set_member", {
    p_workspace_id: a.workspace,
    p_user_id: b.id,
    p_role: "viewer",
  });
  expect(member.error).toBeNull();
  await p.goto(`/projects/${id}`);
  const section = p.getByRole("region", { name: "Sélection intelligente" });
  await expect(section.getByRole("status")).toContainText("2/2");
  expect(
    await section
      .getByRole("button", { name: "Analyser les médias", exact: true })
      .count(),
  ).toBe(0);
  expect(
    (await request(p, `/api/analysis/${id}`, { action: "analyze" })).status,
  ).toBe(403);
  expect(
    (await request(p, `/api/analysis/${id}`, { action: "cancel" })).status,
  ).toBe(403);
  const direct = await b.api.rpc("studio_request_analysis", {
    p_project: id,
    p_force: true,
  });
  expect(direct.error).not.toBeNull();
  await context.close();
});
test("Lot H Failure : fournisseur indisponible, fallback local non bloquant", async ({
  page,
}) => {
  test.setTimeout(240000);
  const a = await user(page),
    id = await create(page, a.workspace, "Fallback local", "free", 15);
  await upload(page, 2, 0);
  const section = await analyze(page, id, 2);
  const data = (await request(page, `/api/analysis/${id}`)).body;
  expect(
    data.rows.every(
      (r: { analysis: { fallback: boolean; status: string } }) =>
        r.analysis.fallback && r.analysis.status === "completed",
    ),
  ).toBe(true);
  await expect(
    section
      .getByText("Fournisseur indisponible : analyse locale utilisée.")
      .first(),
  ).toBeVisible();
  await accept(page, id, section, "chantier-pro");
  await render(page, id);
});
test("Lot H OFF : import, montage, editor et renderer sans analyse", async ({
  page,
}) => {
  test.setTimeout(240000);
  const a = await user(page),
    id = await create(page, a.workspace, "Sans analyse", "free", 15);
  await upload(page, 2, 1);
  expect((await request(page, `/api/analysis/${id}`)).body.enabled).toBe(false);
  expect(
    await page.getByRole("region", { name: "Sélection intelligente" }).count(),
  ).toBe(0);
  expect(
    (await request(page, `/api/analysis/${id}`, { action: "analyze" })).status,
  ).toBe(409);
  expect(
    (await request(page, `/api/timelines/${id}`, { action: "generate" }))
      .status,
  ).toBe(200);
  await page.reload();
  await render(page, id);
  await page.getByRole("link", { name: "Modifier le montage" }).click();
  await expect(page.getByRole("heading", { name: /Montage ·/ })).toBeVisible();
});
