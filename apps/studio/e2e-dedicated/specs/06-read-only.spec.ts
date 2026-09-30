// LECTURE SEULE — session déjà ouverte ; droit Studio retiré par l'identité centrale (événement
// signé entitlement_changed) ; lectures servies ; écritures bloquées par l'application ET par la
// base (jeton réel, PostgREST réel) ; rendu déjà accepté terminé ; révocation d'exposition
// admise ; restauration des droits. Puis interrupteur opérateur global read_only.
import { expect, test } from "@playwright/test";
import {
  api,
  central,
  closeAll,
  createProject,
  mediaFixtures,
  quote,
  rpcAsUser,
  studioAccessToken,
  studioSql,
  studioUser,
  uploadMedia,
} from "./harness";

test("retrait du droit Studio sur session ouverte → lecture OK, écritures bloquées (app + base) → restauration", async ({ browser }) => {
  test.setTimeout(420_000);
  const f = await mediaFixtures();
  const u = await studioUser(browser, "ro");
  const { page } = u;
  const projectId = await createProject(page, u.workspace, "Projet lecture seule");
  const [asset] = await uploadMedia(page, projectId, [f.jpg]);
  // Rendu demandé AVANT le retrait : il doit se terminer (chemin système render_worker).
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "Préparer le montage", exact: true }).click();
  await expect(page.locator(".montage-clip").first()).toBeVisible();
  const panel = page.getByRole("region", { name: "Vidéo exportée" });
  await panel.getByRole("button", { name: "Créer la vidéo", exact: true }).click();
  await expect(panel.locator("[data-render-job]")).toHaveCount(1);
  const jobId = (await panel.locator("[data-render-job]").first().getAttribute("data-render-job"))!;
  const token = await studioAccessToken(u.context);

  // --- Activation lecture seule (session NON rouverte) ---
  const r = (await central("/__e2e/entitlement", { email: u.account.email, granted: false })) as { dispatched: { delivered: number; failed: number } };
  expect(r.dispatched.failed).toBe(0);
  expect(studioSql(`select granted from studio_identity.subject_state s join studio_identity.links l using (subject) where l.user_id = ${quote(u.studioUserId)}`)).toBe("f");

  // Lectures : la session ouverte continue à servir pages, API, URL signées.
  await page.goto(`/dashboard?workspace=${u.workspace}`);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: /Projet lecture seule/ })).toBeVisible();
  expect((await api(page, "GET", `/api/projects/${projectId}`)).status).toBe(200);
  expect((await api(page, "GET", `/api/media/assets/${asset.id}/preview`)).status).toBe(200);
  expect((await rpcAsUser(token, "studio_identity_session_status", { p_soft_max_age_s: 43200, p_hard_max_age_s: 86400 })).body).toMatchObject({
    status: "ok",
    access: "read_only",
  });

  // Rendu déjà accepté : terminé malgré la lecture seule.
  await expect
    .poll(() => studioSql(`select status from studio_render_jobs where id = ${quote(jobId)}`), { timeout: 240_000, intervals: [2000] })
    .toBe("completed");

  // Écritures bloquées — application.
  const counts = () => studioSql(`select (select count(*) from studio_projects where workspace_id=${quote(u.workspace)}) || '|' || (select count(*) from studio_render_jobs where project_id=${quote(projectId)})`);
  const before = counts();
  const create = await api(page, "POST", "/api/projects", {
    workspace: u.workspace,
    project: { name: "Interdit", project_type: "free", description: "", location_label: "", started_at: null, ended_at: null, target_duration_seconds: null, target_aspect_ratio: "16:9", status: "draft", metadata_json: {} },
  });
  expect(create.status).toBe(403);
  const render = await api(page, "POST", `/api/renders/${projectId}`, { action: "create", requestId: crypto.randomUUID(), quality: "standard" });
  expect(render.status).toBeGreaterThanOrEqual(400);
  const reserve = await api(page, "POST", `/api/media/projects/${projectId}/reserve`, { requestId: crypto.randomUUID(), name: "x.jpg", mime: "image/jpeg", size: 1000 });
  expect(reserve.status).toBeGreaterThanOrEqual(400);
  await page.goto(`/settings?workspace=${u.workspace}`);
  await page.getByLabel("Nom de l’espace").fill("Renommage interdit");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Accès Studio en lecture seule")).toBeVisible();
  await page.goto(`/brand-kit?workspace=${u.workspace}`);
  await page.getByLabel("Nom de l’entreprise").fill("Interdit SARL");
  await page.getByRole("button", { name: "Enregistrer l’identité de marque" }).click();
  await expect(page.getByText("Accès Studio en lecture seule")).toBeVisible();
  expect(counts()).toBe(before);
  expect(studioSql(`select name from studio_workspaces where id=${quote(u.workspace)}`)).not.toBe("Renommage interdit");

  // Écritures bloquées — BASE (jeton réel de la session, PostgREST réel, sans l'application).
  const direct = await rpcAsUser(token, "studio_create_project", { p_workspace: u.workspace, p_name: "Direct", p_type: "free" });
  expect(direct.status).toBe(403);
  expect(direct.body?.hint ?? direct.body?.message).toMatch(/READ_ONLY|lecture seule/i);
  const rename = await rpcAsUser(token, "studio_rename_workspace", { p_workspace_id: u.workspace, p_name: "Direct" });
  expect(rename.status).toBe(403);
  expect(counts()).toBe(before);

  // Révocation d'exposition ADMISE en lecture seule (lien public créé avant le retrait).
  const outputId = studioSql(`select id from studio_render_outputs where render_job_id = ${quote(jobId)}`);
  const shareId = studioSql(
    `insert into studio_render_shares(workspace_id, project_id, output_id, token_hash, created_by, expires_at)
     values (${quote(u.workspace)}, ${quote(projectId)}, ${quote(outputId)}, encode(extensions.digest('ro-${jobId}', 'sha256'), 'hex'), ${quote(u.studioUserId)}, now() + interval '7 days') returning id`,
  );
  const revoke = await api(page, "POST", `/api/renders/${projectId}`, { action: "revokeShare", share: shareId });
  expect(revoke.status).toBe(202);
  expect(studioSql(`select revoked_at is not null from studio_render_shares where id=${quote(shareId)}`)).toBe("t");

  // --- Restauration des droits ---
  await central("/__e2e/entitlement", { email: u.account.email, granted: true });
  const again = await api(page, "POST", "/api/projects", {
    workspace: u.workspace,
    project: { name: "Après restauration", project_type: "free", description: "", location_label: "", started_at: null, ended_at: null, target_duration_seconds: null, target_aspect_ratio: "16:9", status: "draft", metadata_json: {} },
  });
  expect(again.status, JSON.stringify(again.body)).toBe(200);
  await page.goto(`/settings?workspace=${u.workspace}`);
  await page.getByLabel("Nom de l’espace").fill("Renommé après restauration");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByLabel("Espace actif")).toContainText("Renommé après restauration");
  await closeAll(u.context);
});

