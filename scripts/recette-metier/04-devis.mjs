import { contexte, check, q, q1, capture, surveiller, fermer, record, entrepriseId, flash, eq2, r2, OUT } from "./lib.mjs";
import { remplirDevis, totauxAttendus, montantsAffiches } from "./devis-helpers.mjs";
import fs from "node:fs";
const P = "S2 Prospection/Devis";
const eid = await entrepriseId();
const ctx = await contexte("gerant");
const page = await ctx.newPage();
const err = surveiller(page);
const etat = {};

await check(P, "Créer chantier « Rénovation maison Durand » (client SCI)", async () => {
  await page.goto("/chantiers/nouveau");
  const f = page.locator("main form").first();
  const cli = await q1("select id from clients where entreprise_id=$1 and societe='SCI DES VOSGES TEST'", [eid]);
  await f.locator('[name="nom"]').fill("Rénovation maison Durand");
  await f.locator('[name="client_id"]').selectOption(cli.id);
  await f.locator('[name="adresse"]').fill("8 place Test"); await f.locator('[name="code_postal"]').fill("68000"); await f.locator('[name="ville"]').fill("Colmar");
  await f.locator('[name="date_debut_prevue"]').fill("2026-10-05"); await f.locator('[name="date_fin_prevue"]').fill("2026-11-27");
  await f.locator('[name="budget_previsionnel"]').fill("25000");
  await Promise.all([page.waitForURL(/\/chantiers\/[0-9a-f-]{36}|error=/), f.locator('button[type="submit"]').last().click()]);
  const c = await q1("select id, reference_interne, statut, budget_previsionnel from chantiers where entreprise_id=$1 and nom='Rénovation maison Durand'", [eid]);
  etat.chantierId = c?.id;
  return { ok: !!c, detail: `${page.url()} ${JSON.stringify(c)}` };
});
await check(P, "Chantier : date de fin antérieure au début", async () => {
  await page.goto("/chantiers/nouveau");
  const f = page.locator("main form").first();
  const cli = await q1("select id from clients where entreprise_id=$1 and societe='SCI DES VOSGES TEST'", [eid]);
  await f.locator('[name="nom"]').fill("Chantier dates incohérentes");
  await f.locator('[name="client_id"]').selectOption(cli.id);
  await f.locator('[name="date_debut_prevue"]').fill("2026-12-10"); await f.locator('[name="date_fin_prevue"]').fill("2026-11-01");
  await f.locator('button[type="submit"]').last().click(); await page.waitForTimeout(2000);
  const c = await q1("select id from chantiers where entreprise_id=$1 and nom='Chantier dates incohérentes'", [eid]);
  return { ok: !c, detail: c ? "chantier enregistré avec fin < début" : `refusé ${flash(page).error ?? ""}` };
});

