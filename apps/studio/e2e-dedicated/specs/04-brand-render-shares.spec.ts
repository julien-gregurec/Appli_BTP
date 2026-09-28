// POST-H — identité de marque, rendu RÉEL par le worker (BullMQ/Redis, ffmpeg, storage-api),
// export (URL signée, téléchargement), liens publics (valide, révocation, compte propriétaire
// désactivé, expiration, URL déjà émise ≤ 60 s).
import { expect, test, type Page } from "@playwright/test";
import { readdirSync } from "node:fs";
import { api, central, closeAll, createProject, env, mediaFixtures, quote, studioSql, studioUser, uploadMedia, waitFor } from "./harness";

test.describe.configure({ mode: "serial" });

async function renderVideo(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "Préparer le montage", exact: true }).click();
  await expect(page.locator(".montage-clip").first()).toBeVisible();
  const panel = page.getByRole("region", { name: "Vidéo exportée" });
  await panel.getByRole("button", { name: "Créer la vidéo", exact: true }).click();
  const job = panel.locator("[data-render-job]").first();
  await expect(job).toBeVisible();
  await expect(job.getByRole("status")).toContainText("Terminé", { timeout: 240_000 });
  const jobId = (await job.getAttribute("data-render-job"))!;
  return { panel, job, jobId };
}

