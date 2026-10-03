import { contexte, check, q1, fermer, entrepriseId, OUT } from "./lib.mjs";
import fs from "node:fs";
const eid = await entrepriseId();
const etatD = JSON.parse(fs.readFileSync(`${OUT}/etat-devis.json`, "utf8"));
const ctx = await contexte("gerant"); const page = await ctx.newPage();
await check("S2 Prospection/Devis", "Correctif B07 : chantier avec fin prévue avant le début refusé", async () => {
  await page.goto("/chantiers/nouveau"); const f = page.locator("main form").first();
  const cli = await q1("select id from clients where entreprise_id=$1 and nom='Mairie de Testheim'", [eid]);
  await f.locator('[name="nom"]').fill("Chantier dates inversées B07"); await f.locator('[name="client_id"]').selectOption(cli.id);
  await f.locator('[name="date_debut_prevue"]').fill("2026-12-10"); await f.locator('[name="date_fin_prevue"]').fill("2026-11-01");
  await Promise.all([page.waitForURL(/error=|chantiers\/[0-9a-f-]{36}/), f.locator('button[type="submit"]').last().click()]);
  const c = await q1("select 1 x from chantiers where nom='Chantier dates inversées B07'");
  return { ok: !c, detail: decodeURIComponent(new URL(page.url()).searchParams.get("error") ?? "") };
});
await check("S2 Prospection/Devis", "Correctif B06 : dates imprimées au format JJ/MM/AAAA (devis et facture)", async () => {
  const d = await q1("select date_emission from devis where id=$1", [etatD.d1]);
  await page.goto(`/imprimer/devis/${etatD.d1}`); const t = await page.locator("body").innerText();
  const attendu = d.date_emission.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  return { ok: t.includes(`Émis le ${attendu}`) && !/Émis le \d{4}-/.test(t), detail: (t.match(/Émis le [^\n]+/) ?? [""])[0] + " | " + (t.match(/Valable jusqu'au [^\n]+/) ?? [""])[0] };
});
await ctx.close(); await fermer();
