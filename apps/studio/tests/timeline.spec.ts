import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

test("Lot D Chantier : 7 clips, 60 s, ordre, animations, édition et persistance", async ({
  page,
}) => {
  test.setTimeout(300000);
  const a = await user(page),
    id = await create(
      page,
      a.workspace,
      "Chantier Strasbourg",
      "construction",
      60,
    );
  const empty = await request(page, `/api/timelines/${id}`, {
    action: "generate",
  });
  expect(empty.status).toBe(400);
  expect(empty.body.error).toContain("Ajoutez au moins un média");
  await upload(page, 5, 2);
  const ordered = (await request(page, `/api/projects/${id}/order`)).body
    .assets;
  await generate(page, 7);
  let d = (await montage(page, id)).active;
  expect(d.total_duration_ms).toBe(60000);
  expect(d.aspect_ratio).toBe("9:16");
  expect(d.clips.map((c: { asset_id: string }) => c.asset_id)).toEqual(
    ordered.map((a: { id: string }) => a.id),
  );
  expect(
    d.clips
      .filter((c: { clip_type: string }) => c.clip_type === "image")
      .every(
        (c: { metadata_json: { motion: unknown } }) => !!c.metadata_json.motion,
      ),
  ).toBe(true);
  expect(
    d.clips.every((c: { transition_in: string }) => c.transition_in === "fade"),
  ).toBe(true);
  const first = d.clips[0].id;
  await page
    .getByRole("button", { name: "Descendre le clip 1", exact: true })
    .click();
  await expect
    .poll(async () => (await montage(page, id)).active.clips[1].id)
    .toBe(first);
  await expect(page.locator(".montage")).toHaveAttribute("aria-busy", "false");
  const photo = page
    .locator(".montage-clip")
    .filter({ has: page.getByLabel("Durée photo (s)", { exact: true }) })
    .first();
  await photo.getByLabel("Durée photo (s)", { exact: true }).fill("10");
  await photo
    .getByRole("combobox", { name: "Animation", exact: true })
    .selectOption("pan_down");
  await photo
    .getByRole("combobox", { name: "Transition", exact: true })
    .selectOption("dissolve");
  await photo.getByRole("button", { name: "Enregistrer le clip" }).click();
  await expect(page.locator(".montage")).toHaveAttribute("aria-busy", "false");
  await page.reload();
  d = (await montage(page, id)).active;
  expect(d.clips[1].id).toBe(first);
  expect(
    d.clips.some(
      (c: {
        duration_ms: number;
        animation_type: string;
        transition_in: string;
      }) =>
        c.duration_ms === 10000 &&
        c.animation_type === "pan_down" &&
        c.transition_in === "dissolve",
    ),
  ).toBe(true);
  await page
    .locator(".montage-clip")
    .first()
    .getByRole("button", { name: "Voir l’aperçu" })
    .click();
  await expect(
    page.locator(".montage-preview img,.montage-preview video"),
  ).toHaveCount(1);
  // Removing/readding clips preserves assets and supports repeating one asset.
  const before = (await request(page, `/api/projects/${id}/order`)).body.assets
    .length;
  await page
    .locator(".montage-clip")
    .first()
    .getByRole("button", { name: "Retirer le clip" })
    .click();
  await expect(page.locator(".montage-clip")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Ajouter le clip", exact: true })
    .click();
  await expect(page.locator(".montage-clip")).toHaveCount(7);
  await page
    .getByRole("button", { name: "Ajouter le clip", exact: true })
    .click();
  await expect(page.locator(".montage-clip")).toHaveCount(8);
  expect(
    (await request(page, `/api/projects/${id}/order`)).body.assets.length,
  ).toBe(before);
});

test("Lot D Voyage : 25 médias chronologiques, 90 s et versions", async ({
  page,
}) => {
  test.setTimeout(300000);
  const a = await user(page),
    id = await create(page, a.workspace, "Vacances Croatie 2026", "travel", 90);
  await upload(page, 20, 5);
  const state = JSON.parse(readFileSync(".local-test.json", "utf8"));
  expect(state.projectId).toMatch(/^elsatia-studio-a-/);
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
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
      input: `update public.studio_media_assets a set captured_at='2026-07-01'::timestamptz + q.n*interval '1 day' from (select id,row_number() over(order by original_filename desc) n from public.studio_media_assets where project_id='${id}') q where a.id=q.id;`,
    },
  );
  let order = (await request(page, `/api/projects/${id}/order`)).body;
  expect(
    (
      await request(page, `/api/projects/${id}/order`, {
        ids: [],
        chronological: true,
        revision: order.project.revision,
      })
    ).status,
  ).toBe(200);
  order = (await request(page, `/api/projects/${id}/order`)).body;
  await generate(page, 25);
  let d = await montage(page, id);
  expect(d.active.total_duration_ms).toBe(90000);
  expect(d.active.clips.map((c: { asset_id: string }) => c.asset_id)).toEqual(
    order.assets.map((a: { id: string }) => a.id),
  );
  const first = d.active.id;
  await page
    .getByRole("button", { name: "Régénérer le montage", exact: true })
    .click();
  await expect
    .poll(async () => (await montage(page, id)).versions.length)
    .toBe(2);
  await page.reload();
  d = await montage(page, id);
  expect(d.active.version).toBe(2);
  expect(d.active.id).not.toBe(first);
  expect(d.active.total_duration_ms).toBe(90000);
  await page
    .getByRole("combobox", { name: "Version du montage" })
    .selectOption(first);
  await expect
    .poll(async () => (await montage(page, id)).active.id)
    .toBe(first);
});

