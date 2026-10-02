import { contexte, check, q1, fermer, entrepriseId } from "./lib.mjs";
const P = "S1 Paramétrage"; const eid = await entrepriseId(); const ctx = await contexte("gerant"); const page = await ctx.newPage();
await check(P, "Client : formulaire incomplet (sans nom) refusé", async () => {
  const n0 = (await q1("select count(*)::int n from clients where entreprise_id=$1", [eid])).n;
  await page.goto("/clients/nouveau"); const f = page.locator("main form").first();
  await f.locator("[name=email]").fill(`sans.nom.${Date.now()}@exemple.test`);
  await Promise.all([page.waitForURL(/error=|clients\/[0-9a-f-]{36}/), f.getByRole("button", { name: "Créer le client" }).click()]);
  const n1 = (await q1("select count(*)::int n from clients where entreprise_id=$1", [eid])).n;
  const msg = await page.locator("p.bg-red-50").innerText().catch(() => null);
  return { ok: n1 === n0 && !!msg, detail: `créés=${n1 - n0} msg=${msg} (après correctif B02)` };
});
await ctx.close(); await fermer();
