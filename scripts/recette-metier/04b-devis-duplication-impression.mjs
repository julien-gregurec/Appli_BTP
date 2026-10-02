import { contexte, check, q, q1, capture, surveiller, fermer, record, entrepriseId, eq2, OUT } from "./lib.mjs";
import { totauxAttendus } from "./devis-helpers.mjs";
import fs from "node:fs";
const P = "S2 Prospection/Devis";
const etat = JSON.parse(fs.readFileSync(`${OUT}/etat-devis.json`, "utf8"));
const ctx = await contexte("gerant"); const page = await ctx.newPage();
const err = surveiller(page);
page.on("response", (r) => { if (r.status() === 404) err.push(`404 ${r.url()}`); });
page.on("dialog", (d) => d.accept());
const lignesD1 = [
  { quantite: 42.5, prix: 58.5, tva: 10 }, { quantite: 12.75, prix: 142, tva: 20, remise: 5 }, { quantite: 86.3, prix: 24.9, tva: 5.5 },
  { quantite: 18, prix: 22.33, tva: 10 }, { quantite: 1, prix: 389.99, tva: 20, remise: 2.5 },
];
const attD1 = totauxAttendus(lignesD1, 3);

await check(P, "Dupliquer D1 (accepté) → D2 brouillon identique en montants", async () => {
  await page.goto(`/devis/${etat.d1}`);
  await Promise.all([page.waitForURL(/\/modifier$/), page.getByRole("button", { name: "Dupliquer" }).click()]);
  etat.d2 = page.url().split("/").at(-2);
  const [a, b] = await Promise.all([q1("select numero, montant_ttc from devis where id=$1", [etat.d1]), q1("select numero, statut, montant_ttc, chantier_id from devis where id=$1", [etat.d2])]);
  const nl = (await q1("select count(*)::int n from lignes_devis where devis_id=$1", [etat.d2])).n;
  return { ok: eq2(a.montant_ttc, b.montant_ttc) && b.statut === "brouillon" && nl === 5 && !b.numero, detail: `${a.numero}→${b.numero ?? "(brouillon sans numéro)"} TTC ${a.montant_ttc}/${b.montant_ttc} lignes=${nl} chantier=${b.chantier_id ? "conservé" : "non"}` };
});
await check(P, "Modifier D2 (variante isolation 120 m²) sans impacter D1", async () => {
  await page.locator('input[title="Quantité"]').nth(2).fill("120");
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Enregistrer les modifications" }).click()]);
  const att = totauxAttendus(lignesD1.map((l, i) => (i === 2 ? { ...l, quantite: 120 } : l)), 3);
  const [a, b] = await Promise.all([q1("select montant_ttc from devis where id=$1", [etat.d1]), q1("select montant_ht, montant_ttc from devis where id=$1", [etat.d2])]);
  return { ok: eq2(a.montant_ttc, attD1.ttc) && eq2(b.montant_ttc, att.ttc) && eq2(b.montant_ht, att.ht), detail: `D1=${a.montant_ttc} (att. ${attD1.ttc}) D2=${b.montant_ttc} (att. ${att.ttc})` };
});
await check(P, "Variante D2 refusée (envoyé → refusé) : D1 reste accepté", async () => {
  await page.goto(`/devis/${etat.d2}`);
  for (const v of ["envoye", "refuse"]) { await page.locator("select").filter({ has: page.locator(`option[value="${v}"]`) }).first().selectOption(v); await page.waitForTimeout(1800); await page.reload(); }
  const [a, b] = await Promise.all([q1("select statut from devis where id=$1", [etat.d1]), q1("select statut, numero from devis where id=$1", [etat.d2])]);
  return { ok: a.statut === "accepte" && b.statut === "refuse", detail: `D1=${a.statut} D2=${b.statut} ${b.numero}` };
});

