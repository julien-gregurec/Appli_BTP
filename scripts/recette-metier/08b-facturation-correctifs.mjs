import { contexte, check, q, q1, surveiller, fermer, record, OUT, eq2, r2 } from "./lib.mjs";
import { remplirDevis, totauxAttendus } from "./devis-helpers.mjs";
import fs from "node:fs";
const P = "S4 Facturation";
const etat = JSON.parse(fs.readFileSync(`${OUT}/etat-factures.json`, "utf8"));
const ctx = await contexte("gerant"); const page = await ctx.newPage(); const err = surveiller(page);
page.on("dialog", (d) => d.accept());
const lignes = [
  { designation: "Chape fluide", quantite: 64.4, prix: 31.75, tva: 10, remise: 2.5 },
  { designation: "Carrelage grès 60x60", quantite: 58, prix: 47.9, tva: 10 },
  { designation: "Plinthes", quantite: 41.3, prix: 12.15, tva: 20, remise: 7 },
];
const att = totauxAttendus(lignes, 5);
await check(P, "Correctif B16 : facture depuis devis à remise globale 5 % = montants du devis au centime", async () => {
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "SCI DES VOSGES TEST", chantierNom: "Rénovation maison Durand", lignes, remiseGlobale: 5 });
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Créer le devis (brouillon)" }).click()]);
  const d = page.url().split("/").pop(); etat.d3 = d;
  for (const v of ["envoye", "accepte"]) { await page.goto(`/devis/${d}`); await page.locator("select").filter({ has: page.locator(`option[value="${v}"]`) }).first().selectOption(v); await page.waitForTimeout(1800); }
  await page.goto(`/devis/${d}`);
  await Promise.all([page.waitForURL(/\/factures\/[0-9a-f-]{36}/), page.getByRole("button", { name: "Créer une facture depuis ce devis" }).click()]);
  etat.f3 = page.url().split("/").pop().split("?")[0];
  const [dv, f] = await Promise.all([q1("select montant_ht, montant_tva, montant_ttc from devis where id=$1", [d]), q1("select montant_ht, montant_tva, montant_ttc from factures where id=$1", [etat.f3])]);
  return { ok: eq2(dv.montant_ttc, f.montant_ttc) && eq2(dv.montant_ht, f.montant_ht) && eq2(dv.montant_tva, f.montant_tva) && eq2(dv.montant_ttc, att.ttc), detail: `attendu ${att.ht}/${att.tva}/${att.ttc} devis ${dv.montant_ht}/${dv.montant_tva}/${dv.montant_ttc} facture ${f.montant_ht}/${f.montant_tva}/${f.montant_ttc}` };
});
await check(P, "Correctif B17 : double clic sur l'enregistrement d'un paiement → un seul paiement", async () => {
  await page.goto(`/factures/${etat.f3}`); await page.locator("select").filter({ has: page.locator('option[value="envoyee"]') }).first().selectOption("envoyee"); await page.waitForTimeout(1800);
  await page.goto(`/factures/${etat.f3}`);
  const f = page.locator("main form", { has: page.locator('input[name="montant"]') });
  await f.locator('[name="montant"]').fill("1000"); await f.locator('[name="date"]').fill("2026-10-12");
  await f.locator("button").last().dblclick(); await page.waitForTimeout(3000);
  const p = await q("select montant from paiements where facture_id=$1", [etat.f3]);
  const x = await q1("select montant_paye, statut from factures where id=$1", [etat.f3]);
  return { ok: p.length === 1 && eq2(x.montant_paye, 1000), detail: `paiements=${p.length} payé=${x.montant_paye} ${x.statut} ${decodeURIComponent(new URL(page.url()).searchParams.get("error") ?? "")}` };
});
await check(P, "Paiement direct en base au-delà du reste dû refusé (verrou base)", async () => {
  const x = await q1("select montant_ttc, montant_paye from factures where id=$1", [etat.f3]);
  try { await q("insert into paiements(facture_id, montant, date, mode) values ($1, $2, '2026-10-13', 'virement')", [etat.f3, r2(x.montant_ttc - x.montant_paye + 50)]); return "accepté"; }
  catch (e) { return { ok: true, detail: e.message }; }
});
await check(P, "Deux paiements légitimes distincts le même jour restent possibles", async () => {
  await page.goto(`/factures/${etat.f3}`);
  const f = page.locator("main form", { has: page.locator('input[name="montant"]') });
  await f.locator('[name="montant"]').fill("500"); await f.locator('[name="date"]').fill("2026-10-12"); await f.locator('[name="reference"]').fill("CHQ-2");
  await Promise.all([page.waitForURL(/\/factures\//), f.locator("button").last().click()]); await page.waitForTimeout(1200);
  const x = await q1("select montant_paye from factures where id=$1", [etat.f3]);
  return { ok: eq2(x.montant_paye, 1500), detail: `payé=${x.montant_paye}` };
});
fs.writeFileSync(`${OUT}/etat-factures.json`, JSON.stringify(etat, null, 2));
record(P, "Erreurs console/serveur (correctifs facturation)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