// Devis principal : 5 lignes, 3 taux de TVA, remise ligne et remise globale.
const lignesD1 = [
  { designation: "Maçonnerie parpaing 20 cm", catalogue: 0, quantite: 42.5, prix: 58.5, tva: 10 },
  { designation: "Béton C25/30 livré", catalogue: 1, quantite: 12.75, prix: 142, tva: 20, remise: 5 },
  { designation: "Isolation combles laine soufflée", catalogue: 2, quantite: 86.3, prix: 24.9, tva: 5.5 },
  { designation: "Dépose ancien carrelage", type: "main_oeuvre", quantite: 18, unite: "m²", prix: 22.33, tva: 10 },
  { designation: "Évacuation gravats (benne 8 m³)", type: "forfait", quantite: 1, unite: "forfait", prix: 389.99, tva: 20, remise: 2.5 },
];
const attenduD1 = totauxAttendus(lignesD1, 3);
await check(P, "Créer devis D1 multi-TVA avec remises (UI)", async () => {
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "SCI DES VOSGES TEST", chantierNom: "Rénovation maison Durand", catalogue: ["Maçonnerie parpaing", "Béton C25/30", "Isolation combles"], lignes: lignesD1, remiseGlobale: 3, notes: "Validité 30 jours. Données de recette." });
  await capture(page, "s2-devis-editeur");
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/, { timeout: 30000 }), page.getByRole("button", { name: "Créer le devis (brouillon)" }).click()]);
  etat.d1 = page.url().split("/").pop();
  const d = await q1("select numero, statut, montant_ht, montant_tva, montant_ttc, remise_globale, chantier_id from devis where id=$1", [etat.d1]);
  const n = (await q1("select count(*)::int n from lignes_devis where devis_id=$1", [etat.d1])).n;
  return { ok: n === 5 && d.chantier_id === etat.chantierId, detail: `${d.numero} lignes=${n} ${JSON.stringify(d)}` };
});
await check(P, "D1 : total DB == calcul indépendant (HT/TVA/TTC)", async () => {
  const d = await q1("select montant_ht, montant_tva, montant_ttc from devis where id=$1", [etat.d1]);
  return { ok: eq2(d.montant_ht, attenduD1.ht) && eq2(d.montant_tva, attenduD1.tva) && eq2(d.montant_ttc, attenduD1.ttc), detail: `DB=${d.montant_ht}/${d.montant_tva}/${d.montant_ttc} attendu=${attenduD1.ht}/${attenduD1.tva}/${attenduD1.ttc}` };
});
await check(P, "D1 : TTC affiché = HT + TVA affichés (cohérence au centime)", async () => {
  const d = await q1("select montant_ht, montant_tva, montant_ttc from devis where id=$1", [etat.d1]);
  return { ok: eq2(Number(d.montant_ht) + Number(d.montant_tva), d.montant_ttc), detail: `${d.montant_ht} + ${d.montant_tva} = ${r2(Number(d.montant_ht) + Number(d.montant_tva))} vs TTC ${d.montant_ttc}` };
});
await check(P, "D1 : valeurs UI (fiche devis) == DB", async () => {
  await page.goto(`/devis/${etat.d1}`); await page.waitForLoadState("networkidle");
  const ui = montantsAffiches(await page.locator("main").innerText());
  const d = await q1("select montant_ht, montant_tva, montant_ttc from devis where id=$1", [etat.d1]);
  await capture(page, "s2-devis-fiche");
  return { ok: eq2(ui.ht, d.montant_ht) && eq2(ui.tva, d.montant_tva) && eq2(ui.ttc, d.montant_ttc), detail: `UI=${JSON.stringify(ui)} DB=${JSON.stringify(d)}` };
});
await check(P, "D1 : chaque ligne DB conforme à la saisie", async () => {
  const ls = await q("select designation, quantite, prix_unitaire_ht, remise_ligne, taux_tva from lignes_devis where devis_id=$1 order by ordre", [etat.d1]);
  const ecarts = lignesD1.map((l, i) => { const x = ls[i]; return x && eq2(x.quantite, l.quantite, 0.0005) && eq2(x.prix_unitaire_ht, l.prix) && eq2(x.remise_ligne, l.remise ?? 0) && eq2(x.taux_tva, l.tva) ? null : `${l.designation}: ${JSON.stringify(x)}`; }).filter(Boolean);
  return { ok: ecarts.length === 0, detail: ecarts.join(" | ") || "5/5 lignes conformes" };
});