test("Lot D Viewer et isolation A/B : lectures et mutations directes", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const a = await user(page),
    id = await create(page, a.workspace, "Montage privé", "free", 15);
  await upload(page, 1, 0);
  await generate(page, 1);
  const doc = (await montage(page, id)).active;
  const context = await browser.newContext(),
    other = await context.newPage();
  const b = await user(other);
  expect((await request(other, `/api/timelines/${id}`)).status).toBe(404);
  expect(
    (await request(other, `/api/timelines/${id}`, { action: "generate" }))
      .status,
  ).toBe(404);
  const pb = await create(other, b.workspace, "Projet B", "travel", 15);
  expect(
    (
      await request(other, `/api/timelines/${pb}`, {
        action: "activate",
        timeline: doc.id,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await a.api.rpc("studio_set_member", {
        p_workspace_id: a.workspace,
        p_user_id: b.id,
        p_role: "viewer",
      })
    ).error,
  ).toBeNull();
  await other.goto(`/projects/${id}`);
  await expect(other.locator(".montage-clip")).toHaveCount(1);
  await expect(
    other.getByRole("button", { name: "Régénérer le montage" }),
  ).toHaveCount(0);
  for (const command of [
    { action: "generate" },
    { action: "edit", clip: doc.clips[0].id, patch: { duration_ms: 4000 } },
    { action: "order", ids: [doc.clips[0].id] },
    { action: "remove", clip: doc.clips[0].id },
    { action: "add", asset: doc.clips[0].asset_id },
    { action: "delete" },
    { action: "activate" },
  ])
    expect(
      (
        await request(other, `/api/timelines/${id}`, {
          timeline: doc.id,
          revision: doc.revision,
          ...command,
        })
      ).status,
    ).toBe(403);
  await context.close();
});

test("Lot D mobile : lecture, boutons de déplacement et durée", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  const a = await user(page),
    id = await create(page, a.workspace, "Montage mobile", "memory", 15);
  await upload(page, 2, 0);
  await generate(page, 2);
  const before = (await montage(page, id)).active;
  await page
    .getByRole("button", { name: "Descendre le clip 1", exact: true })
    .click();
  await expect
    .poll(async () => (await montage(page, id)).active.clips[1].id)
    .toBe(before.clips[0].id);
  await expect(page.locator(".montage")).toHaveAttribute("aria-busy", "false");
  const first = page.locator(".montage-clip").first();
  await first.getByLabel("Durée photo (s)", { exact: true }).fill("6");
  await first.getByRole("button", { name: "Enregistrer le clip" }).click();
  await expect
    .poll(async () => (await montage(page, id)).active.clips[0].duration_ms)
    .toBe(6000);
  await page.reload();
  await expect(page.locator(".montage-clip")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".montage")
    .screenshot({ path: "test-results/montage-mobile.png" });
});
