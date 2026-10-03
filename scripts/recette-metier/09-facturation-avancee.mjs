// Module « Facturation avancée » (bêta, masqué en V3) activé pour ALSACE TEST BTP uniquement.
import { contexte, check, q, q1, capture, surveiller, fermer, record, OUT, eq2, r2 } from "./lib.mjs";
import { remplirDevis, totauxAttendus } from "./devis-helpers.mjs";
import fs from "node:fs";
const P = "S4 Facturation (bêta acompte/situation/avoir)";
const etat = JSON.parse(fs.readFileSync(`${OUT}/etat-factures.json`, "utf8"));
const sauver = () => fs.writeFileSync(`${OUT}/etat-factures.json`, JSON.stringify(etat, null, 2));
const ctx = await contexte("gerant"); const page = await ctx.newPage(); const err = surveiller(page);
page.on("dialog", (d) => d.accept());
const fac = (id) => q1("select numero, type, statut, montant_ht, montant_tva, montant_ttc, montant_paye, montant_retenue, facture_origine_id from factures where id=$1", [id]);
const statut = async (url, v) => { await page.goto(url); await page.locator("select").filter({ has: page.locator(`option[value="${v}"]`) }).first().selectOption(v); await page.waitForTimeout(1800); };
const lignes = [
  { designation: "Extension ossature bois", quantite: 24, prix: 610, tva: 20 },
  { designation: "Couverture zinc", quantite: 31.5, prix: 96.4, tva: 20, remise: 4 },
  { designation: "Isolation toiture", quantite: 31.5, prix: 38.2, tva: 5.5 },
];
const att = totauxAttendus(lignes, 3);
if (!etat.d5) await check(P, "Devis D5 (remise globale 3 %) créé, envoyé, accepté", async () => {
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "SCI DES VOSGES TEST", chantierNom: "Rénovation maison Durand", lignes, remiseGlobale: 3 });
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Créer le devis (brouillon)" }).click()]);
  etat.d5 = page.url().split("/").pop(); sauver();
  for (const v of ["envoye", "accepte"]) await statut(`/devis/${etat.d5}`, v);
  const d = await q1("select numero, statut, montant_ht, montant_ttc from devis where id=$1", [etat.d5]); etat.d5num = d.numero; sauver();
  return { ok: d.statut === "accepte" && eq2(d.montant_ttc, att.ttc), detail: `${d.numero} HT ${d.montant_ht} TTC ${d.montant_ttc} (att. ${att.ttc})` };
});
const avancee = async (type, pct, origine) => {
  await page.goto("/facturation-avancee");
  const f = page.locator("main form", { has: page.getByRole("button", { name: "Créer le brouillon" }) });
  const opt = await f.locator('select[name="devis_id"] option', { hasText: etat.d5num }).first().getAttribute("value");
  await f.locator('select[name="devis_id"]').selectOption(opt); await f.locator('select[name="type"]').selectOption(type);
  await f.locator('[name="pourcentage"]').fill(String(pct));
  if (origine) await f.locator('select[name="facture_origine_id"]').selectOption(origine);
  await Promise.all([page.waitForURL(/\/factures\/[0-9a-f-]{36}|error=/), f.getByRole("button", { name: "Créer le brouillon" }).click()]);
  return page.url().includes("error=") ? { erreur: decodeURIComponent(new URL(page.url()).searchParams.get("error")) } : { id: page.url().split("/").pop().split("?")[0] };
};
await check(P, "Acompte 30 % : TTC = 30 % du devis remisé", async () => {
  const r = await avancee("acompte", 30); if (r.erreur) return r.erreur;
  etat.acompte = r.id; sauver();
  const [d, f] = await Promise.all([q1("select montant_ht, montant_ttc from devis where id=$1", [etat.d5]), fac(r.id)]);
  return { ok: eq2(f.montant_ttc, r2(d.montant_ttc * 0.3), 0.03), detail: `acompte HT ${f.montant_ht} TTC ${f.montant_ttc} ; attendu ≈ ${r2(d.montant_ht * 0.3)} / ${r2(d.montant_ttc * 0.3)}` };
});
await check(P, "Acompte émis (numéro FAC, type acompte)", async () => {
  await statut(`/factures/${etat.acompte}`, "envoyee"); const f = await fac(etat.acompte);
  return { ok: f.statut === "envoyee" && !!f.numero, detail: `${f.numero} ${f.type}` };
});
await check(P, "Situation n°1 à 60 % (retenue de garantie 5 %) puis facturation", async () => {
  await page.goto("/facturation-avancee");
  const f = page.locator("main form", { has: page.getByRole("button", { name: "Calculer la situation" }) });
  const opt = await f.locator('select[name="devis_id"] option', { hasText: etat.d5num }).first().getAttribute("value");
  await f.locator('select[name="devis_id"]').selectOption(opt); await f.locator('[name="avancement_pct"]').fill("60"); await f.locator('[name="retenue_garantie_pct"]').fill("5");
  await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Calculer la situation" }).click()]); await page.waitForTimeout(1500);
  const s = await q1("select id, montant_marche_ht, montant_cumule_ht, montant_periode_ht, montant_retenue from situations_travaux where devis_id=$1 order by numero desc limit 1", [etat.d5]);
  if (!s) return `situation non créée ${page.url()}`;
  await page.goto("/facturation-avancee");
  const b = page.locator("article", { hasText: etat.d5num }).getByRole("button", { name: "Créer la facture" }).first();
  await Promise.all([page.waitForURL(/\/factures\/[0-9a-f-]{36}|error=/), b.click()]);
  etat.situation = page.url().split("/").pop().split("?")[0]; sauver();
  const fx = await fac(etat.situation);
  return { ok: eq2(fx.montant_ht, s.montant_periode_ht, 0.05), detail: `situation période HT ${s.montant_periode_ht} (marché ${s.montant_marche_ht}, retenue ${s.montant_retenue}) → facture HT ${fx.montant_ht} TTC ${fx.montant_ttc} retenue ${fx.montant_retenue}` };
});
await check(P, "Situation : l'acompte déjà facturé est déduit", async () => {
  const [a, s] = await Promise.all([fac(etat.acompte), fac(etat.situation)]);
  const d = await q1("select montant_ht from devis where id=$1", [etat.d5]);
  const attendu = r2(d.montant_ht * 0.6 - a.montant_ht);
  return { ok: eq2(s.montant_ht, attendu, 0.05), detail: `situation HT ${s.montant_ht} ; 60 % marché − acompte = ${attendu}` };
});
await check(P, "Garde-fou : acompte 80 % supplémentaire (30 + 60 + 80 > 100 %) refusé", async () => {
  const r = await avancee("acompte", 80);
  return { ok: !!r.erreur, detail: r.erreur ?? `accepté (${r.id})` };
});
await check(P, "Avoir 10 % sur l'acompte : montant négatif, lié à la facture créditée", async () => {
  const r = await avancee("avoir", 10, etat.acompte); if (r.erreur) return r.erreur;
  etat.avoir = r.id; sauver(); await statut(`/factures/${r.id}`, "envoyee");
  const [av, d] = await Promise.all([fac(r.id), q1("select montant_ttc from devis where id=$1", [etat.d5])]);
  return { ok: Number(av.montant_ttc) < 0 && av.facture_origine_id === etat.acompte && eq2(-av.montant_ttc, r2(d.montant_ttc * 0.1), 0.03), detail: `${av.numero} TTC ${av.montant_ttc} (att. −${r2(d.montant_ttc * 0.1)}) origine OK=${av.facture_origine_id === etat.acompte}` };
});
await check(P, "Reste à payer de l'acompte diminué de l'avoir (fiche facture)", async () => {
  await page.goto(`/factures/${etat.acompte}`); await page.waitForLoadState("networkidle");
  const t = (await page.locator("main").innerText()).replace(/[  ]/g, " ");
  const [a, av] = await Promise.all([fac(etat.acompte), fac(etat.avoir)]);
  const reste = r2(Number(a.montant_ttc) + Number(av.montant_ttc) - Number(a.montant_paye));
  const fr = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(reste).replace(/[  ]/g, " ");
  return { ok: t.includes(fr), detail: `reste attendu ${fr} présent=${t.includes(fr)}` };
});
await check(P, "Paiement de l'acompte au-delà du reste net d'avoir refusé", async () => {
  const [a, av] = await Promise.all([fac(etat.acompte), fac(etat.avoir)]);
  await page.goto(`/factures/${etat.acompte}`);
  const f = page.locator("main form", { has: page.locator('input[name="montant"]') });
  if (!(await f.count())) return "formulaire de paiement absent";
  await f.locator('[name="montant"]').fill(String(a.montant_ttc)); await f.locator('[name="date"]').fill("2026-10-14");
  await Promise.all([page.waitForURL(/\/factures\//), f.locator("button").last().click()]); await page.waitForTimeout(1200);
  const y = await fac(etat.acompte);
  return { ok: Number(y.montant_paye) <= r2(Number(a.montant_ttc) + Number(av.montant_ttc)) + 0.005, detail: `payé ${y.montant_paye} ; TTC ${a.montant_ttc} − avoir ${-av.montant_ttc} = ${r2(Number(a.montant_ttc) + Number(av.montant_ttc))}` };
});
await check(P, "Impression avoir : intitulé, numéro, montants, facture d'origine", async () => {
  const pr = await ctx.newPage(); await pr.goto(`/imprimer/factures/${etat.avoir}`); await pr.waitForLoadState("networkidle");
  const t = (await pr.locator("body").innerText()).replace(/[  ]/g, " ").replace(/\s+/g, " ");
  const [av, a] = await Promise.all([fac(etat.avoir), fac(etat.acompte)]);
  fs.writeFileSync(`${OUT}/avoir.pdf`, await pr.pdf({ format: "A4" })); await capture(pr, "s4-avoir-impression"); await pr.close();
  const v = { intitule: /avoir/i.test(t), numero: t.includes(av.numero), origine: t.includes(a.numero), ttc: t.includes(new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(av.montant_ttc).replace(/[  ]/g, " ")), vendeur: t.includes("12345678900011") };
  const ko = Object.entries(v).filter(([, x]) => !x).map(([k]) => k);
  return { ok: ko.length === 0, detail: ko.length ? `manquants: ${ko.join(", ")}` : "complet" };
});
await check(P, "Impression facture de situation : retenue de garantie et net à payer", async () => {
  const pr = await ctx.newPage(); await pr.goto(`/imprimer/factures/${etat.situation}`); await pr.waitForLoadState("networkidle");
  const t = (await pr.locator("body").innerText()).replace(/\s+/g, " "); await pr.close();
  return { ok: /retenue/i.test(t) && /net à payer|net a payer/i.test(t), detail: `retenue=${/retenue/i.test(t)} net=${/net à payer/i.test(t)}` };
});
sauver();
record(P, "Erreurs console/serveur (facturation avancée)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
