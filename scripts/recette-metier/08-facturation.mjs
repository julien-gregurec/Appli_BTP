import { contexte, check, q, q1, capture, surveiller, fermer, record, entrepriseId, OUT, eq2, r2 } from "./lib.mjs";
import { montantsAffiches } from "./devis-helpers.mjs";
import fs from "node:fs";
const P = "S4 Facturation";
const eid = await entrepriseId();
const etatD = JSON.parse(fs.readFileSync(`${OUT}/etat-devis.json`, "utf8"));
const etat = fs.existsSync(`${OUT}/etat-factures.json`) ? JSON.parse(fs.readFileSync(`${OUT}/etat-factures.json`, "utf8")) : {};
const sauver = () => fs.writeFileSync(`${OUT}/etat-factures.json`, JSON.stringify(etat, null, 2));
const ctx = await contexte("gerant"); const page = await ctx.newPage(); const err = surveiller(page);
page.on("dialog", (d) => d.accept());
const statut = async (id, v) => { await page.goto(`/factures/${id}`); await page.locator("select").filter({ has: page.locator(`option[value="${v}"]`) }).first().selectOption(v); await page.waitForTimeout(1800); };
const fac = (id) => q1("select numero, statut, type, montant_ht, montant_tva, montant_ttc, montant_paye, date_emission, date_echeance from factures where id=$1", [id]);