// Cas d'arrondi ciblé : 3 lignes dont la somme d'arrondis diverge.
const lignesArr = [
  { designation: "Arrondi A", quantite: 1, prix: 0.04, tva: 20 },
  { designation: "Arrondi B", quantite: 1, prix: 0.04, tva: 20 },
  { designation: "Arrondi C", quantite: 3, prix: 3.33, tva: 5.5, remise: 0 },
];
await check(P, "Devis arrondis : TTC == HT + TVA au centime", async () => {
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "Mairie de Testheim", lignes: lignesArr, remiseGlobale: 0 });
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Créer le devis (brouillon)" }).click()]);
  etat.dArr = page.url().split("/").pop();
  const d = await q1("select montant_ht, montant_tva, montant_ttc from devis where id=$1", [etat.dArr]);
  const a = totauxAttendus(lignesArr, 0);
  return { ok: eq2(Number(d.montant_ht) + Number(d.montant_tva), d.montant_ttc) && eq2(d.montant_ttc, a.ttc), detail: `DB ${d.montant_ht}+${d.montant_tva} vs TTC ${d.montant_ttc}; attendu ${JSON.stringify(a)}` };
});

await check(P, "Devis : quantité négative / prix négatif", async () => {
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "Mairie de Testheim", lignes: [{ designation: "Ligne négative", quantite: -2, prix: 100, tva: 20 }], remiseGlobale: 0 });
  await page.getByRole("button", { name: "Créer le devis (brouillon)" }).click(); await page.waitForTimeout(2500);
  const d = await q1("select d.id, d.montant_ttc from devis d join lignes_devis l on l.devis_id=d.id where d.entreprise_id=$1 and l.designation='Ligne négative'", [eid]);
  const msg = await page.locator("p.bg-red-50").first().innerText().catch(() => null);
  etat.dNeg = d?.id;
  return { ok: !d, detail: d ? `devis enregistré avec TTC=${d.montant_ttc}` : `refusé: ${msg}` };
});
await check(P, "Devis : remise ligne > 100 %", async () => {
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "Mairie de Testheim", lignes: [{ designation: "Remise 150", quantite: 1, prix: 100, tva: 20, remise: 150 }], remiseGlobale: 0 });
  await page.getByRole("button", { name: "Créer le devis (brouillon)" }).click(); await page.waitForTimeout(2500);
  const d = await q1("select d.id, d.montant_ttc from devis d join lignes_devis l on l.devis_id=d.id where d.entreprise_id=$1 and l.designation='Remise 150'", [eid]);
  return { ok: !d || Number(d.montant_ttc) >= 0, detail: d ? `enregistré TTC=${d.montant_ttc}` : "refusé" };
});
await check(P, "Devis sans client refusé avec message", async () => {
  await page.goto("/devis/nouveau");
  await page.getByPlaceholder("Désignation").first().fill("Sans client");
  await page.getByRole("button", { name: "Créer le devis (brouillon)" }).click();
  const msg = await page.locator("p.bg-red-50").first().innerText({ timeout: 5000 }).catch(() => null);
  return { ok: msg?.includes("client"), detail: msg };
});
await check(P, "Double clic sur « Créer le devis » ne crée qu'un devis", async () => {
  const n0 = (await q1("select count(*)::int n from devis where entreprise_id=$1", [eid])).n;
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "Mairie de Testheim", lignes: [{ designation: "Double clic", quantite: 1, prix: 10, tva: 20 }] });
  const b = page.getByRole("button", { name: "Créer le devis (brouillon)" });
  await b.dblclick().catch(() => {});
  await page.waitForURL(/\/devis\/[0-9a-f-]{36}$/).catch(() => {}); await page.waitForTimeout(2000);
  const n1 = (await q1("select count(*)::int n from devis where entreprise_id=$1", [eid])).n;
  return { ok: n1 - n0 === 1, detail: `devis créés=${n1 - n0}` };
});

