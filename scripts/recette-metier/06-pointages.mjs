import { contexte, check, q, q1, capture, surveiller, fermer, record, entrepriseId, COMPTES, OUT, eq2 } from "./lib.mjs";
import fs from "node:fs";
const P = "S3 Chantier";
const eid = await entrepriseId();
const { chantierId } = JSON.parse(fs.readFileSync(`${OUT}/etat-chantier.json`, "utf8"));
const salarie = await q1("select id from employes where entreprise_id=$1 and email=$2", [eid, COMPTES.salarie.email]);
const geo = { geolocation: { latitude: 48.0794, longitude: 7.3585, accuracy: 15 }, permissions: ["geolocation"] };
const ctx = await contexte("salarie", geo); const page = await ctx.newPage(); const err = surveiller(page);

if (!(await q1("select 1 x from sessions_pointage where employe_id=$1", [salarie.id]))) await check(P, "Salarié : pointer l'arrivée avec GPS simulé (Colmar)", async () => {
  await page.goto("/pointage");
  const b = page.getByRole("button", { name: "Pointer l’arrivée" });
  await b.waitFor({ timeout: 15000 });
  await capture(page, "s3-pointage-arrivee");
  await Promise.all([page.waitForURL(/succes=arrivee|error=/), b.dblclick()]);
  const s = await q("select id, chantier_id, latitude_arrivee, depart_at from sessions_pointage where employe_id=$1", [salarie.id]);
  return { ok: s.length === 1 && s[0].chantier_id === chantierId && Number(s[0].latitude_arrivee) > 48, detail: `sessions=${s.length} (double clic) ${page.url().split("?")[1]}` };
});
await check(P, "Salarié : pointer le départ après 8 h (arrivée antidatée en base pour la recette)", async () => {
  await q("update sessions_pointage set arrivee_at = now() - interval '8 hours 30 minutes' where employe_id=$1 and depart_at is null", [salarie.id]);
  await page.goto("/pointage");
  await page.locator("summary", { hasText: "Options avancées" }).click();
  await page.locator('input[name="pause_minutes"]').first().fill("30");
  const b = page.getByRole("button", { name: "Pointer le départ" }); await b.waitFor({ timeout: 15000 });
  await Promise.all([page.waitForURL(/succes=depart|error=/), b.click()]);
  const s = await q1("select depart_at, pointage_id from sessions_pointage where employe_id=$1", [salarie.id]);
  const p = s?.pointage_id ? await q1("select heures_normales, heures_supplementaires, verification_statut, latitude from pointages where id=$1", [s.pointage_id]) : null;
  const total = p ? Number(p.heures_normales) + Number(p.heures_supplementaires) : null;
  return { ok: !!s?.depart_at && total !== null && Math.abs(total - 8) < 0.05, detail: `${page.url().split("?")[1]} total=${total} pointage=${JSON.stringify(p)}` };
});
const oublie = async (date, arrivee, depart, pause, commentaire) => {
  await page.goto("/pointage");
  await page.locator("summary", { hasText: "J’ai oublié de pointer" }).click();
  const f = page.locator("main form", { has: page.getByRole("button", { name: "Transmettre pour vérification" }) });
  await f.locator('[name="date"]').fill(date);
  await f.locator('input[role="combobox"]').fill("Rénovation");
  await page.getByRole("listbox").getByRole("option", { name: /Rénovation maison Durand/ }).first().click();
  await f.locator('[name="heure_arrivee"]').fill(arrivee); await f.locator('[name="heure_depart"]').fill(depart);
  await f.locator('[name="pause_minutes"]').fill(String(pause)); await f.locator('[name="commentaire"]').fill(commentaire);
  await f.getByRole("button", { name: "Transmettre pour vérification" }).click();
  await page.waitForURL(/succes=|error=/, { timeout: 15000 }).catch(() => {});
  return new URL(page.url()).searchParams;
};
await check(P, "Salarié : déclarer un pointage oublié 01/10 07:30–16:30 pause 60 → 8 h", async () => {
  const sp = await oublie("2026-10-01", "07:30", "16:30", 60, "Oubli badge, journée maçonnerie");
  const p = await q1("select heures_normales, heures_supplementaires, heures_attendues, verification_statut, anomalie_niveau from pointages where employe_id=$1 and date='2026-10-01'", [salarie.id]);
  const total = p ? Number(p.heures_normales) + Number(p.heures_supplementaires) : null;
  return { ok: total !== null && eq2(total, 8) && p.verification_statut === "a_verifier", detail: `${sp.get("succes") ?? sp.get("error")} ${JSON.stringify(p)}` };
});
await check(P, "Pointage oublié : départ avant arrivée refusé", async () => {
  const p = await q1("select heures_normales, heures_supplementaires, anomalie_niveau from pointages where employe_id=$1 and date='2026-09-30'", [salarie.id]);
  if (!p) { const sp = await oublie("2026-09-30", "16:00", "08:00", 0, "Test incohérent"); }
  const p2 = await q1("select heures_normales, heures_supplementaires, anomalie_niveau from pointages where employe_id=$1 and date='2026-09-30'", [salarie.id]);
  return { ok: !p2 || p2.anomalie_niveau === "critique", detail: p2 ? `interprété comme poste de nuit de ${Number(p2.heures_normales) + Number(p2.heures_supplementaires)} h, anomalie ${p2.anomalie_niveau} (signalée au responsable)` : "refusé" };
});
await check(P, "Pointage oublié : date future refusée", async () => {
  const sp = await oublie("2026-10-20", "08:00", "12:00", 0, "Futur");
  const p = await q1("select 1 x from pointages where employe_id=$1 and date='2026-10-20'", [salarie.id]);
  return { ok: !p, detail: `${sp.get("error") ?? sp.get("succes")} enregistré=${!!p}` };
});
await check(P, "Pointage oublié : chevauchement même jour (07:30–16:30 puis 08:00–12:00) refusé", async () => {
  const sp = (await q1("select count(*)::int n from pointages where employe_id=$1 and date='2026-10-01'", [salarie.id])).n > 1 ? new URLSearchParams("succes=deja") : await oublie("2026-10-01", "08:00", "12:00", 0, "Doublon");
  const n = (await q1("select count(*)::int n from pointages where employe_id=$1 and date='2026-10-01'", [salarie.id])).n;
  return { ok: n === 1, detail: `${sp.get("error") ?? sp.get("succes")} pointages le 01/10=${n}` };
});
await ctx.close();

