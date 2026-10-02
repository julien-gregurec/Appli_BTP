import { contexte, check, q, q1, capture, surveiller, fermer, record, entrepriseId, COMPTES, OUT } from "./lib.mjs";
import fs from "node:fs";
const P = "S3 Chantier";
const eid = await entrepriseId();
const ch = await q1("select id from chantiers where entreprise_id=$1 and nom='Rénovation maison Durand'", [eid]);
const ctx = await contexte("gerant"); const page = await ctx.newPage(); const err = surveiller(page);
page.on("dialog", (d) => d.accept());
const emp = async (role) => q1("select id from employes where entreprise_id=$1 and email=$2", [eid, COMPTES[role].email]);

const jours = ["2026-10-05", "2026-10-06", "2026-10-07"];
await check(P, "Planning : affecter salarié + chef 3 jours × 8 h", async () => {
  for (const date of jours) {
    await page.goto(`/planning?semaine=${date}`);
    const f = page.locator("main form", { has: page.getByRole("button", { name: "Ajouter au planning" }) });
    await f.locator('[name="type_activite"]').selectOption("chantier");
    await f.locator('input[role="combobox"]').fill("Rénovation maison");
    await page.getByRole("listbox").getByRole("option", { name: /Rénovation maison Durand/ }).first().click();
    await f.locator('[name="date"]').fill(date); await f.locator('[name="heures"]').fill("8"); await f.locator('[name="tache"]').fill("Maçonnerie");
    for (const r of ["salarie", "chef"]) { const e = await emp(r); await f.locator(`input[name="employe_ids"][value="${e.id}"]`).check(); }
    await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Ajouter au planning" }).click()]); await page.waitForTimeout(1200);
  }
  const a = await q("select e.email, a.date, a.heures from affectations a join employes e on e.id=a.employe_id where a.chantier_id=$1 order by 2,1", [ch.id]);
  return { ok: a.length === 6 && a.every((x) => Number(x.heures) === 8), detail: `${a.length} affectations ${page.url().split("?")[1] ?? ""}` };
});
await check(P, "Planning : heures négatives refusées", async () => {
  await page.goto("/planning?semaine=2026-10-08");
  const f = page.locator("main form", { has: page.getByRole("button", { name: "Ajouter au planning" }) });
  await f.locator('input[role="combobox"]').fill("Rénovation maison");
  await page.getByRole("listbox").getByRole("option", { name: /Rénovation maison Durand/ }).first().click();
  await f.locator('[name="date"]').fill("2026-10-08"); await f.locator('[name="heures"]').fill("-4");
  const e = await emp("salarie"); await f.locator(`input[name="employe_ids"][value="${e.id}"]`).check();
  await f.getByRole("button", { name: "Ajouter au planning" }).click(); await page.waitForTimeout(1500);
  const a = await q1("select heures from affectations where chantier_id=$1 and date='2026-10-08'", [ch.id]);
  return { ok: !a, detail: a ? `enregistré ${a.heures} h` : "refusé" };
});
record(P, "Erreurs console/serveur (planning)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
