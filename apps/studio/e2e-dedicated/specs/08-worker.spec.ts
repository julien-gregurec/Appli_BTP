// WORKER — workers/studio-video réel (BullMQ/Redis, ffmpeg, RPC service, storage-api) :
// job accepté → terminé (couvert aussi en 04), annulation en cours de job (arrêt, cleanup, aucun
// objet publié), révocation du compte en cours de job, publication refusée après effacement RGPD.
import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import {
  central,
  closeAll,
  createProject,
  env,
  longVideo,
  quote,
  startRender,
  studioSql,
  studioUser,
  uploadMedia,
  waitFor,
} from "./harness";

test.describe.configure({ mode: "serial" });
const jobStatus = (id: string) => studioSql(`select coalesce((select status from studio_render_jobs where id = ${quote(id)}), 'absent')`);
const scratch = (id: string) => readdirSync(env("STUDIO_RENDER_TMP")).filter((d) => d.startsWith(id)).length;
const rendersUnder = (ws: string) => Number(studioSql(`select count(*) from storage.objects where bucket_id = 'studio-renders' and name like ${quote(`studio/${ws}/%`)}`));

test("job accepté puis annulé en cours de rendu : arrêt, scratch supprimé, rien publié", async ({ browser }) => {
  test.setTimeout(420_000);
  const long = await longVideo(40);
  const u = await studioUser(browser, "wk-cancel");
  const projectId = await createProject(u.page, u.workspace, "Rendu long annulé");
  await uploadMedia(u.page, projectId, [long]);
  const { panel, jobId } = await startRender(u.page, projectId);
  // Accepté et réclamé par le worker (bail posé, progression).
  await waitFor(() => jobStatus(jobId), (s) => ["preparing", "rendering", "encoding"].includes(s), 60_000);
  expect(studioSql(`select lease_token is not null from studio_render_jobs where id = ${quote(jobId)}`)).toBe("t");
  await waitFor(() => scratch(jobId), (n) => n > 0, 30_000);
  // Annulation par l'utilisateur (révocation du job) : studio_render_progress → faux → arrêt.
  await panel.getByRole("button", { name: "Annuler le rendu" }).click();
  await waitFor(() => jobStatus(jobId), (s) => s === "cancelled", 60_000);
  await waitFor(() => scratch(jobId), (n) => n === 0, 30_000);
  expect(studioSql(`select count(*) from studio_render_outputs where render_job_id = ${quote(jobId)}`)).toBe("0");
  // Laisse au worker le temps d'une éventuelle publication tardive : aucune.
  await u.page.waitForTimeout(5_000);
  expect(rendersUnder(u.workspace)).toBe(0);
  await closeAll(u.context);
});

test("révocation du compte ELSATIA pendant le rendu : session fermée ; le rendu accepté se termine sans nouvelle admission", async ({ browser }) => {
  test.setTimeout(420_000);
  const long = await longVideo(20);
  const u = await studioUser(browser, "wk-ban");
  const projectId = await createProject(u.page, u.workspace, "Rendu pendant révocation");
  await uploadMedia(u.page, projectId, [long]);
  const { jobId } = await startRender(u.page, projectId);
  await waitFor(() => jobStatus(jobId), (s) => ["preparing", "rendering", "encoding"].includes(s), 60_000);
  await central("/__e2e/ban", { email: u.account.email });
  // Session fermée immédiatement.
  await u.page.goto(`/projects/${projectId}`);
  await expect(u.page).toHaveURL(/\/login/);
  // Chemin système render_worker : un rendu DÉJÀ accepté va à son terme (état terminal atteint,
  // scratch nettoyé) ; aucune nouvelle admission possible (session et écritures refusées).
  const final = await waitFor(() => jobStatus(jobId), (s) => ["completed", "failed", "cancelled"].includes(s), 300_000, 2000);
  expect(final).toBe("completed");
  await waitFor(() => scratch(jobId), (n) => n === 0, 30_000);
  expect(studioSql(`select count(*) from studio_render_jobs where project_id = ${quote(projectId)}`)).toBe("1");
  // Liens publics impossibles tant que le compte est désactivé (résolution coupée).
  await central("/__e2e/unban", { email: u.account.email });
  await closeAll(u.context);
});

test("publication refusée après effacement RGPD en cours de rendu", async ({ browser }) => {
  test.setTimeout(480_000);
  const long = await longVideo(40);
  const u = await studioUser(browser, "wk-erase");
  const projectId = await createProject(u.page, u.workspace, "Rendu effacé");
  await uploadMedia(u.page, projectId, [long]);
  const { jobId } = await startRender(u.page, projectId);
  await waitFor(() => jobStatus(jobId), (s) => ["rendering", "encoding"].includes(s), 90_000);
  const subject = studioSql(`select subject from studio_identity.links where user_id = ${quote(u.studioUserId)}`);
  await central("/__e2e/delete", { email: u.account.email });
  studioSql("update studio_identity.erasure_policy set mode = 'execute', decision_ref = 'E2E-TEST-ONLY', grace_period = interval '0'");
  try {
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${env("NEXT_PUBLIC_STUDIO_URL")}/api/elsatia/erasure`, { method: "POST", headers: { authorization: `Bearer ${env("STUDIO_CRON_SECRET")}` } });
      expect(res.status).toBeLessThan(300);
      if (studioSql(`select status from studio_identity.erasure_requests where subject = ${quote(subject)}`) === "completed") break;
    }
    // Job effacé en cours de route : la progression du worker échoue → arrêt, rien publié.
    expect(jobStatus(jobId)).toBe("absent");
    await waitFor(() => scratch(jobId), (n) => n === 0, 90_000, 1000);
    await u.page.waitForTimeout(10_000);
    expect(rendersUnder(u.workspace)).toBe(0);
    expect(studioSql(`select count(*) from storage.objects where name like ${quote(`studio/${u.workspace}/%`)}`)).toBe("0");
    // Et la garde Storage refuse toute publication sans bail vivant (clé service comprise).
    const put = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/studio-renders/studio/${u.workspace}/${projectId}/renders/${jobId}/x/output.mp4`, {
      method: "POST",
      headers: { authorization: `Bearer ${env("STUDIO_STORAGE_SERVICE_KEY")}`, apikey: env("STUDIO_STORAGE_SERVICE_KEY"), "content-type": "video/mp4" },
      body: new Uint8Array(1024),
    });
    expect(put.status).toBeGreaterThanOrEqual(400);
    expect(rendersUnder(u.workspace)).toBe(0);
  } finally {
    studioSql("update studio_identity.erasure_policy set mode = 'off', decision_ref = null, grace_period = null");
  }
  await closeAll(u.context);
});