// Validation par le chef de chantier.
const ctxC = await contexte("chef"); const pc = await ctxC.newPage(); surveiller(pc);
await check(P, "Chef : voit et valide le pointage oublié du salarié", async () => {
  await pc.goto("/pointage/gestion?mois=2026-10"); await pc.waitForLoadState("networkidle");
  const t = await pc.locator("main").innerText();
  const anciens = pc.locator("summary", { hasText: "Anciennes saisies" });
  const replie = (await anciens.count()) > 0;
  if (replie) await anciens.click();
  const carte = pc.locator("main div", { hasText: "Oubli badge" }).last();
  const btn = pc.getByRole("button", { name: /Valider ce pointage|^Valider$/ }).first();
  const n = await btn.count();
  if (n) { await Promise.all([pc.waitForLoadState("networkidle"), btn.click()]); await pc.waitForTimeout(1500); }
  const p = await q1("select verification_statut, verification_par from pointages where employe_id=$1 and date='2026-10-01'", [salarie.id]);
  await capture(pc, "s3-pointage-gestion-chef");
  return { ok: p?.verification_statut === "valide", detail: `pointage oublié rangé dans « Anciennes saisies » repliées=${replie} boutons valider=${n} statut=${p?.verification_statut}` };
});
await ctxC.close();
record(P, "Erreurs console/serveur (pointages)", err.length === 0, err.join(" | "));
await fermer();
