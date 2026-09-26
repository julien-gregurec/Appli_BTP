import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
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
test("Lot F galerie, style, texte, nouvelle version conservée et MP4 privé", async ({
  page,
}) => {
  test.setTimeout(600000);
  const a = await user(page),
    id = await create(
      page,
      a.workspace,
      "Chantier Strasbourg",
      "construction",
      15,
    );
  await upload(page, 3, 1);
  const gallery = page.getByRole("group", { name: "Galerie templates" });
  await expect(gallery.locator("video")).toHaveCount(6);
  await gallery
    .locator("video")
    .first()
    .evaluate(async (node) => {
      await (node as HTMLVideoElement).play();
    });
  await expect
    .poll(() =>
      gallery
        .locator("video")
        .first()
        .evaluate((node) => (node as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(0);
  await gallery
    .locator("video")
    .first()
    .evaluate((node) => (node as HTMLVideoElement).pause());
  await gallery.screenshot({
    path: "test-results/studio-templates-gallery.png",
  });
  await page
    .getByRole("button", { name: "Choisir Chantier Pro", exact: true })
    .click();
  await page.getByLabel("Titre", { exact: true }).fill("Été à Šibenik");
  await page
    .getByRole("button", { name: "Préparer le montage", exact: true })
    .click();
  await expect(page.locator(".montage-clip")).toHaveCount(6);
  const first = (await montage(page, id)).active;
  expect(first.presentation.template.id).toBe("chantier-pro");
  const text = page.getByRole("form", {
    name: `Texte ${first.presentation.overlays[0].id}`,
    exact: true,
  });
  await text.locator("textarea").fill("Côte d’Azur — É À ç");
  await text.getByRole("button", { name: "Enregistrer le texte" }).click();
  await expect
    .poll(async () => (await montage(page, id)).active.revision)
    .toBe(2);
  const old = (await montage(page, id)).active;
  await page
    .getByRole("button", { name: "Choisir Chantier Dynamique", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Régénérer le montage", exact: true })
    .click();
  await expect
    .poll(async () => (await montage(page, id)).versions.length)
    .toBe(2);
  const next = (await montage(page, id)).active;
  expect(next.id).not.toBe(old.id);
  expect(next.presentation.template.id).toBe("chantier-dynamique");
  await page.getByLabel("Version du montage").selectOption(old.id);
  await expect
    .poll(async () => (await montage(page, id)).active.id)
    .toBe(old.id);
  expect((await montage(page, id)).active).toEqual(old);
  await render(page, id);
});
test("Lot F Avant Après : trois médias par groupe et labels persistés", async ({
  page,
}) => {
  test.setTimeout(240000);
  const a = await user(page),
    id = await create(page, a.workspace, "Transformation", "construction", 30);
  await upload(page, 6, 0);
  await page
    .getByRole("button", { name: "Choisir Avant / Après", exact: true })
    .click();
  await page.getByRole("button", { name: "Tout marquer Avant" }).click();
  for (let i = 3; i < 6; i++)
    await page
      .getByLabel(`Groupe photo-0${i}.jpg`, { exact: true })
      .selectOption("after");
  await page
    .getByRole("button", { name: "Préparer le montage", exact: true })
    .click();
  await expect(page.locator(".montage-clip")).toHaveCount(8);
  const d = (await montage(page, id)).active;
  expect(
    d.presentation.overlays.filter((o: { text: string }) => o.text === "AVANT"),
  ).toHaveLength(3);
  expect(
    d.presentation.overlays.filter((o: { text: string }) => o.text === "APRÈS"),
  ).toHaveLength(3);
  await page.reload();
  await expect(page.locator(".montage-clip")).toHaveCount(8);
});
test("Lot F Voyage : recommandation, chapitre UTF8 et lecture mobile", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 844 });
  const a = await user(page),
    id = await create(page, a.workspace, "Vacances Croatie 2026", "travel", 15);
  await upload(page, 2, 1);
  await page
    .getByRole("button", { name: "Choisir Voyage", exact: true })
    .click();
  await page
    .getByText("Chapitres manuels (facultatif)", { exact: true })
    .click();
  await page
    .getByLabel("Chapitre pour photo-00.jpg", { exact: true })
    .fill("Šibenik");
  await page
    .getByRole("button", { name: "Préparer le montage", exact: true })
    .click();
  await expect(page.locator(".montage-clip")).toHaveCount(5);
  const d = (await montage(page, id)).active;
  expect(
    d.presentation.overlays.some((o: { text: string }) => o.text === "Šibenik"),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("Lot F : viewer lecture seule et utilisateur B isolé sur API directe", async ({
  page,
}) => {
  test.setTimeout(180000);
  const a = await user(page),
    id = await create(page, a.workspace, "Souvenirs personnels", "free", 15);
  await upload(page, 2, 0);
  const generated = await request(page, `/api/timelines/${id}`, {
    action: "generate",
    template: { templateId: "souvenir", templateVersion: 1 },
  });
  expect(generated.status).toBe(200);
  const b = await user(page);
  expect((await request(page, `/api/timelines/${id}`)).status).toBe(404);
  expect(
    (
      await request(page, `/api/timelines/${id}`, {
        action: "generate",
        template: { templateId: "souvenir", templateVersion: 1 },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await a.api.rpc("studio_set_member", {
        p_workspace_id: a.workspace,
        p_user_id: b.id,
        p_role: "viewer",
      })
    ).error,
  ).toBeNull();
  await page.goto(`/projects/${id}`);
  await expect(page.getByRole("region", { name: "Montage" })).toHaveAttribute(
    "data-loaded",
    "true",
  );
  await expect(
    page.getByRole("group", { name: "Galerie templates" }),
  ).toHaveCount(0);
  expect(
    (
      await request(page, `/api/timelines/${id}`, {
        action: "generate",
        template: { templateId: "chantier-pro", templateVersion: 1 },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(page, `/api/timelines/${id}`, {
        action: "text",
        timeline: generated.body.id,
        revision: 1,
        overlay: generated.body.presentation.overlays[0].id,
        text: "Modifié",
      })
    ).status,
  ).toBe(403);
});