test("identité de marque + rendu worker réel + export signé + liens publics", async ({ browser }) => {
  test.setTimeout(420_000);
  const f = await mediaFixtures();
  const owner = await studioUser(browser, "share-owner");
  const { page } = owner;
  const projectId = await createProject(page, owner.workspace, "Film chantier dédié");
  const media = await uploadMedia(page, projectId, [f.jpg, f.png, f.mp4]);
  const logo = media.find((m) => m.name === "logo-entreprise.png")!;

  // --- Identité de marque (Brand Kit) ---
  await page.goto(`/brand-kit?workspace=${owner.workspace}`);
  await page.getByLabel("Nom de l’entreprise").fill("Bâtisseurs E2E");
  await page.getByLabel("Signature (texte de fin par défaut)").fill("Construire juste");
  await page.getByLabel("Téléphone").fill("+33 3 00 00 00 00");
  await page.getByLabel("Site web").fill("https://example.test");
  await page.getByLabel("Logo").selectOption(logo.id);
  await page.getByRole("button", { name: "Enregistrer l’identité de marque" }).click();
  await expect(page.getByText("Identité de marque enregistrée.")).toBeVisible();
  expect(studioSql(`select company_name || '|' || logo_asset_id from studio_brand_kits where workspace_id = ${quote(owner.workspace)}`)).toBe(`Bâtisseurs E2E|${logo.id}`);

  // --- Rendu réel ---
  const { panel, job, jobId } = await renderVideo(page, projectId);
  expect(studioSql(`select status from studio_render_jobs where id = ${quote(jobId)}`)).toBe("completed");
  const outputId = studioSql(`select id from studio_render_outputs where render_job_id = ${quote(jobId)}`);
  const outputKey = studioSql(`select storage_key from studio_render_outputs where render_job_id = ${quote(jobId)}`);
  expect(outputKey).toMatch(new RegExp(`^studio/${owner.workspace}/${projectId}/renders/${jobId}/`));
  expect(studioSql(`select count(*) from storage.objects where bucket_id='studio-renders' and name=${quote(outputKey)}`)).toBe("1");
  // Journal d'usage (trigger de publication, chemin render_worker), idempotent par job.
  expect(studioSql(`select string_agg(kind, ',' order by kind) from studio_usage_events where job_id = ${quote(jobId)}`)).toBe("export,render_seconds");
  // Cleanup : répertoire de travail du worker supprimé.
  await waitFor(() => readdirSync(env("STUDIO_RENDER_TMP")).filter((d) => d.startsWith(jobId)).length, (n) => n === 0, 30_000);

  // --- Export : lecture et téléchargement par URL signée ---
  await job.getByRole("button", { name: "Voir la vidéo", exact: true }).click();
  const video = panel.getByLabel("Vidéo finale");
  await expect(video).toHaveAttribute("src", /token=/);
  const src = (await video.getAttribute("src"))!;
  const mp4 = await page.evaluate(async (href) => {
    const r = await fetch(href);
    const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, size: b.length, ftyp: String.fromCharCode(...b.slice(4, 8)) };
  }, src);
  expect(mp4.status).toBe(200);
  expect(mp4.ftyp).toBe("ftyp");
  expect(mp4.size).toBeGreaterThan(1000);
  const dl = await api(page, "POST", `/api/renders/${projectId}`, { action: "preview", output: outputId, download: true });
  expect(dl.status).toBe(202);
  expect(String(dl.body.url)).toContain("download=");

  // --- Lien public valide ---
  await job.getByRole("button", { name: "Créer un lien de partage (7 jours)" }).click();
  const linkInput = panel.getByLabel("Lien de partage");
  await expect(linkInput).toHaveValue(/\/s\/[A-Za-z0-9_-]{20,}/);
  const link = await linkInput.inputValue();
  const token = new URL(link).pathname.split("/")[2];
  expect(studioSql(`select count(*) from studio_render_shares where token_hash is not null and output_id = ${quote(outputId)}`)).toBe("1");
  // Secret jamais stocké en clair (seule son empreinte).
  expect(studioSql(`select count(*) from studio_render_shares s where s::text like '%' || ${quote(token)} || '%'`)).toBe("0");

  const visitor = await browser.newContext();
  const v = await visitor.newPage();
  await v.goto(link);
  await expect(v.getByRole("heading", { level: 1 })).toContainText("Film chantier dédié");
  const media1 = await v.evaluate(async (t) => (await (await fetch(`/s/${t}/media`)).json()) as { url: string }, token);
  const issued = new URL(media1.url);
  const issuedClaims = JSON.parse(Buffer.from(issued.searchParams.get("token")!.split(".")[1], "base64url").toString());
  expect(issuedClaims.exp - issuedClaims.iat).toBeLessThanOrEqual(60);
  expect((await v.evaluate(async (h) => (await fetch(h)).status, media1.url))).toBe(200);

  // --- Révocation ---
  await page.reload();
  const panel2 = page.getByRole("region", { name: "Vidéo exportée" });
  await panel2.getByRole("button", { name: "Révoquer ce lien" }).click();
  await expect(panel2.getByText("Lien révoqué")).toBeVisible();
  await v.goto(link);
  await expect(v.getByRole("heading", { name: "Lien indisponible" })).toBeVisible();
  expect(await v.evaluate(async (t) => (await fetch(`/s/${t}/media`)).status, token)).toBe(404);
  // URL déjà émise avant la révocation : ≤ 60 s de validité résiduelle, puis refusée par storage-api.
  const wait = Math.max(0, issuedClaims.exp * 1000 - Date.now()) + 2_000;
  expect(wait).toBeLessThanOrEqual(62_000);
  await v.waitForTimeout(wait);
  expect(await v.evaluate(async (h) => (await fetch(h)).status, media1.url)).toBeGreaterThanOrEqual(400);

  // --- Compte propriétaire désactivé : lien coupé immédiatement ; réactivé : de nouveau servi ---
  const s2 = await api(page, "POST", `/api/renders/${projectId}`, { action: "share", output: outputId, days: 7 });
  expect(s2.status).toBe(202);
  const token2 = new URL(String(s2.body.url)).pathname.split("/")[2];
  await v.goto(`/s/${token2}`);
  await expect(v.getByRole("heading", { level: 1 })).toContainText("Film chantier dédié");
  await central("/__e2e/ban", { email: owner.account.email });
  await v.goto(`/s/${token2}`);
  await expect(v.getByRole("heading", { name: "Lien indisponible" })).toBeVisible();
  await central("/__e2e/unban", { email: owner.account.email });
  await v.goto(`/s/${token2}`);
  await expect(v.getByRole("heading", { level: 1 })).toContainText("Film chantier dédié");

  // --- Expiration ---
  studioSql(`update studio_render_shares set expires_at = now() - interval '1 second' where output_id = ${quote(outputId)} and revoked_at is null`);
  await v.goto(`/s/${token2}`);
  await expect(v.getByRole("heading", { name: "Lien indisponible" })).toBeVisible();
  expect(await v.evaluate(async (t) => (await fetch(`/s/${t}/media`)).status, token2)).toBe(404);
  // Jeton inventé.
  await v.goto(`/s/${"x".repeat(43)}`);
  await expect(v.getByRole("heading", { name: "Lien indisponible" })).toBeVisible();
  await closeAll(owner.context, visitor);
});