test("interrupteur opérateur global read_only : écritures refusées pour tous, lectures servies, retour read_write", async ({ browser }) => {
  const u = await studioUser(browser, "ro-global");
  const projectId = await createProject(u.page, u.workspace, "Projet global");
  const token = await studioAccessToken(u.context);
  try {
    // Train V8 : le mode sûr Studio (migration dédiée 20260929180000) exige un motif pour toute
    // bascule hors read_write (journalisée) ; le banc en fournit un, la règle n'est pas assouplie.
    studioSql("update studio_guard.control set mode = 'read_only', reason = 'E2E 06 interrupteur global'");
    expect((await api(u.page, "GET", `/api/projects/${projectId}`)).status).toBe(200);
    const direct = await rpcAsUser(token, "studio_create_project", { p_workspace: u.workspace, p_name: "Global", p_type: "free" });
    expect(direct.status).toBe(403);
    await u.page.goto(`/settings?workspace=${u.workspace}`);
    await u.page.getByLabel("Nom de l’espace").fill("Refus global");
    await u.page.getByRole("button", { name: "Enregistrer" }).click();
    await expect(u.page.getByRole("alert").or(u.page.getByText(/lecture seule|refusée/))).toBeVisible();
    expect(studioSql(`select name from studio_workspaces where id=${quote(u.workspace)}`)).not.toBe("Refus global");
  } finally {
    studioSql("update studio_guard.control set mode = 'read_write', reason = null");
  }
  const ok = await rpcAsUser(token, "studio_create_project", { p_workspace: u.workspace, p_name: "Retour", p_type: "free" });
  expect(ok.status).toBe(200);
  await closeAll(u.context);
});