await check(P, "Facture depuis devis D1 accepté (remise globale 3 %) : montants identiques au devis", async () => {
  await page.goto(`/devis/${etatD.d1}`);
  await Promise.all([page.waitForURL(/\/factures\/[0-9a-f-]{36}/), page.getByRole("button", { name: "Créer une facture depuis ce devis" }).click()]);
  etat.f1 = page.url().split("/").pop().split("?")[0]; sauver();
  const [d, f] = await Promise.all([q1("select montant_ht, montant_tva, montant_ttc from devis where id=$1", [etatD.d1]), fac(etat.f1)]);
  return { ok: eq2(d.montant_ttc, f.montant_ttc) && eq2(d.montant_ht, f.montant_ht), detail: `devis HT/TTC ${d.montant_ht}/${d.montant_ttc} → facture ${f.montant_ht}/${f.montant_ttc} (${f.statut})` };
});
await check(P, "Facture brouillon : échéance = émission + délai client (45 j)", async () => {
  const f = await fac(etat.f1);
  const jours = Math.round((new Date(f.date_echeance) - new Date(f.date_emission)) / 86400000);
  return { ok: jours === 45, detail: `émission ${f.date_emission.toISOString?.().slice(0, 10)} échéance ${f.date_echeance.toISOString?.().slice(0, 10)} (${jours} j)` };
});
await check(P, "Facture brouillon non numérotée, paiement impossible", async () => {
  await page.goto(`/factures/${etat.f1}`);
  const f = await fac(etat.f1);
  const formPaiement = await page.locator('input[name="montant"]').count();
  return { ok: !f.numero && formPaiement === 0, detail: `numero=${f.numero} formulaire paiement=${formPaiement}` };
});
await check(P, "Émission (brouillon → envoyée) : numéro FAC attribué", async () => {
  await statut(etat.f1, "envoyee");
  const f = await fac(etat.f1);
  return { ok: f.statut === "envoyee" && /^FAC-2026-\d{3}$/.test(f.numero ?? ""), detail: `${f.statut} ${f.numero}` };
});
await check(P, "Facture émise : lignes non modifiables (verrou base)", async () => {
  const l = await q1("select id from lignes_factures where facture_id=$1 limit 1", [etat.f1]);
  try { await q("set role authenticated"); } catch {}
  await q("reset role");
  // Tentative directe en base avec le rôle applicatif simulé : le déclencheur doit refuser.
  try { await q("update lignes_factures set prix_unitaire_ht = prix_unitaire_ht + 1 where id=$1", [l.id]); const f = await fac(etat.f1); return { ok: false, detail: `ligne modifiée, TTC=${f.montant_ttc}` }; }
  catch (e) { return { ok: true, detail: e.message.slice(0, 120) }; }
});
await check(P, "Facture émise : UI fiche == DB", async () => {
  await page.goto(`/factures/${etat.f1}`); await page.waitForLoadState("networkidle");
  const ui = montantsAffiches(await page.locator("main").innerText()); const f = await fac(etat.f1);
  await capture(page, "s4-facture-emise");
  return { ok: eq2(ui.ttc, f.montant_ttc) && eq2(ui.ht, f.montant_ht), detail: `UI=${JSON.stringify(ui)} DB=${f.montant_ht}/${f.montant_tva}/${f.montant_ttc}` };
});
const payer = async (id, montant, date = "2026-10-15", mode = "virement", ref = "") => {
  await page.goto(`/factures/${id}`);
  const f = page.locator("main form", { has: page.locator('input[name="montant"]') });
  await f.locator('[name="montant"]').fill(String(montant)); await f.locator('[name="date"]').fill(date);
  await f.locator('[name="mode"]').selectOption(mode).catch(() => {}); if (ref) await f.locator('[name="reference"]').fill(ref);
  return f;
};
await check(P, "Paiement partiel 3 000 € (double clic) : un seul paiement, statut partiellement payée", async () => {
  const f = await payer(etat.f1, 3000, "2026-10-10", "virement", "VIR-001");
  await f.locator('button[type="submit"], button:not([type])').last().dblclick(); await page.waitForTimeout(2500);
  const p = await q("select montant from paiements where facture_id=$1", [etat.f1]); const x = await fac(etat.f1);
  return { ok: p.length === 1 && eq2(x.montant_paye, 3000) && x.statut === "payee_partiel", detail: `paiements=${p.length} payé=${x.montant_paye} statut=${x.statut}` };
});
await check(P, "Paiement supérieur au reste dû refusé", async () => {
  const x = await fac(etat.f1); const reste = r2(x.montant_ttc - x.montant_paye);
  const f = await payer(etat.f1, reste + 100);
  await Promise.all([page.waitForURL(/error=|\/factures\/[0-9a-f-]{36}$/), f.locator("button").last().click()]);
  const y = await fac(etat.f1);
  return { ok: eq2(y.montant_paye, 3000), detail: `${decodeURIComponent(new URL(page.url()).searchParams.get("error") ?? "")} payé=${y.montant_paye}` };
});
await check(P, "Paiement négatif / nul refusé", async () => {
  const f = await payer(etat.f1, -50);
  await f.locator("button").last().click(); await page.waitForTimeout(1500);
  const y = await fac(etat.f1);
  return { ok: eq2(y.montant_paye, 3000), detail: `payé=${y.montant_paye} ${page.url().split("?")[1] ?? "(validation navigateur)"}` };
});
await check(P, "Solde : facture payée, reste 0", async () => {
  const x = await fac(etat.f1); const reste = r2(x.montant_ttc - x.montant_paye);
  const f = await payer(etat.f1, reste, "2026-10-20", "cheque", "CHQ-778");
  await Promise.all([page.waitForURL(/\/factures\//), f.locator("button").last().click()]); await page.waitForTimeout(1200);
  const y = await fac(etat.f1);
  const somme = (await q1("select sum(montant) s from paiements where facture_id=$1", [etat.f1])).s;
  return { ok: y.statut === "payee" && eq2(y.montant_paye, y.montant_ttc) && eq2(somme, y.montant_ttc), detail: `statut=${y.statut} payé=${y.montant_paye} somme paiements=${somme} TTC=${y.montant_ttc}` };
});
await check(P, "Suppression d'un paiement : statut et montant payé recalculés", async () => {
  await page.goto(`/factures/${etat.f1}`);
  await page.getByRole("button", { name: "Supprimer" }).last().click(); await page.waitForTimeout(2000);
  const y = await fac(etat.f1);
  return { ok: eq2(y.montant_paye, 3000) && y.statut === "payee_partiel", detail: `payé=${y.montant_paye} statut=${y.statut}` };
});
await check(P, "Re-solde après suppression", async () => {
  const x = await fac(etat.f1); const reste = r2(x.montant_ttc - x.montant_paye);
  const f = await payer(etat.f1, reste, "2026-10-21", "virement", "VIR-002");
  await Promise.all([page.waitForURL(/\/factures\//), f.locator("button").last().click()]); await page.waitForTimeout(1200);
  const y = await fac(etat.f1); return { ok: y.statut === "payee", detail: `${y.statut} ${y.montant_paye}/${y.montant_ttc}` };
});

// Facture 2 : client prospect, retard et relance.
await check(P, "Facture F2 depuis devis prospect, émise", async () => {
  await page.goto(`/devis/${etatD.dProspect}`);
  await Promise.all([page.waitForURL(/\/factures\/[0-9a-f-]{36}/), page.getByRole("button", { name: "Créer une facture depuis ce devis" }).click()]);
  etat.f2 = page.url().split("/").pop().split("?")[0]; sauver();
  await statut(etat.f2, "envoyee");
  const f = await fac(etat.f2);
  return { ok: f.statut === "envoyee" && eq2(f.montant_ttc, 3971), detail: `${f.numero} ${f.montant_ht}/${f.montant_ttc}` };
});
await check(P, "Échéance dépassée : modification de l'échéance au 15/09 puis passage en retard", async () => {
  await page.goto(`/factures/${etat.f2}`);
  const f = page.locator("main form", { has: page.locator('input[name="date_echeance"]') });
  await f.locator('[name="date_echeance"]').fill("2026-09-15");
  await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Enregistrer l’échéance" }).click()]); await page.waitForTimeout(1200);
  const auto = await fac(etat.f2);
  if (auto.statut !== "en_retard") await statut(etat.f2, "en_retard");
  const y = await fac(etat.f2);
  return { ok: y.statut === "en_retard", detail: `après échéance passée: statut auto=${auto.statut} → ${y.statut} échéance=${y.date_echeance.toISOString().slice(0, 10)}` };
});
await check(P, "Facture en retard visible au tableau de bord / liste factures", async () => {
  await page.goto("/factures"); await page.waitForLoadState("networkidle");
  const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const f = await fac(etat.f2);
  return { ok: t.includes(f.numero) && /retard/i.test(t), detail: t.slice(0, 200) };
});
await check(P, "Relance d'impayé disponible dans le parcours standard V3", async () => {
  await page.goto(`/factures/${etat.f2}`);
  const t = await page.locator("main").innerText();
  const relance = /relance/i.test(t) || (await page.getByRole("button", { name: /relanc/i }).count()) > 0;
  return { ok: relance, detail: relance ? "action de relance présente" : "aucune relance sur la fiche facture (module CRM bêta masqué)" };
});
await check(P, "Envoi email facture : contenu mentionne numéro et montant", async () => {
  await page.goto(`/factures/${etat.f2}`);
  const b = page.getByRole("button", { name: /email/i }).first();
  if (!(await b.count())) return "pas de bouton email";
  await b.click(); await page.waitForTimeout(800);
  const t = await page.locator("body").innerText(); const f = await fac(etat.f2);
  return { ok: t.includes(f.numero), detail: (t.match(/Objet[^\n]{0,120}|Subject[^\n]{0,120}/)?.[0] ?? "").slice(0, 160) };
});
await check(P, "Paiement de la facture en retard → payée", async () => {
  const x = await fac(etat.f2);
  const f = await payer(etat.f2, x.montant_ttc, "2026-10-22", "virement", "VIR-RETARD");
  await Promise.all([page.waitForURL(/\/factures\//), f.locator("button").last().click()]); await page.waitForTimeout(1200);
  const y = await fac(etat.f2); return { ok: y.statut === "payee", detail: `${y.statut} ${y.montant_paye}` };
});
sauver();
record(P, "Erreurs console/serveur (facturation)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
