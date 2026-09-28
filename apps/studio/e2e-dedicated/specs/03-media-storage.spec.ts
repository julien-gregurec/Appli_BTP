// MEDIA / STORAGE — import tus réel vers storage-api (supabase/storage, backend fichier), URL
// signée, vignette, suppression puis purge Storage réelle (garde Storage de la chaîne dédiée).
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { api, closeAll, createProject, env, mediaFixtures, quote, studioSql, studioUser, uploadMedia, waitFor } from "./harness";

test("upload tus → storage-api réel, URL signée, vignette, suppression et purge Storage", async ({ browser }) => {
  const f = await mediaFixtures();
  const u = await studioUser(browser, "media");
  const projectId = await createProject(u.page, u.workspace, "Projet médias");
  const uploaded = await uploadMedia(u.page, projectId, [f.jpg, f.png, f.mp4]);
  expect(uploaded).toHaveLength(3);
  const by = (n: string) => uploaded.find((a) => a.name === n)!;
  const assets = [by("photo-chantier.jpg"), by("logo-entreprise.png"), by("clip.mp4")];
  await u.page.reload();
  for (const a of assets) await expect(u.page.locator("article.media-card", { hasText: a.name })).toContainText("Prêt");

  // Objets réellement présents dans storage-api (métadonnées + octets sur disque).
  for (const a of assets) {
    expect(a.key.startsWith(`studio/${u.workspace}/${projectId}/`)).toBe(true);
    expect(studioSql(`select count(*) from storage.objects where bucket_id='studio-originals' and name=${quote(a.key)}`)).toBe("1");
  }
  const video = studioSql(`select media_type || '|' || coalesce(duration_ms,0) || '|' || width from studio_media_assets where id = ${quote(assets[2].id)}`);
  expect(video).toMatch(/^video\|(19|20|21)\d\d\|320$/);

  // URL signée (courte) servie par storage-api ; altérée → refusée ; anonyme → refusé.
  const signed = await api(u.page, "GET", `/api/media/assets/${assets[0].id}/preview`);
  expect(signed.status).toBe(200);
  const url = String((signed.body as { url: string }).url);
  expect(url).toContain("/storage/v1/object/sign/studio-originals/");
  const token = new URL(url).searchParams.get("token")!;
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  const fetched = await u.page.evaluate(async (href) => {
    const r = await fetch(href);
    return { status: r.status, type: r.headers.get("content-type"), size: (await r.arrayBuffer()).byteLength };
  }, url);
  expect(fetched.status).toBe(200);
  expect(fetched.type).toContain("image/jpeg");
  expect(fetched.size).toBeGreaterThan(500);
  const tampered = await u.page.evaluate(async (href) => (await fetch(href.replace(/token=([^&]+)/, (_, t) => `token=${t.slice(0, -3)}abc`))).status, url);
  expect(tampered).toBeGreaterThanOrEqual(400);
  const direct = await u.page.evaluate(
    async ({ base, key }) => (await fetch(`${base}/storage/v1/object/studio-originals/${key}`)).status,
    { base: env("NEXT_PUBLIC_SUPABASE_URL"), key: assets[0].key },
  );
  expect(direct).toBeGreaterThanOrEqual(400);
  // Vignette calculée à la volée (non stockée).
  const thumb = await u.page.evaluate(async (id) => {
    const r = await fetch(`/api/media/assets/${id}/thumbnail`);
    return { status: r.status, type: r.headers.get("content-type"), cache: r.headers.get("cache-control") };
  }, assets[0].id);
  expect(thumb.status).toBe(200);
  expect(thumb.type).toMatch(/image\//);
  expect(thumb.cache).toMatch(/private/);

  // Autre compte : aucune URL signée.
  const other = await studioUser(browser, "media-x");
  expect([403, 404]).toContain((await api(other.page, "GET", `/api/media/assets/${assets[0].id}/preview`)).status);

  // Suppression en interface, puis purge Storage réelle (réconciliation --apply, clé service).
  await u.page.goto(`/projects/${projectId}`);
  u.page.once("dialog", (d) => void d.accept());
  await u.page.getByRole("button", { name: `Supprimer ${assets[1].name}` }).click();
  await waitFor(() => studioSql(`select deleted_at is not null from studio_media_assets where id = ${quote(assets[1].id)}`), (v) => v === "t");
  expect([403, 404, 410]).toContain((await api(u.page, "GET", `/api/media/assets/${assets[1].id}/preview`)).status);
  // Délai technique de corbeille (purge_after = +30 h, défini par la migration média) : avancé ici
  // par le banc (voyage dans le temps sur base jetable), la purge elle-même est réelle.
  studioSql(`update studio_media_assets set purge_after = now() - interval '1 second' where id = ${quote(assets[1].id)}`);
  const out = execFileSync(process.execPath, ["scripts/storage-reconcile.mjs", "--apply"], { cwd: join(import.meta.dirname, "../.."), encoding: "utf8", env: process.env });
  const summary = JSON.parse(out.trim().split("\n").pop()!);
  expect(summary.errors).toBe(0);
  expect(summary.purged).toBeGreaterThanOrEqual(1);
  expect(studioSql(`select count(*) from storage.objects where name = ${quote(assets[1].key)}`)).toBe("0");
  expect(studioSql(`select purged_at is not null from studio_media_assets where id = ${quote(assets[1].id)}`)).toBe("t");
  expect(existsSync(join(env("E2E_DIR"), "storage-data"))).toBe(true);
  // Un objet encore référencé ne peut PAS être supprimé, même avec la clé service (garde Storage).
  const guarded = await fetch(`${env("NEXT_PUBLIC_SUPABASE_URL")}/storage/v1/object/studio-originals`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${env("STUDIO_STORAGE_SERVICE_KEY")}`, apikey: env("STUDIO_STORAGE_SERVICE_KEY"), "content-type": "application/json" },
    body: JSON.stringify({ prefixes: [assets[0].key] }),
  });
  expect(studioSql(`select count(*) from storage.objects where name = ${quote(assets[0].key)}`), `DELETE → ${guarded.status}`).toBe("1");
  await closeAll(u.context, other.context);
});
