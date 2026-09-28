// RGPD — compte ELSATIA supprimé : session invalidée, demande d'effacement créée (même transaction
// que l'événement signé), mode off par défaut, DECISION_REQUIRED bloquant, effacement complet
// (base + objets storage-api + utilisateur GoTrue Studio), rejeu idempotent.
//
// Politique d'effacement : le produit la laisse à 'off' sans délai (DÉCISION JURIDIQUE, aucune
// durée choisie ici). Le banc pose, sur sa base JETABLE uniquement, mode 'execute' avec la référence
// de décision fictive E2E-TEST-ONLY et un délai de grâce nul pour exécuter la mécanique ; la
// politique est remise à 'off' / NULL à la fin. Ce n'est pas une valeur de production.
import { expect, test } from "@playwright/test";
import {
  api,
  central,
  closeAll,
  createProject,
  env,
  mediaFixtures,
  quote,
  studioSql,
  studioUser,
  uploadMedia,
} from "./harness";

test.describe.configure({ mode: "serial" });

async function erasureCycle() {
  const res = await fetch(`${env("NEXT_PUBLIC_STUDIO_URL")}/api/elsatia/erasure`, {
    method: "POST",
    headers: { authorization: `Bearer ${env("STUDIO_CRON_SECRET")}` },
  });
  return { status: res.status, body: (await res.json()) as Record<string, number | string> };
}
const TEST_POLICY = "update studio_identity.erasure_policy set mode = 'execute', decision_ref = 'E2E-TEST-ONLY', grace_period = interval '0'";
const PRODUCT_POLICY = "update studio_identity.erasure_policy set mode = 'off', decision_ref = null, grace_period = null";

test.afterAll(() => {
  studioSql(PRODUCT_POLICY);
});

test("compte supprimé : session invalidée, demande créée, rien exécuté en mode off ; route protégée", async ({ browser }) => {
  studioSql(PRODUCT_POLICY);
  const u = await studioUser(browser, "rgpd-off");
  await createProject(u.page, u.workspace, "Données à effacer");
  const subject = studioSql(`select subject from studio_identity.links where user_id = ${quote(u.studioUserId)}`);
  const del = (await central("/__e2e/delete", { email: u.account.email })) as { dispatched: { delivered: number; failed: number } };
  expect(del.dispatched.failed).toBe(0);
  // Session invalidée.
  await u.page.goto(`/dashboard?workspace=${u.workspace}`);
  await expect(u.page).toHaveURL(/\/login/);
  expect(studioSql(`select account from studio_identity.subject_state where subject = ${quote(subject)}`)).toBe("deleted");
  expect(studioSql(`select count(*) from auth.sessions where user_id = ${quote(u.studioUserId)}`)).toBe("0");
  // Demande d'effacement ouverte dans la même transaction.
  expect(studioSql(`select status from studio_identity.erasure_requests where subject = ${quote(subject)}`)).toBe("pending");
  // Route protégée ; mode off : rien exécuté.
  expect((await fetch(`${env("NEXT_PUBLIC_STUDIO_URL")}/api/elsatia/erasure`, { method: "POST" })).status).toBe(401);
  const cycle = await erasureCycle();
  expect(cycle.status).toBe(200);
  expect(cycle.body.mode).toBe("off");
  expect(studioSql(`select status from studio_identity.erasure_requests where subject = ${quote(subject)}`)).toBe("pending");
  expect(studioSql(`select count(*) from studio_projects where workspace_id = ${quote(u.workspace)}`)).toBe("1");
  // Politique produit : exécution impossible sans décision écrite ni délai décidé (contrainte base).
  expect(() => studioSql("update studio_identity.erasure_policy set mode = 'execute'")).toThrow();
  await closeAll(u.context);
});

test("DECISION_REQUIRED : contenus créés chez autrui → awaiting_decision, rien touché", async ({ browser }) => {
  const owner = await studioUser(browser, "rgpd-owner");
  const member = await studioUser(browser, "rgpd-member");
  // Le futur effacé est éditeur chez autrui et y crée un projet.
  await owner.page.goto(`/settings/members?workspace=${owner.workspace}`);
  await owner.page.getByLabel("Identifiant utilisateur ELSATIA").fill(member.studioUserId);
  await owner.page.locator("form", { has: owner.page.getByLabel("Identifiant utilisateur ELSATIA") }).getByLabel("Rôle").selectOption("editor");
  await owner.page.getByRole("button", { name: "Ajouter le membre" }).click();
  await expect(owner.page.locator(".member-list").first()).toContainText(member.studioUserId);
  const shared = await createProject(member.page, owner.workspace, "Projet de l'éditeur chez autrui");
  const personal = await createProject(member.page, member.workspace, "Projet personnel");
  const subject = studioSql(`select subject from studio_identity.links where user_id = ${quote(member.studioUserId)}`);

  await central("/__e2e/delete", { email: member.account.email });
  studioSql(TEST_POLICY);
  const cycle = await erasureCycle();
  expect(cycle.status).toBe(200);
  expect(studioSql(`select status from studio_identity.erasure_requests where subject = ${quote(subject)}`)).toBe("awaiting_decision");
  const plan = JSON.parse(studioSql(`select plan::text from studio_identity.erasure_requests where subject = ${quote(subject)}`));
  expect(plan.decision_required.authored_in_shared_workspaces).toBe(1);
  // Cas NON décidé (contenu créé chez autrui) : rien touché. Cas décidés (classe DELETE : espace
  // dont la personne est seule membre) : effacés. Clôture bloquée : compte Auth Studio conservé.
  expect(studioSql(`select count(*) from studio_projects where id = ${quote(shared)} and deleted_at is null`)).toBe("1");
  expect(studioSql(`select created_by from studio_projects where id = ${quote(shared)}`)).toBe(member.studioUserId);
  expect(studioSql(`select count(*) from studio_projects where id = ${quote(personal)}`)).toBe("0");
  expect(studioSql(`select count(*) from studio_workspaces where id = ${quote(member.workspace)}`)).toBe("0");
  expect(studioSql(`select count(*) from auth.users where id = ${quote(member.studioUserId)}`)).toBe("1");
  expect(studioSql(`select completed_at is null from studio_identity.erasure_requests where subject = ${quote(subject)}`)).toBe("t");
  // Rejeu : même verdict, aucune erreur.
  const again = await erasureCycle();
  expect(Number(again.body.errors)).toBe(0);
  expect(studioSql(`select status from studio_identity.erasure_requests where subject = ${quote(subject)}`)).toBe("awaiting_decision");
  studioSql(PRODUCT_POLICY);
  await closeAll(owner.context, member.context);
});