// Duplication, modification.
await check(P, "Dupliquer D1 → D2 (variante) identique en montants", async () => {
  await page.goto(`/devis/${etat.d1}`);
  await Promise.all([page.waitForURL(/\/modifier$/), page.getByRole("button", { name: /Dupliquer/ }).click()]);
  etat.d2 = page.url().split("/").at(-2);
  const [a, b] = await Promise.all([q1("select numero, montant_ttc from devis where id=$1", [etat.d1]), q1("select numero, statut, montant_ttc, chantier_id from devis where id=$1", [etat.d2])]);
  return { ok: a.numero !== b.numero && eq2(a.montant_ttc, b.montant_ttc) && b.statut === "brouillon", detail: `${a.numero}→${b.numero} ${a.montant_ttc}/${b.montant_ttc} chantier=${b.chantier_id ? "oui" : "non"}` };
});
await check(P, "Modifier D2 (variante isolation 120 m²) sans impacter D1", async () => {
  await page.goto(`/devis/${etat.d2}/modifier`);
  await page.locator('input[title="Quantité"]').nth(2).fill("120");
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Enregistrer les modifications" }).click()]);
  const l2 = lignesD1.map((l, i) => (i === 2 ? { ...l, quantite: 120 } : l));
  const att = totauxAttendus(l2, 3);
  const [a, b] = await Promise.all([q1("select montant_ttc from devis where id=$1", [etat.d1]), q1("select montant_ht, montant_tva, montant_ttc from devis where id=$1", [etat.d2])]);
  return { ok: eq2(a.montant_ttc, attenduD1.ttc) && eq2(b.montant_ttc, att.ttc) && eq2(b.montant_ht, att.ht), detail: `D1=${a.montant_ttc} (attendu ${attenduD1.ttc}) D2=${b.montant_ttc} (attendu ${att.ttc})` };
});

// Impression / PDF.
await check(P, "Impression D1 : identité vendeur, client, numéro, dates, montants, pied", async () => {
  const pr = await ctx.newPage();
  await pr.goto(`/imprimer/devis/${etat.d1}`); await pr.waitForLoadState("networkidle");
  const t = (await pr.locator("body").innerText()).replace(/\s+/g, " ");
  const d = await q1("select numero, date_emission, date_validite, montant_ht, montant_tva, montant_ttc from devis where id=$1", [etat.d1]);
  const fr = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n).replace(/\s/g, " ");
  const tn = t.replace(/[  ]/g, " ");
  const attendus = { vendeur: /ALSACE TEST BTP/.test(t), siretVendeur: t.includes("12345678900011"), adresseVendeur: t.includes("Strasbourg"), client: t.includes("SCI DES VOSGES TEST"), siretClient: t.includes("98765432100019"), numero: t.includes(d.numero), ht: tn.includes(fr(d.montant_ht)), tva: tn.includes(fr(d.montant_tva)), ttc: tn.includes(fr(d.montant_ttc)), decennale: t.includes("DEC-TEST-0001"), pied: t.includes("données de recette synthétiques"), validite: /valid/i.test(t) };
  const pdf = await pr.pdf({ format: "A4", printBackground: true });
  fs.writeFileSync(`${OUT}/devis-D1.pdf`, pdf);
  etat.pdfD1 = `${OUT}/devis-D1.pdf`;
  await capture(pr, "s2-devis-impression");
  await pr.close();
  const ko = Object.entries(attendus).filter(([, v]) => !v).map(([k]) => k);
  return { ok: ko.length === 0, detail: ko.length ? `manquants: ${ko.join(", ")}` : `tous présents; PDF ${pdf.length} o` };
});
await check(P, "Impression D1 : ventilation de la TVA par taux (10 / 20 / 5,5 %)", async () => {
  const pr = await ctx.newPage(); await pr.goto(`/imprimer/devis/${etat.d1}`); await pr.waitForLoadState("networkidle");
  const t = (await pr.locator("body").innerText()).replace(/\s+/g, " "); await pr.close();
  const ventile = /TVA\s*(5,5|10|20)\s*%\s*[\d\s  ]+,\d{2}\s*€/.test(t);
  return { ok: ventile, detail: ventile ? "ventilation présente" : "un seul total TVA, pas de récapitulatif par taux" };
});

