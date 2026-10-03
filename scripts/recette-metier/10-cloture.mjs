import { contexte, check, q, q1, capture, surveiller, fermer, record, OUT, eq2, r2, entrepriseId } from "./lib.mjs";
import { remplirDevis } from "./devis-helpers.mjs";
import fs from "node:fs";
const P = "S4 Facturation";
const eid = await entrepriseId();
const etat = JSON.parse(fs.readFileSync(`${OUT}/etat-factures.json`, "utf8"));
const { chantierId } = JSON.parse(fs.readFileSync(`${OUT}/etat-chantier.json`, "utf8"));
const ctx = await contexte("gerant"); const page = await ctx.newPage(); const err = surveiller(page);
page.on("dialog", (d) => d.accept());
const statut = async (url, v) => { await page.goto(url); const s = page.locator("select").filter({ has: page.locator(`option[value="${v}"]`) }); if (!(await s.count())) return false; await s.first().selectOption(v); await page.waitForTimeout(1800); return true; };

await check(P, "Impression facture F1 : mentions facture (échéance, pénalités 10 %, indemnité 40 €, client, n°)", async () => {
  const pr = await ctx.newPage(); await pr.goto(`/imprimer/factures/${etat.f1}`); await pr.waitForLoadState("networkidle");
  const t = (await pr.locator("body").innerText()).replace(/[  ]/g, " ").replace(/\s+/g, " ");
  const f = await q1("select numero, montant_ttc, date_echeance from factures where id=$1", [etat.f1]);
  const pdf = await pr.pdf({ format: "A4" }); fs.writeFileSync(`${OUT}/facture-F1.pdf`, pdf); await capture(pr, "s4-facture-impression"); await pr.close();
  const ech = f.date_echeance.toISOString().slice(0, 10).split("-").reverse().join("/");
  const v = { numero: t.includes(f.numero), client: t.includes("SCI DES VOSGES TEST"), vendeurSiret: t.includes("12345678900011"), echeance: t.includes(ech), penalites: /Pénalités de retard : 10 %/.test(t), indemnite: /40 €/.test(t), ttc: t.includes(new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(f.montant_ttc).replace(/[  ]/g, " ")), decennale: t.includes("DEC-TEST-0001"), pied: t.includes("données de recette synthétiques") };
  const ko = Object.entries(v).filter(([, x]) => !x).map(([k]) => k);
  return { ok: ko.length === 0, detail: ko.length ? `manquants: ${ko.join(", ")}` : `complet (${f.numero}, échéance ${ech})` };
});
await check(P, "Facture émise annulée directement sans avoir (conformité)", async () => {
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "Mairie de Testheim", lignes: [{ designation: "Réparation muret", quantite: 1, prix: 850, tva: 20 }] });
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Créer le devis (brouillon)" }).click()]);
  const d = page.url().split("/").pop();
  for (const v of ["envoye", "accepte"]) await statut(`/devis/${d}`, v);
  await page.goto(`/devis/${d}`);
  await Promise.all([page.waitForURL(/\/factures\/[0-9a-f-]{36}/), page.getByRole("button", { name: "Créer une facture depuis ce devis" }).click()]);
  const f = page.url().split("/").pop().split("?")[0]; etat.fAnnul = f;
  await statut(`/factures/${f}`, "envoyee");
  const possible = await statut(`/factures/${f}`, "annulee");
  const x = await q1("select numero, statut from factures where id=$1", [f]);
  return { ok: x.statut !== "annulee", detail: `option « Annulée » proposée=${possible} ; ${x.numero} statut=${x.statut} (une facture émise ne devrait être neutralisée que par avoir)` };
});
await check(P, "Numérotation des factures continue et sans doublon", async () => {
  const r = await q("select numero from factures where entreprise_id=$1 and numero is not null order by numero", [eid]);
  const nums = r.map((x) => Number(x.numero.split("-").pop()));
  const trous = nums.filter((n, i) => i > 0 && n !== nums[i - 1] + 1);
  return { ok: trous.length === 0 && new Set(nums).size === nums.length, detail: r.map((x) => x.numero).join(", ") };
});
await check(P, "Rentabilité chantier après facturation : CA HT, main-d'œuvre, achats (UI == calcul DB)", async () => {
  await page.goto("/rentabilite"); await page.waitForLoadState("networkidle");
  const t = (await page.locator("main").innerText()).replace(/[  ]/g, " ").replace(/\s+/g, " ");
  const ca = await q1("select coalesce(sum(montant_ht),0) s from factures where chantier_id=$1 and statut not in ('brouillon','annulee')", [chantierId]);
  const mo = await q1("select coalesce(sum((p.heures_normales+p.heures_supplementaires)*e.cout_horaire),0) s from pointages p join employes e on e.id=p.employe_id where p.chantier_id=$1 and p.verification_statut<>'rejete'", [chantierId]);
  const ach = await q1("select coalesce(sum(montant_ht),0) s from depenses_fournisseurs where chantier_id=$1", [chantierId]);
  const fr = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n).replace(/[  ]/g, " ");
  fs.writeFileSync(`${OUT}/rentabilite-finale.txt`, t); await capture(page, "s4-rentabilite");
  const v = { ca: t.includes(fr(ca.s)), mo: t.includes(fr(mo.s)), achats: t.includes(fr(ach.s)) };
  return { ok: v.ca && v.mo && v.achats, detail: `DB CA ${ca.s} MO ${mo.s} achats ${ach.s} ; présents UI ${JSON.stringify(v)}` };
});
await check(P, "Clôture : chantier passé en « terminé »", async () => {
  await page.goto(`/chantiers/${chantierId}`);
  const s = page.locator("select").filter({ has: page.locator('option[value="termine"]') }).first();
  if (!(await s.count())) return "pas d'option terminé";
  await s.selectOption("termine"); await page.waitForTimeout(2000);
  const c = await q1("select statut, date_fin_reelle from chantiers where id=$1", [chantierId]);
  return { ok: c.statut === "termine", detail: `${c.statut} fin réelle=${c.date_fin_reelle?.toISOString?.().slice(0, 10) ?? null}` };
});
await check(P, "Clôture : chantier terminé avec factures non soldées signalé", async () => {
  const r = await q("select numero, type, montant_ttc, montant_paye from factures where chantier_id=$1 and statut not in ('payee','annulee','brouillon') and type<>'avoir'", [chantierId]);
  await page.goto(`/chantiers/${chantierId}`); const t = await page.locator("main").innerText();
  return { ok: r.length === 0 || /reste|impay|à encaisser/i.test(t), detail: `factures ouvertes: ${r.map((x) => `${x.numero} ${x.montant_paye}/${x.montant_ttc}`).join(", ") || "aucune"}` };
});
fs.writeFileSync(`${OUT}/etat-factures.json`, JSON.stringify(etat, null, 2));
record(P, "Erreurs console/serveur (clôture)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