test("effacement complet (base + storage-api + GoTrue Studio) puis rejeu idempotent", async ({ browser }) => {
  test.setTimeout(420_000);
  const f = await mediaFixtures();
  const u = await studioUser(browser, "rgpd-full");
  const projectId = await createProject(u.page, u.workspace, "Tout effacer");
  const media = await uploadMedia(u.page, projectId, [f.jpg, f.mp4]);
  // Un rendu publié (objet studio-renders) et un lien public.
  await u.page.goto(`/projects/${projectId}`);
  await u.page.getByRole("button", { name: "Préparer le montage", exact: true }).click();
  const panel = u.page.getByRole("region", { name: "Vidéo exportée" });
  await panel.getByRole("button", { name: "Créer la vidéo", exact: true }).click();
  await expect(panel.locator("[data-render-job]").first().getByRole("status")).toContainText("Terminé", { timeout: 240_000 });
  const outputId = studioSql(`select o.id from studio_render_outputs o where o.project_id = ${quote(projectId)}`);
  const share = await api(u.page, "POST", `/api/renders/${projectId}`, { action: "share", output: outputId, days: 7 });
  expect(share.status).toBe(202);
  const shareUrl = String(share.body.url);
  const keys = studioSql(
    `select string_agg(name, ',') from storage.objects where name like ${quote(`studio/${u.workspace}/%`)}`,
  ).split(",");
  expect(keys.length).toBeGreaterThanOrEqual(3);
  const subject = studioSql(`select subject from studio_identity.links where user_id = ${quote(u.studioUserId)}`);

  await central("/__e2e/delete", { email: u.account.email });
  // Lien public coupé dès la suppression (compte non actif), avant tout effacement.
  const visitor = await browser.newContext();
  const v = await visitor.newPage();
  await v.goto(shareUrl);
  await expect(v.getByRole("heading", { name: "Lien indisponible" })).toBeVisible();

  studioSql(TEST_POLICY);
  let status = "";
  for (let i = 0; i < 6 && status !== "completed"; i++) {
    const c = await erasureCycle();
    expect(Number(c.body.errors), JSON.stringify(c.body)).toBe(0);
    status = studioSql(`select status from studio_identity.erasure_requests where subject = ${quote(subject)}`);
  }
  expect(status).toBe("completed");
  // Base : espace, projet, médias, rendus, liens effacés.
  expect(studioSql(`select count(*) from studio_workspaces where id = ${quote(u.workspace)}`)).toBe("0");
  expect(studioSql(`select count(*) from studio_media_assets where id in (${media.map((m) => quote(m.id)).join(",")})`)).toBe("0");
  expect(studioSql(`select count(*) from studio_render_shares where output_id = ${quote(outputId)}`)).toBe("0");
  // Storage réel : plus aucun objet sous le préfixe de l'espace ; file vidée.
  expect(studioSql(`select count(*) from storage.objects where name like ${quote(`studio/${u.workspace}/%`)}`)).toBe("0");
  expect(studioSql(`select count(*) from studio_identity.erasure_storage_queue q join studio_identity.erasure_requests r on r.id = q.request_id where r.subject = ${quote(subject)} and q.status <> 'deleted'`)).toBe("0");
  // Auth Studio : utilisateur supprimé, lien effacé.
  expect(studioSql(`select count(*) from auth.users where id = ${quote(u.studioUserId)}`)).toBe("0");
  expect(studioSql(`select count(*) from studio_identity.links where subject = ${quote(subject)}`)).toBe("0");
  // Journal : preuve sans donnée personnelle.
  const journal = studioSql(`select string_agg(e.detail::text, ' ') from studio_identity.erasure_events e join studio_identity.erasure_requests r on r.id = e.request_id where r.subject = ${quote(subject)}`);
  expect(journal).not.toContain(u.account.email);

  // Rejeu idempotent : cycle et événement signé rejoués → aucun changement, aucune erreur.
  const events = studioSql("select count(*) from studio_identity.lifecycle_events");
  const replay = await erasureCycle();
  expect(Number(replay.body.errors)).toBe(0);
  expect(studioSql(`select status from studio_identity.erasure_requests where subject = ${quote(subject)}`)).toBe("completed");
  await central("/api/cron/elsatia-identity");
  expect(studioSql("select count(*) from studio_identity.lifecycle_events")).toBe(events);
  const lastEvent = studioSql(`select jti from studio_identity.lifecycle_events where subject = ${quote(subject)} order by received_at desc nulls last limit 1`);
  expect(lastEvent).not.toBe("");
  studioSql(PRODUCT_POLICY);
  await closeAll(u.context, visitor);
});