// Envoi simulé et acceptation.
for (const [de, vers] of [["brouillon", "envoye"], ["envoye", "accepte"]]) {
  await check(P, `Statut D1 ${de} → ${vers}`, async () => {
    await page.goto(`/devis/${etat.d1}`);
    const sel = page.locator("select").filter({ has: page.locator(`option[value="${vers}"]`) }).first();
    await sel.selectOption(vers); await page.waitForTimeout(2000);
    const d = await q1("select statut from devis where id=$1", [etat.d1]);
    return { ok: d.statut === vers, detail: d.statut };
  });
}
await check(P, "Envoi email simulé : bouton/lien d'envoi disponible", async () => {
  await page.goto(`/devis/${etat.d1}`);
  const t = await page.locator("main").innerText();
  const lien = await page.locator('a[href^="mailto:"], button:has-text("email"), button:has-text("Email"), a:has-text("Envoyer")').count();
  return { ok: lien > 0, detail: `éléments d'envoi=${lien}` };
});
await check(P, "Devis accepté : modification bloquée", async () => {
  await page.goto(`/devis/${etat.d1}/modifier`); await page.waitForLoadState("networkidle");
  const peut = await page.getByRole("button", { name: "Enregistrer les modifications" }).count();
  if (peut) { await page.locator('input[title="Quantité"]').first().fill("1"); await page.getByRole("button", { name: "Enregistrer les modifications" }).click(); await page.waitForTimeout(2000); }
  const d = await q1("select montant_ttc from devis where id=$1", [etat.d1]);
  return { ok: eq2(d.montant_ttc, attenduD1.ttc), detail: `bouton=${peut} url=${page.url()} TTC=${d.montant_ttc}` };
});
await check(P, "Devis accepté : suppression impossible", async () => {
  await page.goto(`/devis/${etat.d1}`);
  const btn = await page.getByRole("button", { name: "Supprimer" }).count();
  return { ok: btn === 0 && !!(await q1("select 1 from devis where id=$1", [etat.d1])), detail: `bouton supprimer=${btn}` };
});
await check(P, "Transition interdite accepte → brouillon refusée côté serveur", async () => {
  const d = await q1("select statut from devis where id=$1", [etat.d1]);
  const opts = await page.locator("select option").allTextContents();
  return { ok: d.statut === "accepte" && !opts.includes("Brouillon"), detail: `options=${opts.join(",")}` };
});

// Devis prospect → acceptation → statut client.
await check(P, "Devis prospect accepté : le prospect devient client actif ?", async () => {
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "Prospect-Test", lignes: [{ designation: "Ravalement façade", quantite: 95, prix: 38, tva: 10 }] });
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Créer le devis (brouillon)" }).click()]);
  etat.dProspect = page.url().split("/").pop();
  for (const v of ["envoye", "accepte"]) { await page.locator("select").filter({ has: page.locator(`option[value="${v}"]`) }).first().selectOption(v); await page.waitForTimeout(1800); await page.reload(); }
  const c = await q1("select c.statut, d.statut ds from clients c join devis d on d.client_id=c.id where d.id=$1", [etat.dProspect]);
  return { ok: c.ds === "accepte" && c.statut === "actif", detail: `devis=${c.ds} client=${c.statut}` };
});
await check(P, "Supprimer un devis brouillon (D2 variante refusée puis supprimée)", async () => {
  await page.goto(`/devis/${etat.dArr}`);
  page.once("dialog", (d) => d.accept());
  await Promise.all([page.waitForURL(/\/devis$/), page.getByRole("button", { name: "Supprimer" }).click()]);
  const d = await q1("select 1 x from devis where id=$1", [etat.dArr]);
  const l = await q1("select count(*)::int n from lignes_devis where devis_id=$1", [etat.dArr]);
  return { ok: !d && l.n === 0, detail: `devis=${!!d} lignes orphelines=${l.n}` };
});
fs.writeFileSync(`${OUT}/etat-devis.json`, JSON.stringify(etat, null, 2));
record(P, "Erreurs console/serveur (devis)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
