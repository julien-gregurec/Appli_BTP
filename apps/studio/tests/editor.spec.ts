import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixtures } from "./media-fixtures";
test.use({ actionTimeout: 15000 });
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
  await writeFile(test.info().outputPath("edited-output.mp4"), bytes);
  const download = await request(page, `/api/renders/${id}`);
  const output = download.body.outputs[0];
  const rendered = download.body.jobs.find(
    (j: { id: string }) => j.id === output.render_job_id,
  );
  expect(rendered.timeline_id).toBe(before.active.id);
  expect(rendered.timeline_revision).toBe(before.active.revision);
  expect(
    Math.abs(output.duration_ms - before.active.total_duration_ms),
  ).toBeLessThanOrEqual(34);
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
async function setup(
  page: Page,
  name = "Chantier Strasbourg",
  style = "chantier-pro",
  photos = 3,
  videos = 1,
) {
  const a = await user(page),
    id = await create(
      page,
      a.workspace,
      name,
      style === "voyage" ? "travel" : "construction",
      15,
    );
  await upload(page, photos, videos);
  const m = await request(page, `/api/projects/${id}/order`),
    ids = m.body.assets.map((a: { id: string }) => a.id);
  const r = await request(page, `/api/timelines/${id}`, {
    action: "generate",
    template: {
      templateId: style,
      templateVersion: 1,
      title: name,
      outro: "Merci",
      ...(style === "avant-apres"
        ? {
            beforeIds: ids.slice(0, Math.ceil(ids.length / 2)),
            afterIds: ids.slice(Math.ceil(ids.length / 2)),
          }
        : {}),
      ...(style === "voyage"
        ? { chapters: [{ assetId: ids[0], title: "Jour un" }] }
        : {}),
    },
  });
  expect(r.status).toBe(200);
  await page.goto(`/projects/${id}/editor`);
  await expect(
    page.getByRole("heading", { name: name, exact: true }),
  ).toBeVisible();
  return { ...a, id, initial: r.body };
}
async function saved(page: Page) {
  await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
}
async function select(page: Page, index: number) {
  await page.getByLabel("Aller au clip", { exact: true }).fill(String(index));
}
test("Lot G chantier : ordre durée trim volume texte undo reload et MP4", async ({
  page,
}) => {
  test.setTimeout(600000);
  const a = await setup(page);
  await page.screenshot({
    path: "test-results/studio-editor-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("Contenu du texte", { exact: true })
    .first()
    .fill("Strasbourg rénové");
  await saved(page);
  await select(page, 2);
  await page
    .getByRole("button", { name: "Déplacer à droite", exact: true })
    .click();
  await page.getByLabel("Durée du clip (secondes)", { exact: true }).fill("2");
  await page.getByLabel("Transition", { exact: true }).selectOption("cut");
  await page.getByLabel("Cadrage", { exact: true }).selectOption("contain");
  await saved(page);
  await page.screenshot({
    path: "test-results/studio-editor-image.png",
    fullPage: true,
  });
  const current = (await montage(page, a.id)).active;
  const videoIndex = current.clips.findIndex(
    (c: { clip_type: string }) => c.clip_type === "video",
  );
  await select(page, videoIndex + 1);
  await page.getByLabel("Début vidéo (secondes)", { exact: true }).fill("0.1");
  await page.getByLabel("Volume vidéo :", { exact: false }).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await saved(page);
  await page.screenshot({
    path: "test-results/studio-editor-video.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Couper le son", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Annuler la modification", exact: true })
    .click();
  await saved(page);
  await select(page, current.clips.length);
  await page
    .getByLabel("Contenu du texte", { exact: true })
    .first()
    .fill("À bientôt");
  await saved(page);
  const snapshot = (await montage(page, a.id)).active;
  expect(snapshot.status).toBe("modified");
  expect(
    snapshot.presentation.overlays.some(
      (o: { text: string }) => o.text === "Strasbourg rénové",
    ),
  ).toBe(true);
  await page.reload();
  await saved(page);
  expect((await montage(page, a.id)).active).toEqual(snapshot);
  await render(page, a.id);
  await select(page, 2);
  await page
    .getByLabel("Durée du clip (secondes)", { exact: true })
    .fill("2.5");
  await saved(page);
  await expect(
    page.getByText(
      "La vidéo doit être régénérée pour inclure vos dernières modifications.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("Lot G voyage : chapitre ajout retrait duplication animation et rendu", async ({
  page,
}) => {
  test.setTimeout(600000);
  const a = await setup(page, "Vacances Croatie 2026", "voyage");
  await page.locator("[data-editor-clip]").nth(1).click();
  await page.keyboard.press("Alt+ArrowRight");
  await saved(page);
  expect((await montage(page, a.id)).active.clips[2].id).toBe(
    a.initial.clips[1].id,
  );
  await select(page, 2);
  await page
    .getByRole("button", { name: "Ajouter un texte / chapitre", exact: true })
    .click();
  await page
    .getByLabel("Contenu du texte", { exact: true })
    .last()
    .fill("Dubrovnik");
  await page
    .getByLabel("Position du texte", { exact: true })
    .last()
    .selectOption("top-left");
  await page.getByLabel("Animation", { exact: true }).selectOption("pan_right");
  await page.getByRole("button", { name: "Dupliquer", exact: true }).click();
  await page
    .getByRole("button", { name: "Retirer du montage", exact: true })
    .click();
  await saved(page);
  await page
    .getByRole("button", { name: "Ajouter un média", exact: true })
    .click();
  await saved(page);
  await select(page, 1);
  await page
    .getByLabel("Contenu du texte", { exact: true })
    .first()
    .fill("Croatie en famille");
  await saved(page);
  await page.screenshot({
    path: "test-results/studio-editor-text.png",
    fullPage: true,
  });
  await render(page, a.id);
});
test("Lot G avant après : remplacement et structure conservée", async ({
  page,
}) => {
  test.setTimeout(600000);
  const a = await setup(page, "Avant Après", "avant-apres", 4, 0);
  await select(page, 2);
  await page
    .getByLabel("Média à ajouter ou remplacer", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Remplacer le média", exact: true })
    .click();
  await page
    .getByLabel("Contenu du texte", { exact: true })
    .first()
    .fill("Avant travaux");
  await page
    .getByRole("button", { name: "Déplacer à droite", exact: true })
    .click();
  await saved(page);
  await select(page, 4);
  await page
    .getByLabel("Média à ajouter ou remplacer", { exact: true })
    .selectOption({ index: 3 });
  await page
    .getByRole("button", { name: "Remplacer le média", exact: true })
    .click();
  await saved(page);
  const d = (await montage(page, a.id)).active;
  expect(d.clips[3].asset_id).not.toBe(a.initial.clips[3].asset_id);
  expect(
    d.clips.find((c: { id: string }) => c.id === a.initial.clips[1].id)
      .asset_id,
  ).not.toBe(a.initial.clips[1].asset_id);
  expect(d.presentation.template.id).toBe("avant-apres");
  expect(
    d.presentation.overlays.some(
      (o: { text: string }) => o.text === "Avant travaux",
    ),
  ).toBe(true);
  await render(page, a.id);
});
test("Lot G mobile et tablette : édition puis rendu", async ({ page }) => {
  test.setTimeout(600000);
  await page.setViewportSize({ width: 390, height: 844 });
  const a = await setup(page, "Mobile Studio");
  await select(page, 2);
  await page
    .getByRole("button", { name: "Déplacer à droite", exact: true })
    .click();
  await page.getByLabel("Durée du clip (secondes)", { exact: true }).fill("2");
  await page.getByLabel("Transition", { exact: true }).selectOption("cut");
  await select(page, 1);
  await page
    .getByLabel("Contenu du texte", { exact: true })
    .first()
    .fill("Édition mobile");
  await saved(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-editor-mobile.png",
    fullPage: true,
  });
  for (const viewport of [
    { width: 820, height: 1180 },
    { width: 1180, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await render(page, a.id);
});
test("Lot G viewer et workspace B : refus de mutation et accès privés", async ({
  page,
  browser,
}) => {
  const a = await setup(page);
  const context = await browser.newContext(),
    p = await context.newPage(),
    b = await user(p);
  let r = await request(p, `/api/timelines/${a.id}`, {
    action: "saveEditor",
    timeline: a.initial.id,
    revision: a.initial.revision,
    draft: a.initial,
  });
  expect([403, 404]).toContain(r.status);
  const member = await a.api.rpc("studio_set_member", {
    p_workspace_id: a.workspace,
    p_user_id: b.id,
    p_role: "viewer",
  });
  expect(member.error).toBeNull();
  await p.goto(`/projects/${a.id}/editor`);
  await expect(p.getByText("Lecture seule", { exact: true })).toBeVisible();
  await expect(
    p.getByRole("button", { name: "Créer la vidéo", exact: true }),
  ).toHaveCount(0);
  await expect(
    p.getByRole("button", { name: "Retirer du montage", exact: true }),
  ).toHaveCount(0);
  await expect(
    p.getByLabel("Contenu du texte", { exact: true }).first(),
  ).toBeDisabled();
  r = await request(p, `/api/timelines/${a.id}`, {
    action: "saveEditor",
    timeline: a.initial.id,
    revision: a.initial.revision,
    draft: a.initial,
  });
  expect(r.status).toBe(403);
  await p.screenshot({
    path: "test-results/studio-editor-viewer.png",
    fullPage: true,
  });
  await context.close();
});
test("Lot G autosave stress et réseau coupé : dernier état conservé", async ({
  page,
}) => {
  const a = await setup(page);
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/timelines/")) writes++;
  });
  const text = page.getByLabel("Contenu du texte", { exact: true }).first();
  await text.fill("Rapide");
  await text.pressSequentially(" été à Strasbourg", { delay: 10 });
  await saved(page);
  expect(writes).toBeLessThanOrEqual(2);
  expect((await montage(page, a.id)).active.presentation.overlays[0].text).toBe(
    "Rapide été à Strasbourg",
  );
  await page.route(`**/api/timelines/${a.id}`, (route) =>
    route.request().method() === "POST"
      ? route.abort("failed")
      : route.continue(),
  );
  await text.fill("Conservé hors réseau");
  await expect(
    page.getByText("Erreur de sauvegarde", { exact: true }),
  ).toBeVisible();
  await expect(text).toHaveValue("Conservé hors réseau");
  await text.fill("Dernier changement hors réseau");
  await expect(
    page.getByRole("button", { name: "Réessayer la sauvegarde", exact: true }),
  ).toBeVisible();
  await page.unroute(`**/api/timelines/${a.id}`);
  await page
    .getByRole("button", { name: "Réessayer la sauvegarde", exact: true })
    .click();
  await saved(page);
  await page.reload();
  await expect(
    page.getByLabel("Contenu du texte", { exact: true }).first(),
  ).toHaveValue("Dernier changement hors réseau");
});
test("Lot G deux onglets : conflit sans écrasement", async ({ page }) => {
  const a = await setup(page),
    second = await page.context().newPage();
  await second.goto(`/projects/${a.id}/editor`);
  await expect(second.getByText("Enregistré", { exact: true })).toBeVisible();
  await page
    .getByLabel("Contenu du texte", { exact: true })
    .first()
    .fill("Version onglet A");
  await saved(page);
  await second
    .getByLabel("Contenu du texte", { exact: true })
    .first()
    .fill("Version onglet B");
  await expect(
    second.getByText("Conflit de version", { exact: true }),
  ).toBeVisible();
  expect((await montage(page, a.id)).active.presentation.overlays[0].text).toBe(
    "Version onglet A",
  );
  await expect(
    second.getByLabel("Contenu du texte", { exact: true }).first(),
  ).toHaveValue("Version onglet B");
  await second.close();
});
test("Lot G 10 100 500 clips : DOM borné sélection et déplacement", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const a = await setup(page, "Performance Studio", "chantier-pro", 1, 0),
    base = (await montage(page, a.id)).active;
  const clip = base.clips.find(
      (c: { clip_type: string }) => c.clip_type === "image",
    ),
    metrics = [];
  for (const count of [10, 100, 500]) {
    const current = (await montage(page, a.id)).active;
    const clips = Array.from({ length: count }, (_, i) => ({
      ...clip,
      id: randomUUID(),
      metadata_json: { ...clip.metadata_json, key: `perf-${i}` },
      duration_ms: 1000,
      sort_order: i,
      timeline_start_ms: i * 1000,
      timeline_end_ms: (i + 1) * 1000,
      transition_in: "cut",
      transition_duration_ms: 0,
    }));
    const r = await request(page, `/api/timelines/${a.id}`, {
      action: "saveEditor",
      timeline: current.id,
      revision: current.revision,
      draft: { clips, presentation: null },
    });
    expect(r.status).toBe(200);
    const start = Date.now();
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: `Montage · ${count} clips`,
        exact: true,
      }),
    ).toBeVisible();
    const openMs = Date.now() - start;
    expect(
      await page.locator("[data-editor-clip]").count(),
    ).toBeLessThanOrEqual(18);
    const selection = Date.now();
    await select(page, count);
    await expect(
      page.locator("[data-editor-clip][aria-pressed=true]"),
    ).toHaveCount(1);
    const selectMs = Date.now() - selection;
    const reorder = Date.now();
    await page
      .getByRole("button", { name: "Déplacer à gauche", exact: true })
      .click();
    await saved(page);
    const reorderMs = Date.now() - reorder;
    const persisted = (await montage(page, a.id)).active;
    expect(persisted.clips[count - 2].id).toBe(clips[count - 1].id);
    metrics.push({
      count,
      openMs,
      selectMs,
      reorderMs,
      ...(await page.evaluate(() => ({
        nodes: document.querySelectorAll("*").length,
        heap: (
          performance as Performance & { memory?: { usedJSHeapSize: number } }
        ).memory?.usedJSHeapSize,
      }))),
    });
  }
  await info.attach("editor-performance", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  await page.screenshot({
    path: "test-results/studio-editor-500.png",
    fullPage: true,
  });
});
