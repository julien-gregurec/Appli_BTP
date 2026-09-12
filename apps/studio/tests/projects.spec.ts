import { rm } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fixtures } from "./media-fixtures";
const password = "Studio-Projects-Local-398!";
const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.STUDIO_STORAGE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
async function user(page: Page) {
  const api = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const email = `projects-${randomUUID()}@example.test`,
    signup = await api.auth.signUp({ email, password });
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
) {
  await page.goto(`/projects?workspace=${workspace}`);
  await page
    .getByRole("combobox", { name: "Type de projet", exact: true })
    .selectOption(type);
  await page.getByLabel("Nom du projet", { exact: true }).fill(name);
}
async function submit(page: Page) {
  await page
    .getByRole("button", { name: "Créer le projet", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}
async function upload(page: Page, count = 7) {
  const files = [
    ...Array.from({ length: 5 }, (_, n) =>
      join(sample.directory, `photo-${n}.${n % 2 ? "png" : "jpg"}`),
    ),
    join(sample.directory, "video-0.mp4"),
    join(sample.directory, "video-1.mp4"),
  ].slice(0, count);
  await page.getByLabel("Choisir des fichiers").setInputFiles(files);
  await expect(page.locator('.upload-list [data-status="ready"]')).toHaveCount(
    count,
    { timeout: 120000 },
  );
  await page.reload();
  await expect(page.locator(".media-card")).toHaveCount(count);
}
test("Lot C Chantier : paramètres, cover, ordre, archive/restauration et tablette", async ({
  page,
}) => {
  test.setTimeout(240000);
  const a = await user(page);
  const roleBefore = await a.api.rpc("studio_my_role", {
    p_workspace_id: a.workspace,
  });
  expect(roleBefore.error).toBeNull();
  expect(roleBefore.data).toBe("owner");
  expect((await a.api.auth.getUser()).data.user?.id).toBe(a.id);
  await create(page, a.workspace, "Chantier Strasbourg", "construction");
  await page.getByLabel("Ville", { exact: true }).fill("Strasbourg");
  await page
    .getByLabel("Prestations", { exact: true })
    .fill("Peinture et isolation");
  await page.getByLabel("Client", { exact: true }).fill("Particulier");
  await page.getByLabel("Entreprise", { exact: true }).fill("Atelier Studio");
  await page.getByLabel("Date de début", { exact: true }).fill("2026-07-01");
  await page.getByLabel("Date de fin", { exact: true }).fill("2026-08-01");
  await page
    .getByRole("combobox", { name: "Format cible", exact: true })
    .selectOption("9:16");
  await page
    .getByRole("combobox", { name: "Durée cible", exact: true })
    .selectOption("60");
  const id = await submit(page);
  await upload(page);
  const card = page.locator(".media-card").filter({ hasText: "photo-0.jpg" });
  await card.getByRole("button", { name: "Définir comme couverture" }).click();
  await expect(
    card.getByRole("button", { name: "Retirer la couverture" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Voir la couverture", exact: true })
    .click();
  await expect(
    page.getByAltText("Couverture de Chantier Strasbourg"),
  ).toBeVisible();
  await page.getByText("Organiser les médias", { exact: true }).click();
  await expect(page.locator(".ordering-list li")).toHaveCount(7);
  const names = await page.locator(".ordering-list li span").allTextContents();
  await page
    .getByRole("button", { name: `Descendre ${names[0]}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Enregistrer l’ordre", exact: true })
    .click();
  await expect(
    page.getByText("Ordre enregistré.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByText("Organiser les médias", { exact: true }).click();
  await expect(page.locator(".ordering-list li span").first()).toHaveText(
    names[1],
  );
  const roleAfter = await a.api.rpc("studio_my_role", {
    p_workspace_id: a.workspace,
  });
  expect(roleAfter.error).toBeNull();
  expect(roleAfter.data).toBe("owner");
  const projectResponse = await request(page, `/api/projects/${id}`);
  expect(projectResponse.status, JSON.stringify(projectResponse.body)).toBe(
    200,
  );
  expect(projectResponse.body).toMatchObject({
    workspace_id: a.workspace,
    location_label: "Strasbourg",
    target_duration_seconds: 60,
    target_aspect_ratio: "9:16",
    metadata_json: { services: "Peinture et isolation" },
  });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Archiver", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Restaurer", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Choisir des fichiers")).toHaveCount(0);
  expect(
    (
      await request(page, `/api/media/projects/${id}/reserve`, {
        requestId: randomUUID(),
        name: "x.jpg",
        mime: "image/jpeg",
        size: 123,
      })
    ).status,
  ).toBe(409);
  await page.goto(`/projects?workspace=${a.workspace}`);
  await expect(page.locator(".project-card")).toHaveCount(0);
  await page.getByLabel("Filtrer par statut").selectOption("archived");
  await page.getByRole("button", { name: "Appliquer les filtres" }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Ouvrir", exact: true }).click();
  await page.getByRole("button", { name: "Restaurer", exact: true }).click();
  await expect(page.getByLabel("Choisir des fichiers")).toBeVisible();
  await expect(page.locator(".media-card")).toHaveCount(7);
  await page.setViewportSize({ width: 820, height: 1180 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-project-tablet.png",
    fullPage: true,
  });
});
test("Lot C Voyage : dates, filtres, duplication sans copie Storage, suppression partagée", async ({
  page,
}) => {
  test.setTimeout(240000);
  const a = await user(page);
  await create(page, a.workspace, "Vacances Croatie 2026", "travel");
  await page.getByLabel("Destination", { exact: true }).fill("Croatie");
  await page.getByLabel("Date de début", { exact: true }).fill("2026-08-01");
  await page.getByLabel("Date de fin", { exact: true }).fill("2026-08-15");
  await page
    .getByRole("combobox", { name: "Durée cible", exact: true })
    .selectOption("90");
  const source = await submit(page);
  await upload(page, 3);
  const assets = (await request(page, `/api/projects/${source}/order`)).body
    .assets as { id: string; storage_key: string; original_filename: string }[];
  const db = admin();
  expect(
    (
      await db
        .from("studio_media_assets")
        .update({ captured_at: "2020-01-01T00:00:00Z" })
        .eq("id", assets[2].id)
    ).error,
  ).toBeNull();
  await page.getByText("Organiser les médias", { exact: true }).click();
  await expect(page.locator(".ordering-list li")).toHaveCount(3);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Trier par date", exact: true })
    .click();
  await expect(
    page.getByText("Ordre enregistré.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".ordering-list li span").first()).toHaveText(
    assets[2].original_filename,
  );
  await page.getByRole("button", { name: "Dupliquer", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(source));
  const copy = page.url().split("/").pop()!;
  await expect(
    page.getByRole("heading", {
      name: "Vacances Croatie 2026 (copie)",
      exact: true,
    }),
  ).toBeVisible();
  const references = (await request(page, `/api/projects/${copy}/order`)).body
    .assets as { id: string; storage_key: string }[];
  expect(references.map((r) => r.id).sort()).toEqual(
    assets.map((r) => r.id).sort(),
  );
  expect(references[0].id).toBe(assets[2].id);
  expect(
    (
      await a.api
        .from("studio_media_assets")
        .select("id")
        .eq("workspace_id", a.workspace)
    ).data,
  ).toHaveLength(3);
  expect(
    (await request(page, `/api/projects/${source}/delete`, {})).status,
  ).toBe(200);
  await page.reload();
  await expect(page.locator(".media-card")).toHaveCount(3);
  await page
    .locator(".media-card")
    .first()
    .getByRole("button", { name: "Voir l’aperçu" })
    .click();
  await expect(page.locator(".media-card img").first()).toBeVisible();
  // Physical purge must not touch a shared ready asset, even past the retention date.
  expect(
    (
      await db
        .from("studio_media_assets")
        .update({ purge_after: new Date(Date.now() - 3600000).toISOString() })
        .in(
          "id",
          assets.map((a) => a.id),
        )
    ).error,
  ).toBeNull();
  const reconcile = () =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ["scripts/storage-reconcile.mjs", "--apply"],
        { encoding: "utf8" },
      ),
    );
  expect(reconcile().errors).toBe(0);
  for (const asset of assets)
    expect(
      (await db.storage.from("studio-originals").info(asset.storage_key)).error,
    ).toBeNull();
  await page.goto(`/projects?workspace=${a.workspace}`);
  await page.getByLabel("Rechercher un projet").fill("Croatie");
  await page.getByLabel("Filtrer par type").selectOption("travel");
  await page.getByLabel("Trier les projets").selectOption("name");
  await page.getByRole("button", { name: "Appliquer les filtres" }).click();
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Ouvrir", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${copy}$`));
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Supprimer le projet", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\?workspace=/);
  await expect(page.locator(".project-card")).toHaveCount(0);
  expect((await request(page, `/api/projects/${copy}`)).status).toBe(404);
  expect(reconcile().errors).toBe(0);
  for (const asset of assets)
    expect(
      (await db.storage.from("studio-originals").info(asset.storage_key)).error,
    ).not.toBeNull();
});
test("Lot C mobile : création, import, édition et refus API A/B/viewer", async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  const a = await user(page);
  await create(page, a.workspace, "Souvenir mobile", "memory");
  const id = await submit(page);
  await upload(page, 1);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Souvenir familial");
  await page
    .getByRole("combobox", { name: "Format cible", exact: true })
    .selectOption("1:1");
  await page
    .getByRole("combobox", { name: "Durée cible", exact: true })
    .selectOption("custom");
  await page.getByLabel("Durée personnalisée (secondes)").fill("45");
  await page
    .getByRole("button", { name: "Enregistrer les informations", exact: true })
    .click();
  await expect(
    page.getByText("Informations enregistrées.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Souvenir familial");
  await expect(page.locator(".media-card")).toHaveCount(1);
  expect((await request(page, `/api/projects/${id}`)).body).toMatchObject({
    target_aspect_ratio: "1:1",
    target_duration_seconds: 45,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-project-mobile.png",
    fullPage: true,
  });
  const ctx = await browser.newContext(),
    other = await ctx.newPage();
  const b = await user(other);
  const asset = (await request(page, `/api/projects/${id}/order`)).body
    .assets[0].id;
  for (const action of [
    "duplicate",
    "archive",
    "restore",
    "delete",
    "cover",
    "order",
    "remove",
  ])
    expect(
      (
        await request(other, `/api/projects/${id}/${action}`, {
          asset,
          ids: [asset],
          chronological: false,
          revision: 1,
        })
      ).status,
    ).toBe(404);
  expect((await request(other, `/api/projects/${id}`)).status).toBe(404);
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
  expect((await request(other, `/api/projects/${id}`)).status).toBe(200);
  await expect(
    other.getByRole("heading", { name: "Souvenir mobile", exact: true }),
  ).toBeVisible();
  await expect(other.getByLabel("Choisir des fichiers")).toHaveCount(0);
  await expect(
    other.getByRole("button", { name: "Enregistrer les informations" }),
  ).toHaveCount(0);
  for (const action of [
    "duplicate",
    "archive",
    "restore",
    "delete",
    "cover",
    "order",
    "remove",
  ])
    expect(
      (
        await request(other, `/api/projects/${id}/${action}`, {
          asset,
          ids: [asset],
          chronological: false,
          revision: 1,
        })
      ).status,
    ).toBe(403);
  await ctx.close();
});