async function verifierImpression(nom, chemin, id, table, extra = {}) {
  const pr = await ctx.newPage();
  await pr.goto(chemin); await pr.waitForLoadState("networkidle");
  const t = (await pr.locator("body").innerText()).replace(/[  ]/g, " ").replace(/\s+/g, " ");
  const d = await q1(`select numero, montant_ht, montant_tva, montant_ttc, date_emission from ${table} where id=$1`, [id]);
  const fr = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n).replace(/[  ]/g, " ");
  const dateFr = new Date(d.date_emission).toLocaleDateString("fr-FR");
  const v = { vendeur: t.includes("ALSACE TEST BTP"), siretVendeur: t.includes("12345678900011"), adresseVendeur: t.includes("Strasbourg"), numero: !!d.numero && t.includes(d.numero), dateEmission: t.includes(dateFr), ht: t.includes(fr(Math.abs(d.montant_ht))), tva: t.includes(fr(Math.abs(d.montant_tva))), ttc: t.includes(fr(Math.abs(d.montant_ttc))), decennale: t.includes("DEC-TEST-0001"), pied: t.includes("données de recette synthétiques"), ...Object.fromEntries(Object.entries(extra).map(([k, re]) => [k, re.test(t)])) };
  const pdf = await pr.pdf({ format: "A4", printBackground: true });
  fs.writeFileSync(`${OUT}/${nom}.pdf`, pdf);
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  await capture(pr, `impression-${nom}`); await pr.close();
  const ko = Object.entries(v).filter(([, x]) => !x).map(([k]) => k);
  return { ok: ko.length === 0, detail: `${ko.length ? "manquants: " + ko.join(", ") : "tous présents"} · PDF ${pages} page(s) ${pdf.length} o · ${d.numero} ${dateFr}`, pages, texte: t };
}
export { verifierImpression };
await check(P, "Impression devis D1 accepté : vendeur, client, n°, date, montants, assurance, pied", async () => {
  const r = await verifierImpression("devis-D1", `/imprimer/devis/${etat.d1}`, etat.d1, "devis", { client: /SCI DES VOSGES TEST/, siretClient: /98765432100019/, validite: /valid/i });
  return r;
});
await check(P, "Impression devis brouillon : absence de numéro signalée", async () => {
  const b = await q1("select id from devis where entreprise_id=$1 and statut='brouillon' limit 1", [await entrepriseId()]);
  if (!b) return null;
  const pr = await ctx.newPage(); await pr.goto(`/imprimer/devis/${b.id}`); await pr.waitForLoadState("networkidle");
  const t = (await pr.locator("body").innerText()).replace(/\s+/g, " "); await pr.close();
  return { ok: /brouillon|provisoire|non numérot/i.test(t), detail: t.slice(0, 160) };
});
await check(P, "Pagination : devis long (60 lignes) imprimé sur plusieurs pages, totaux en fin", async () => {
  const { remplirDevis } = await import("./devis-helpers.mjs");
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "Mairie de Testheim", lignes: [{ designation: "Poste 1 — fourniture et pose", quantite: 2, prix: 10, tva: 20 }] });
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Créer le devis (brouillon)" }).click()]);
  const id = page.url().split("/").pop(); etat.dLong = id;
  await q(`insert into lignes_devis(devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
           select $1, 'Poste '||g||' — fourniture et pose', 'Description détaillée de recette pour vérifier la pagination du document.', 'fourniture', 2, 'u', 10+g, 0, 20, g from generate_series(2,60) g`, [id]);
  await q("select public.recalc_totaux_devis($1)", [id]);
  for (const v of ["envoye"]) { await page.goto(`/devis/${id}`); await page.locator("select").filter({ has: page.locator(`option[value="${v}"]`) }).first().selectOption(v); await page.waitForTimeout(1500); }
  const attHt = Array.from({ length: 60 }, (_, i) => 2 * (10 + i + 1)).reduce((s, x) => s + x, 0) - 2 * 11 + 2 * 10; // ligne 1 = 2×10
  const r = await verifierImpression("devis-long-60-lignes", `/imprimer/devis/${id}`, id, "devis", { derniereLigne: /Poste 60/ });
  const d = await q1("select montant_ht from devis where id=$1", [id]);
  return { ok: r.ok && r.pages >= 2 && eq2(d.montant_ht, attHt), detail: `${r.detail} · HT DB ${d.montant_ht} att. ${attHt} · numérotation des pages: ${/Page\s*\d+\s*(\/|sur)\s*\d+/i.test(r.texte) ? "oui" : "non"}` };
});
fs.writeFileSync(`${OUT}/etat-devis.json`, JSON.stringify(etat, null, 2));
record(P, "Erreurs console/serveur (duplication/impression)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
