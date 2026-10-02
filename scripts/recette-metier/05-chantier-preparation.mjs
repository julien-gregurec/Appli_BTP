import { contexte, check, q, q1, capture, surveiller, fermer, record, entrepriseId, COMPTES, OUT } from "./lib.mjs";
import fs from "node:fs";
const P = "S3 Chantier";
const eid = await entrepriseId();
const ch = await q1("select id from chantiers where entreprise_id=$1 and nom='Rénovation maison Durand'", [eid]);
const ctx = await contexte("gerant"); const page = await ctx.newPage(); const err = surveiller(page);
page.on("dialog", (d) => d.accept());
const emp = async (role) => q1("select id from employes where entreprise_id=$1 and email=$2", [eid, COMPTES[role].email]);

await check(P, "Devis accepté visible sur la fiche chantier (transformation devis → chantier)", async () => {
  await page.goto(`/chantiers/${ch.id}`); await page.waitForLoadState("networkidle");
  const t = await page.locator("main").innerText();
  return { ok: t.includes("DEV-2026-001"), detail: t.includes("DEV-2026-001") ? "DEV-2026-001 listé" : t.replace(/\s+/g, " ").slice(0, 200) };
});
await check(P, "Statut chantier prospect → en cours (synchro après acceptation ?)", async () => {
  const avant = (await q1("select statut from chantiers where id=$1", [ch.id])).statut;
  if (avant !== "en_cours") {
    const sel = page.locator("select").filter({ has: page.locator('option[value="en_cours"]') }).first();
    await sel.selectOption("en_cours"); await page.waitForTimeout(2000);
  }
  const c = await q1("select statut, date_debut_reelle from chantiers where id=$1", [ch.id]);
  return { ok: c.statut === "en_cours", detail: `avant=${avant} après=${c.statut} début réel=${c.date_debut_reelle}` };
});
for (const [role, roleCh] of [["salarie", "ouvrier"], ["chef", "chef_chantier"], ["conducteur", "conducteur_travaux"]]) {
  await check(P, `Affecter ${role} à l'équipe chantier (${roleCh})`, async () => {
    await page.goto(`/chantiers/${ch.id}`);
    const f = page.locator("main form", { has: page.getByRole("button", { name: "Affecter" }) });
    const e = await emp(role);
    await f.locator('[name="employe_id"]').selectOption(e.id); await f.locator('[name="role_chantier"]').selectOption(roleCh);
    await f.locator('[name="date_debut"]').fill("2026-09-28");
    await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Affecter" }).click()]); await page.waitForTimeout(1200);
    const r = await q1("select role_chantier, date_debut from equipes_chantiers where chantier_id=$1 and employe_id=$2", [ch.id, e.id]);
    return { ok: !!r, detail: JSON.stringify(r) };
  });
}
await check(P, "Affectation en double du même salarié refusée", async () => {
  await page.goto(`/chantiers/${ch.id}`);
  const f = page.locator("main form", { has: page.getByRole("button", { name: "Affecter" }) });
  const e = await emp("salarie");
  await f.locator('[name="employe_id"]').selectOption(e.id); await f.locator('[name="date_debut"]').fill("2026-09-28");
  await f.getByRole("button", { name: "Affecter" }).click(); await page.waitForTimeout(1500);
  const n = (await q1("select count(*)::int n from equipes_chantiers where chantier_id=$1 and employe_id=$2", [ch.id, e.id])).n;
  return { ok: n === 1, detail: `lignes équipe=${n} ${page.url().split("?")[1] ?? ""}` };
});
await check(P, "Ajouter une tâche/note chantier", async () => {
  await page.goto(`/chantiers/${ch.id}`);
  const f = page.locator("main form", { has: page.locator('[name="libelle"]') });
  await f.locator('[name="libelle"]').fill("Commander benne gravats"); await f.locator('[name="echeance"]').fill("2026-10-06");
  await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Ajouter" }).click()]); await page.waitForTimeout(1000);
  const t = await q1("select libelle, echeance from taches where chantier_id=$1 and libelle='Commander benne gravats'", [ch.id]);
  return { ok: !!t, detail: JSON.stringify(t) };
});
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
await check(P, "Activer le pointage personnel du salarié et du chef", async () => {
  for (const r of ["salarie", "chef"]) {
    await page.goto("/parametres/acces");
    const u = await q1("select id from auth.users where email=$1", [COMPTES[r].email]);
    const nom = `${COMPTES[r].prenom} ${COMPTES[r].nom}`;
    const f = page.locator("form", { hasText: nom }).filter({ has: page.locator('select[name="pointage_personnel_actif"]') }).first();
    await f.locator('select[name="pointage_personnel_actif"]').selectOption("true");
    await Promise.all([page.waitForURL(/success|error/), f.getByRole("button", { name: "Affecter" }).click()]);
  }
  const r = await q("select u.email, ue.pointage_personnel_actif from utilisateurs_entreprises ue join auth.users u on u.id=ue.utilisateur_id where u.email = any($1)", [[COMPTES.salarie.email, COMPTES.chef.email]]);
  return { ok: r.every((x) => x.pointage_personnel_actif), detail: JSON.stringify(r) };
});
fs.writeFileSync(`${OUT}/etat-chantier.json`, JSON.stringify({ chantierId: ch.id, jours }, null, 2));
record(P, "Erreurs console/serveur (préparation chantier)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
