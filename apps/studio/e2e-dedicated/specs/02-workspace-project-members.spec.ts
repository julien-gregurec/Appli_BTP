// POST-H — espace, projet, membres (navigateur réel, chaîne dédiée, isolation par RLS réelle).
import { expect, test } from "@playwright/test";
import { api, closeAll, createProject, quote, studioSql, studioUser } from "./harness";

test("espace personnel, renommage, espace professionnel ; projet créé en interface ; isolation entre comptes", async ({ browser }) => {
  const a = await studioUser(browser, "ws-a");
  const b = await studioUser(browser, "ws-b");
  const { page } = a;
  // Idempotence de l'espace personnel.
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Ouvrir mon Studio personnel" }).click();
  await expect(page).toHaveURL(new RegExp(`workspace=${a.workspace}`));
  // Renommage.
  await page.goto(`/settings?workspace=${a.workspace}`);
  await page.getByLabel("Nom de l’espace").fill("Atelier E2E dédié");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByLabel("Espace actif")).toContainText("Atelier E2E dédié");
  expect(studioSql(`select name from studio_workspaces where id = ${quote(a.workspace)}`)).toBe("Atelier E2E dédié");
  // Espace professionnel.
  await page.getByLabel("Nom du nouvel espace").fill("Pro E2E");
  await page.getByRole("button", { name: "Créer l’espace" }).click();
  await expect(page).toHaveURL(/\/dashboard\?workspace=/);
  const pro = new URL(page.url()).searchParams.get("workspace")!;
  expect(pro).not.toBe(a.workspace);
  expect(studioSql(`select workspace_type from studio_workspaces where id = ${quote(pro)}`)).toBe("professional");

  // Projet créé par le formulaire.
  await page.goto(`/projects?workspace=${a.workspace}`);
  await page.getByLabel("Nom du projet").fill("Chantier démo dédié");
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/);
  const projectId = /\/projects\/([0-9a-f-]{36})/.exec(page.url())![1];
  await expect(page.getByRole("heading", { name: /Chantier démo dédié/ })).toBeVisible();
  expect(studioSql(`select workspace_id from studio_projects where id = ${quote(projectId)}`)).toBe(a.workspace);

  // Isolation : B ne voit ni l'espace ni le projet de A (404), ni par l'API.
  const denied = await b.page.goto(`/projects/${projectId}`);
  expect(denied?.status()).toBe(404);
  // Page à chargement progressif (loading.tsx) : statut 200 possible, contenu « introuvable ».
  await b.page.goto(`/dashboard?workspace=${a.workspace}`);
  await expect(b.page.getByRole("heading", { name: "Page ou espace inaccessible." })).toBeVisible();
  await expect(b.page.getByText("Atelier E2E dédié")).toHaveCount(0);
  const r = await api(b.page, "GET", `/api/projects/${projectId}`);
  expect([403, 404]).toContain(r.status);
  await closeAll(a.context, b.context);
});

test("membres : ajout par identifiant, rôle lecteur (lecture sans écriture), retrait", async ({ browser }) => {
  const owner = await studioUser(browser, "mb-owner");
  const guest = await studioUser(browser, "mb-guest");
  const projectId = await createProject(owner.page, owner.workspace, "Projet partagé");
  const { page } = owner;
  await page.goto(`/settings/members?workspace=${owner.workspace}`);
  await page.getByLabel("Identifiant utilisateur ELSATIA").fill(guest.studioUserId);
  await page.locator("form", { has: page.getByLabel("Identifiant utilisateur ELSATIA") }).getByLabel("Rôle").selectOption("viewer");
  await page.getByRole("button", { name: "Ajouter le membre" }).click();
  await expect(page.locator(".member-list").first()).toContainText(guest.studioUserId);
  expect(studioSql(`select role from studio_workspace_members where workspace_id=${quote(owner.workspace)} and user_id=${quote(guest.studioUserId)}`)).toBe("viewer");

  // Le lecteur voit le projet mais ne peut pas le modifier (refus applicatif + base).
  const g = guest.page;
  await g.goto(`/projects/${projectId}`);
  await expect(g.getByRole("heading", { name: /Projet partagé/ })).toBeVisible();
  const project = (await api(g, "GET", `/api/projects/${projectId}`)).body as { revision: number };
  const write = await api(g, "POST", `/api/projects/${projectId}`, {
    revision: project.revision,
    project: { name: "piraté", project_type: "free", description: "", location_label: "", started_at: null, ended_at: null, target_duration_seconds: null, target_aspect_ratio: "16:9", status: "draft", metadata_json: {} },
  });
  expect(write.status).toBeGreaterThanOrEqual(400);
  expect(studioSql(`select name from studio_projects where id=${quote(projectId)}`)).toBe("Projet partagé");
  // Le lecteur ne gère pas les membres.
  await g.goto(`/settings/members?workspace=${owner.workspace}`);
  await expect(g.getByRole("button", { name: "Ajouter le membre" })).toHaveCount(0);

  // Retrait : l'espace disparaît pour l'invité.
  await page.goto(`/settings/members?workspace=${owner.workspace}`);
  const row = page.locator(".member-list li", { hasText: guest.studioUserId });
  await row.getByLabel("Rôle").selectOption("remove");
  await row.getByRole("button", { name: "Appliquer" }).click();
  await expect(page.locator(".member-list li", { hasText: guest.studioUserId })).toHaveCount(0);
  expect((await g.goto(`/projects/${projectId}`))?.status()).toBe(404);
  await closeAll(owner.context, guest.context);
});
